"""
Temporal workflow: PolymarketWorkflow

Daily cron at 14:00 UTC (7am Pacific):
  1. Fetch Polymarket markets resolving in 24-48 hours
  2. LLM picks the most interesting one
  3. Post Discord poll + launch CongressWorkflow simultaneously
  4. Wait 12 hours
  5. Tally votes (Discord reactions + Congress verdict)
  6. If 3+ yea: place $5 YES bet on Polymarket
  7. If 3+ nay: skip market, try next from same batch
  8. No consensus: no action
  9. After market resolves: post outcome + P&L to Discord

Cron schedule: 0 14 * * * (UTC = 7am PT)
NOTE: Cron is NOT auto-activated — jaboostin must confirm before enabling.
"""

import asyncio
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError

with workflow.unsafe.imports_passed_through():
    from activities.polymarket_act import (
        check_market_resolution,
        fetch_polymarket_markets,
        get_congress_verdict,
        get_vote_tally,
        launch_congress_on_market,
        pick_market_with_llm,
        place_polymarket_bet,
        post_market_poll,
        post_resolution_notification,
        post_vote_result_notification,
    )
    from activities.constants import MAIN_CHANNEL_ID

_SHORT = timedelta(seconds=30)
_MEDIUM = timedelta(minutes=5)
_LONG = timedelta(minutes=10)
_CONGRESS_TIMEOUT = timedelta(hours=2)
_IO_RETRY = RetryPolicy(maximum_attempts=3, backoff_coefficient=2.0)
_NO_RETRY = RetryPolicy(maximum_attempts=1)

# Max markets to try before giving up
MAX_MARKET_ATTEMPTS = 3

# Max resolution check attempts (once per hour for 48h)
MAX_RESOLUTION_CHECKS = 48


