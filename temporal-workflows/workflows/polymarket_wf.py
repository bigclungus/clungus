"""
Temporal workflow: PolymarketWorkflow

Daily cron at 14:00 UTC (7am Pacific):
  1. Fetch Polymarket markets resolving in 24-48 hours
  2. LLM picks the most interesting one
  3. Post Discord poll + launch CongressWorkflow (polymarket flavor) simultaneously
  4. Wait 12 hours
  5. Tally votes — Discord 👍/👎/⏭️ + per-persona BET_YES/BET_NO/DO_NOT_BET votes
  6. Any DO_NOT_BET (Discord or persona) → pass on this market and try next
  7. yes > no (majority BET_YES) → open $5 YES position on Polymarket
  8. no >= yes (majority BET_NO / tied) → pass on market, try next from same batch
  9. If all 0 (no votes): no action
 10. After market resolves: post outcome + P&L to Discord

Cron schedule: 0 14 * * * (UTC = 7am PT)
NOTE: Cron is NOT auto-activated — jaboostin must confirm before enabling.
"""

import asyncio
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError

# Congress integration enabled — personas vote alongside Discord reactions.
USE_CONGRESS = True

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

            congress_workflow_id: str = ""
            if USE_CONGRESS:
                try:
                    congress_workflow_id = await workflow.execute_activity(
                        launch_congress_on_market,
                        args=[market, MAIN_CHANNEL_ID],
                        start_to_close_timeout=_SHORT,
                        retry_policy=_IO_RETRY,
                    )
                    workflow.logger.info("PolymarketWorkflow: Congress launched workflow_id=%s", congress_workflow_id)
                except ActivityError as exc:
                    workflow.logger.warning("launch_congress_on_market failed (non-fatal): %s", exc)
                    # Congress failure doesn't block — just no congress vote

            # ------------------------------------------------------------------ #
            # 4. Wait 12 hours
            # ------------------------------------------------------------------ #
            workflow.logger.info("PolymarketWorkflow: sleeping 12 hours for vote window")
            await asyncio.sleep(12 * 3600)

            # ------------------------------------------------------------------ #
            # 5. Get Congress verdict (if congress ran)
            # ------------------------------------------------------------------ #
            congress_result: dict = {"persona_yes": 0, "persona_no": 0, "persona_skip": 0}
            if USE_CONGRESS and congress_workflow_id:
                try:
                    congress_result = await workflow.execute_activity(
                        get_congress_verdict,
                        args=[congress_workflow_id, condition_id, 1800],  # 30min timeout
                        start_to_close_timeout=timedelta(minutes=35),
                        retry_policy=_NO_RETRY,
                    )
                    workflow.logger.info(
                        "PolymarketWorkflow: Congress persona_yes=%d persona_no=%d persona_skip=%d",
                        congress_result.get("persona_yes", 0),
                        congress_result.get("persona_no", 0),
                        congress_result.get("persona_skip", 0),
                    )
                except ActivityError as exc:
                    workflow.logger.warning("get_congress_verdict failed (non-fatal): %s", exc)
                    congress_result = {"persona_yes": 0, "persona_no": 0, "persona_skip": 0}

            # ------------------------------------------------------------------ #
            # 5b. Tally votes
            # ------------------------------------------------------------------ #
            try:
                tally = await workflow.execute_activity(
                    get_vote_tally,
                    args=[poll_message_id, congress_result],
                    start_to_close_timeout=_SHORT,
                    retry_policy=_IO_RETRY,
                )
            except ActivityError as exc:
                workflow.logger.error("get_vote_tally failed: %s", exc)
                return {"error": f"vote tally failed: {exc}"}

            yes = tally.get("yes", 0)
            no = tally.get("no", 0)
            workflow.logger.info(
                "PolymarketWorkflow: tally yes=%d no=%d skip=%d "
                "(discord_yes=%d persona_yes=%d discord_no=%d persona_no=%d "
                "discord_skip=%d persona_skip=%d)",
                yes, no, tally.get("skip", 0),
                tally.get("discord_yes", 0), tally.get("persona_yes", 0),
                tally.get("discord_no", 0), tally.get("persona_no", 0),
                tally.get("discord_skip", 0), tally.get("persona_skip", 0),
            )

            # ------------------------------------------------------------------ #
            # 6. Decision: skip_veto → skip; yes > no → bet YES; else → skip/no action
            # ------------------------------------------------------------------ #
            if tally.get("skip_veto"):
                # Activity signalled an immediate veto — skip without waiting for majority
                workflow.logger.info("PolymarketWorkflow: skip_veto=True — skipping market, trying next")
                await workflow.execute_activity(
                    post_vote_result_notification,
                    args=[market, tally, "skip_veto"],
                    start_to_close_timeout=_SHORT,
                    retry_policy=_IO_RETRY,
                )
                nay_markets.append(market)
                excluded_ids.append(condition_id)
                continue

            elif yes > no and (yes + no) > 0:
                # Majority BET_YES — open the position
                workflow.logger.info("PolymarketWorkflow: BET_YES majority — opening YES position")
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

            elif no >= yes and (yes + no) > 0:
                # Majority BET_NO (or tied with votes present) — pass on this market and try the next one
                workflow.logger.info("PolymarketWorkflow: BET_NO majority (yes=%d no=%d) — passing on market, trying next", yes, no)
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
                # No votes at all (0-0 tie)
                workflow.logger.info(
                    "PolymarketWorkflow: no votes cast (yes=%d no=%d) — no action", yes, no
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
                    "yes": yes,
                    "no": no,
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