@workflow.defn
class PolymarketWorkflow:
    """
    Daily Polymarket betting workflow.

    Cron schedule: 0 14 * * * UTC (7am Pacific).
    Do NOT activate automatically — requires jaboostin confirmation.
    """

    @workflow.run
    async def run(self) -> dict:
        workflow.logger.info("PolymarketWorkflow: starting daily run")

        # ------------------------------------------------------------------ #
        # 1. Fetch markets resolving in 24-48 hours
        # ------------------------------------------------------------------ #
        try:
            markets = await workflow.execute_activity(
                fetch_polymarket_markets,
                args=[24, 48, 20],
                start_to_close_timeout=_MEDIUM,
                retry_policy=_IO_RETRY,
            )
        except ActivityError as exc:
            workflow.logger.error("fetch_polymarket_markets failed: %s", exc)
            return {"error": f"fetch failed: {exc}"}

        if not markets:
            workflow.logger.info("PolymarketWorkflow: no markets found in 24-48h window")
            return {"markets_found": 0, "action": "no_markets"}

        workflow.logger.info("PolymarketWorkflow: fetched %d candidate markets", len(markets))

        # Keep the full market list for retry attempts
        all_markets = list(markets)
        excluded_ids: list[str] = []
        nay_markets: list[dict] = []

        for attempt in range(MAX_MARKET_ATTEMPTS):
            workflow.logger.info("PolymarketWorkflow: market selection attempt %d", attempt + 1)

            # ------------------------------------------------------------------ #
            # 2. LLM picks the most interesting market (excluding already-tried)
            # ------------------------------------------------------------------ #
            try:
                market = await workflow.execute_activity(
                    pick_market_with_llm,
                    args=[all_markets, excluded_ids],
                    start_to_close_timeout=_MEDIUM,
                    retry_policy=_IO_RETRY,
                )
            except ActivityError as exc:
                workflow.logger.error("pick_market_with_llm failed: %s", exc)
                return {"error": f"market pick failed: {exc}"}

            condition_id = market.get("condition_id", "")
            question = market.get("question", "")
            workflow.logger.info(
                "PolymarketWorkflow: picked market condition_id=%s question=%s",
                condition_id, question[:80],
            )

            # ------------------------------------------------------------------ #
            # 3. Post Discord poll + launch Congress simultaneously
            # ------------------------------------------------------------------ #
            try:
                poll_message_id = await workflow.execute_activity(
                    post_market_poll,
                    market,
                    start_to_close_timeout=_SHORT,
                    retry_policy=_IO_RETRY,
                )
            except ActivityError as exc:
                workflow.logger.error("post_market_poll failed: %s", exc)
                return {"error": f"poll post failed: {exc}"}

            workflow.logger.info("PolymarketWorkflow: poll posted message_id=%s", poll_message_id)

            # Launch Congress (fire-and-forget style — we'll wait for it separately)
            congress_run_id: str = ""
            try:
                congress_run_id = await workflow.execute_activity(
                    launch_congress_on_market,
                    args=[market, MAIN_CHANNEL_ID],
                    start_to_close_timeout=_SHORT,
                    retry_policy=_IO_RETRY,
                )
                workflow.logger.info("PolymarketWorkflow: Congress launched run_id=%s", congress_run_id)
            except ActivityError as exc:
                workflow.logger.warning("launch_congress_on_market failed (non-fatal): %s", exc)
                # Congress failure doesn't block — just no congress vote

            # ------------------------------------------------------------------ #
            # 4. Wait 12 hours
            # ------------------------------------------------------------------ #
            workflow.logger.info("PolymarketWorkflow: sleeping 12 hours for vote window")
            await asyncio.sleep(12 * 3600)

            # ------------------------------------------------------------------ #
            # 5. Get Congress verdict (should be done by now; 30min timeout)
            # ------------------------------------------------------------------ #
            congress_verdict: str = ""
            if congress_run_id:
                try:
                    congress_verdict = await workflow.execute_activity(
                        get_congress_verdict,
                        args=[congress_run_id, condition_id, 1800],  # 30min timeout
                        start_to_close_timeout=timedelta(minutes=35),
                        retry_policy=_NO_RETRY,
                    )
                    workflow.logger.info("PolymarketWorkflow: Congress verdict=%s", congress_verdict[:100])
                except ActivityError as exc:
                    workflow.logger.warning("get_congress_verdict failed (non-fatal): %s", exc)
                    congress_verdict = ""

            # ------------------------------------------------------------------ #
            # 5b. Tally votes
            # ------------------------------------------------------------------ #
            try:
                tally = await workflow.execute_activity(
                    get_vote_tally,
                    args=[poll_message_id, congress_verdict],
                    start_to_close_timeout=_SHORT,
                    retry_policy=_IO_RETRY,
                )
            except ActivityError as exc:
                workflow.logger.error("get_vote_tally failed: %s", exc)
                return {"error": f"vote tally failed: {exc}"}

            yea = tally.get("yea", 0)
            nay = tally.get("nay", 0)
            workflow.logger.info(
                "PolymarketWorkflow: tally yea=%d nay=%d congress=%s",
                yea, nay, tally.get("congress_vote"),
            )

            # ------------------------------------------------------------------ #
            # 6. Decision: 3+ yea → bet YES; 3+ nay → skip; else no action
            # ------------------------------------------------------------------ #
            if yea >= 3:
                # Place the bet
                workflow.logger.info("PolymarketWorkflow: 3+ yea — placing YES bet")
                await workflow.execute_activity(
                    post_vote_result_notification,
                    args=[market, tally, "bet_yes"],
                    start_to_close_timeout=_SHORT,
                    retry_policy=_IO_RETRY,
                )

                try:
                    order_id = await workflow.execute_activity(
                        place_polymarket_bet,
                        args=[market, "YES", 5.0],
                        start_to_close_timeout=_LONG,
                        retry_policy=RetryPolicy(maximum_attempts=2),
                    )
                    workflow.logger.info("PolymarketWorkflow: bet placed order_id=%s", order_id)
                except ActivityError as exc:
                    workflow.logger.error("place_polymarket_bet failed: %s", exc)
                    return {"error": f"bet placement failed: {exc}", "market": question}

                # ------------------------------------------------------------------ #
                # 9. Poll for resolution and post outcome
                # ------------------------------------------------------------------ #
                bet_side = "YES"
                for check_num in range(MAX_RESOLUTION_CHECKS):
                    await asyncio.sleep(3600)  # check every hour
                    try:
                        outcome = await workflow.execute_activity(
                            check_market_resolution,
                            condition_id,
                            start_to_close_timeout=_SHORT,
                            retry_policy=_IO_RETRY,
                        )
                        if outcome.get("resolved"):
                            await workflow.execute_activity(
                                post_resolution_notification,
                                args=[market, outcome, bet_side, order_id, 5.0],
                                start_to_close_timeout=_SHORT,
                                retry_policy=_IO_RETRY,
                            )
                            workflow.logger.info(
                                "PolymarketWorkflow: market resolved winner=%s",
                                outcome.get("winner"),
                            )
                            return {
                                "action": "bet_placed",
                                "market": question,
                                "order_id": order_id,
                                "winner": outcome.get("winner"),
                                "resolved": True,
                            }
                    except ActivityError as exc:
                        workflow.logger.warning(
                            "check_market_resolution attempt %d failed: %s", check_num + 1, exc
                        )

                # Market didn't resolve in time — post final unresolved notice
                try:
                    await workflow.execute_activity(
                        post_resolution_notification,
                        args=[market, {"resolved": False, "winner": None}, bet_side, order_id, 5.0],
                        start_to_close_timeout=_SHORT,
                        retry_policy=_IO_RETRY,
                    )
                except ActivityError as exc:
                    workflow.logger.warning("post_resolution_notification (unresolved) failed: %s", exc)

                return {
                    "action": "bet_placed",
                    "market": question,
                    "order_id": order_id,
                    "resolved": False,
                }

            elif nay >= 3:
                # Skip this market and try the next one
                workflow.logger.info("PolymarketWorkflow: 3+ nay — skipping market, trying next")
                await workflow.execute_activity(
                    post_vote_result_notification,
                    args=[market, tally, "skip"],
                    start_to_close_timeout=_SHORT,
                    retry_policy=_IO_RETRY,
                )
                nay_markets.append(market)
                excluded_ids.append(condition_id)
                # Continue to next attempt
                continue

            else:
                # No consensus
                workflow.logger.info(
                    "PolymarketWorkflow: no consensus (yea=%d nay=%d) — no action", yea, nay
                )
                await workflow.execute_activity(
                    post_vote_result_notification,
                    args=[market, tally, "no_consensus"],
                    start_to_close_timeout=_SHORT,
                    retry_policy=_IO_RETRY,
                )
                return {
                    "action": "no_consensus",
                    "market": question,
                    "yea": yea,
                    "nay": nay,
                }

        # Exhausted all attempts
        workflow.logger.warning(
            "PolymarketWorkflow: exhausted %d market attempts without placing a bet",
            MAX_MARKET_ATTEMPTS,
        )
        return {
            "action": "exhausted_attempts",
            "attempts": MAX_MARKET_ATTEMPTS,
            "nay_markets": [m.get("question", "") for m in nay_markets],
        }
