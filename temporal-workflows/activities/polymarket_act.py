"""
Activities for PolymarketWorkflow.

Handles fetching markets, LLM market picking, Discord poll posting,
Congress integration, vote tallying, bet placement, and resolution reporting.
"""

import asyncio
import subprocess
from datetime import datetime, timedelta, timezone
from json import dumps, loads
from logging import getLogger
from pathlib import Path

import aiohttp
from temporalio import activity

from .common.discord_io import discord_post_message, _discord_headers
from .common.http_io import DISCORD_TIMEOUT
from .constants import (
    CLAUDE_CLI,
    DISCORD_API,
    MAIN_CHANNEL_ID,
)
from .utils import get_discord_token

logger = getLogger(__name__)

POLYMARKET_CLOB = "https://clob.polymarket.com"
WALLET_PATH = "/mnt/data/secrets/eth_wallet"
POLYGON_CHAIN_ID = 137
BET_AMOUNT_USDC = 5.0


def _read_private_key() -> str:
    """Read PRIVATE_KEY from /mnt/data/secrets/eth_wallet (KEY=VALUE format)."""
    wallet_file = Path(WALLET_PATH)
    if not wallet_file.exists():
        raise RuntimeError(f"Wallet file not found: {WALLET_PATH}")
    for line in wallet_file.read_text().splitlines():
        line = line.strip()
        if line.startswith("PRIVATE_KEY=") and not line.startswith("#"):
            key = line.split("=", 1)[1].strip()
            if not key.startswith("0x"):
                key = "0x" + key
            return key
    raise RuntimeError("PRIVATE_KEY not found in wallet file")


@activity.defn
async def fetch_polymarket_markets(
    hours_min: int = 24, hours_max: int = 48, limit: int = 20
) -> list[dict]:
    """
    Fetch active Polymarket markets resolving within hours_min..hours_max from now.

    Returns list of market dicts sorted by volume descending, up to `limit` entries.
    Each dict contains: condition_id, question, description, end_date_iso,
    volume, tokens (list with YES/NO token ids and prices).
    """
    now = datetime.now(timezone.utc)
    window_start = now + timedelta(hours=hours_min)
    window_end = now + timedelta(hours=hours_max)

    markets: list[dict] = []
    offset = 0
    page_size = 100

    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        while True:
            url = f"{POLYMARKET_CLOB}/markets?closed=false&limit={page_size}&offset={offset}"
            async with session.get(url) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(f"Polymarket markets fetch failed ({resp.status}): {body[:300]}")
                data = await resp.json()

            raw_markets = data if isinstance(data, list) else data.get("data", [])
            if not raw_markets:
                break

            for m in raw_markets:
                end_str = m.get("end_date_iso") or m.get("end_date") or ""
                if not end_str:
                    continue
                try:
                    end_dt = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
                except ValueError:
                    continue

                if window_start <= end_dt <= window_end:
                    volume = float(m.get("volume", 0) or 0)
                    tokens = m.get("tokens", [])
                    markets.append({
                        "condition_id": m.get("condition_id", ""),
                        "question": m.get("question", ""),
                        "description": m.get("description", ""),
                        "end_date_iso": end_str,
                        "volume": volume,
                        "tokens": tokens,
                        "market_slug": m.get("market_slug", ""),
                        "category": m.get("category", ""),
                    })

            # If we got a full page and might have more, keep going
            if len(raw_markets) < page_size:
                break
            offset += page_size

    # Sort by volume descending and cap
    markets.sort(key=lambda m: m["volume"], reverse=True)
    result = markets[:limit]
    activity.logger.info(
        "fetch_polymarket_markets: found %d markets in %dh-%dh window (top %d returned)",
        len(markets), hours_min, hours_max, len(result),
    )
    return result


@activity.defn
async def pick_market_with_llm(markets: list[dict], exclude_ids: list[str] | None = None) -> dict:
    """
    Use Claude CLI to pick the most interesting/fun market from the list.

    Excludes markets whose condition_id appears in exclude_ids.
    Returns a single market dict.
    """
    if not markets:
        raise RuntimeError("pick_market_with_llm: no markets provided")

    exclude_set = set(exclude_ids or [])
    candidates = [m for m in markets if m.get("condition_id") not in exclude_set]
    if not candidates:
        raise RuntimeError("pick_market_with_llm: all markets excluded")

    market_list_text = "\n\n".join(
        f"[{i}] condition_id={m['condition_id']}\n"
        f"    Question: {m['question']}\n"
        f"    Category: {m.get('category', 'unknown')}\n"
        f"    Volume: ${m['volume']:,.0f}\n"
        f"    Resolves: {m['end_date_iso']}"
        for i, m in enumerate(candidates)
    )

    prompt = (
        "You are picking a Polymarket prediction market to bet on for fun and engagement.\n\n"
        "Pick the single MOST INTERESTING and FUN market from this list. "
        "Prefer markets about pop culture, sports, elections, or viral topics — not obscure financial instruments. "
        "High volume is a signal of interest but not the only factor.\n\n"
        "Markets:\n"
        f"{market_list_text}\n\n"
        "Respond with ONLY the index number (e.g. '3') of your chosen market. No explanation."
    )

    result = await asyncio.get_event_loop().run_in_executor(
        None,
        lambda: subprocess.run(
            [CLAUDE_CLI, "-p", prompt, "--output-format", "text"],
            capture_output=True, text=True, timeout=60,
        ),
    )
    if result.returncode != 0:
        raise RuntimeError(f"Claude CLI failed: {result.stderr[:300]}")

    raw = result.stdout.strip()
    # Extract first integer from the response
    import re
    match = re.search(r'\d+', raw)
    if not match:
        raise RuntimeError(f"Claude CLI returned non-numeric response: {raw!r}")

    idx = int(match.group())
    if idx < 0 or idx >= len(candidates):
        raise RuntimeError(f"Claude CLI returned out-of-range index {idx} for {len(candidates)} candidates")

    chosen = candidates[idx]
    activity.logger.info("pick_market_with_llm: chose market %d — %s", idx, chosen.get("question", "")[:80])
    return chosen


@activity.defn
async def post_market_poll(market: dict) -> str:
    """
    Post a Discord poll message for the market with 👍/👎 reactions.

    Returns the Discord message_id.
    """
    question = market.get("question", "Unknown market")
    description = market.get("description", "")
    end_date = market.get("end_date_iso", "")
    volume = market.get("volume", 0)
    category = market.get("category", "")

    # Format end date nicely
    end_display = end_date
    try:
        end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        end_display = end_dt.strftime("%b %d %Y %H:%M UTC")
    except Exception:
        pass

    content_parts = [
        f"🎲 **Polymarket Daily Pick** — cast your vote!\n",
        f"**{question}**",
    ]
    if description and description.strip() and description.strip() != question.strip():
        # Trim long descriptions
        desc = description.strip()[:300]
        if len(description.strip()) > 300:
            desc += "..."
        content_parts.append(f"\n{desc}")
    content_parts.append(
        f"\n\nResolves: {end_display} | Volume: ${volume:,.0f}"
        + (f" | {category}" if category else "")
    )
    content_parts.append(
        "\n\n👍 = YES bet  |  👎 = NO (skip)\n"
        "*Congress is also deliberating. Combined vote decides the bet in 12 hours.*"
    )

    content = "".join(content_parts)
    message_id = await discord_post_message(MAIN_CHANNEL_ID, content)

    # Add seed reactions from the bot
    token = get_discord_token()
    headers = {
        "Authorization": f"Bot {token}",
        "Content-Type": "application/json",
        "User-Agent": "BigClungusBot/1.0",
    }
    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        for emoji in ["%F0%9F%91%8D", "%F0%9F%91%8E"]:  # URL-encoded 👍 👎
            url = f"{DISCORD_API}/channels/{MAIN_CHANNEL_ID}/messages/{message_id}/reactions/{emoji}/@me"
            async with session.put(url, headers=headers) as resp:
                if resp.status not in (200, 201, 204):
                    body = await resp.text()
                    activity.logger.warning("Failed to add reaction %s: %s %s", emoji, resp.status, body[:100])
            await asyncio.sleep(0.5)  # avoid rate limiting

    activity.logger.info("post_market_poll: posted message_id=%s for market: %s", message_id, question[:60])
    return message_id


@activity.defn
async def launch_congress_on_market(market: dict, chat_id: str) -> str:
    """
    Launch a CongressWorkflow for the market question via Temporal client.

    Returns the workflow run_id.
    """
    from temporalio.client import Client
    from .constants import TEMPORAL_HOST

    question = market.get("question", "Unknown market")
    condition_id = market.get("condition_id", "unknown")

    topic = (
        f"Polymarket bet: {question}\n\n"
        "Should BigClungus place a YES bet on this prediction market? "
        "Vote YEA (support the YES bet) or NAY (skip this market). "
        "Consider the likelihood of the YES outcome, current market pricing, and entertainment value."
    )

    client = await Client.connect(TEMPORAL_HOST)
    workflow_id = f"congress-polymarket-{condition_id[:30]}"

    handle = await client.start_workflow(
        "CongressWorkflow",
        args=[{"topic": topic, "chat_id": chat_id, "flavor": "congress"}],
        id=workflow_id,
        task_queue="listings-queue",
    )

    activity.logger.info(
        "launch_congress_on_market: started CongressWorkflow id=%s run_id=%s",
        workflow_id, handle.result_run_id,
    )
    return handle.result_run_id


@activity.defn
async def get_congress_verdict(congress_run_id: str, condition_id: str, timeout_seconds: int = 7200) -> str:
    """
    Poll for the CongressWorkflow result and return the verdict string.

    Waits up to timeout_seconds (default 2h) for completion.
    Returns the raw verdict string from the session.
    """
    from temporalio.client import Client
    from .constants import TEMPORAL_HOST
    from .constants import HELLO_WORLD_SESSIONS_DIR

    workflow_id = f"congress-polymarket-{condition_id[:30]}"

    client = await Client.connect(TEMPORAL_HOST)
    handle = client.get_workflow_handle(workflow_id, run_id=congress_run_id)

    # Wait for result with timeout
    import asyncio
    try:
        result = await asyncio.wait_for(handle.result(), timeout=timeout_seconds)
        verdict = result.get("verdict", "") if isinstance(result, dict) else str(result)
        activity.logger.info("get_congress_verdict: workflow %s verdict=%s", workflow_id, verdict[:100])
        return verdict
    except asyncio.TimeoutError:
        raise RuntimeError(f"CongressWorkflow {workflow_id} did not complete within {timeout_seconds}s")


@activity.defn
async def get_vote_tally(message_id: str, congress_verdict: str) -> dict:
    """
    Tally Discord emoji reactions + Congress verdict.

    Discord 👍 = yea, 👎 = nay (bot's own reaction not counted).
    Congress: if verdict contains strong YES/YEA/AGREE/SUPPORT language → 1 yea; NAY/NO/AGAINST → 1 nay.

    Returns dict: {"yea": int, "nay": int, "discord_yea": int, "discord_nay": int, "congress_vote": str}
    """
    token = get_discord_token()
    headers = {
        "Authorization": f"Bot {token}",
        "Content-Type": "application/json",
        "User-Agent": "BigClungusBot/1.0",
    }

    # Fetch bot user ID so we can exclude bot's own reaction
    bot_user_id: str | None = None
    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        async with session.get(f"{DISCORD_API}/users/@me", headers=headers) as resp:
            if resp.status == 200:
                me = await resp.json()
                bot_user_id = me.get("id")

        # Fetch 👍 reactors
        thumbs_up_users: list[str] = []
        url_up = f"{DISCORD_API}/channels/{MAIN_CHANNEL_ID}/messages/{message_id}/reactions/%F0%9F%91%8D?limit=100"
        async with session.get(url_up, headers=headers) as resp:
            if resp.status == 200:
                thumbs_up_users = [u["id"] for u in await resp.json()]

        # Fetch 👎 reactors
        thumbs_down_users: list[str] = []
        url_down = f"{DISCORD_API}/channels/{MAIN_CHANNEL_ID}/messages/{message_id}/reactions/%F0%9F%91%8E?limit=100"
        async with session.get(url_down, headers=headers) as resp:
            if resp.status == 200:
                thumbs_down_users = [u["id"] for u in await resp.json()]

    # Exclude bot's own reactions
    if bot_user_id:
        thumbs_up_users = [u for u in thumbs_up_users if u != bot_user_id]
        thumbs_down_users = [u for u in thumbs_down_users if u != bot_user_id]

    discord_yea = len(thumbs_up_users)
    discord_nay = len(thumbs_down_users)

    # Interpret Congress verdict
    import re
    verdict_upper = (congress_verdict or "").upper()

    # Look for explicit YEA/NAY/YES/NO signals in the verdict
    congress_vote = "abstain"
    yea_patterns = [r'\bYEA\b', r'\bYES\b', r'\bAGREE\b', r'\bSUPPORT\b', r'\bBET\b', r'\bFAVORABLE\b', r'\bFAVOURED\b']
    nay_patterns = [r'\bNAY\b', r'\bNO\b', r'\bDISAGREE\b', r'\bAGAINST\b', r'\bSKIP\b', r'\bPASS\b', r'\bDECLINE\b']

    yea_hits = sum(1 for p in yea_patterns if re.search(p, verdict_upper))
    nay_hits = sum(1 for p in nay_patterns if re.search(p, verdict_upper))

    if yea_hits > nay_hits:
        congress_vote = "yea"
    elif nay_hits > yea_hits:
        congress_vote = "nay"
    # tie → abstain

    congress_yea = 1 if congress_vote == "yea" else 0
    congress_nay = 1 if congress_vote == "nay" else 0

    total_yea = discord_yea + congress_yea
    total_nay = discord_nay + congress_nay

    result = {
        "yea": total_yea,
        "nay": total_nay,
        "discord_yea": discord_yea,
        "discord_nay": discord_nay,
        "congress_vote": congress_vote,
    }
    activity.logger.info("get_vote_tally: %s", result)
    return result


@activity.defn
async def place_polymarket_bet(market: dict, side: str, amount_usdc: float = BET_AMOUNT_USDC) -> str:
    """
    Place a bet on Polymarket via py-clob-client.

    side: "YES" or "NO"
    Returns the order ID string.
    """
    from py_clob_client.client import ClobClient
    from py_clob_client.clob_types import OrderArgs, OrderType

    private_key = _read_private_key()

    tokens = market.get("tokens", [])
    if not tokens:
        raise RuntimeError(f"place_polymarket_bet: no tokens in market {market.get('condition_id')}")

    # Find the YES token (outcome == "Yes" or first token)
    yes_token = None
    no_token = None
    for t in tokens:
        outcome = (t.get("outcome") or "").upper()
        if outcome == "YES":
            yes_token = t
        elif outcome == "NO":
            no_token = t

    # Fallback: assume tokens[0]=YES tokens[1]=NO if not labeled
    if yes_token is None and len(tokens) >= 1:
        yes_token = tokens[0]
    if no_token is None and len(tokens) >= 2:
        no_token = tokens[1]

    target_token = yes_token if side.upper() == "YES" else no_token
    if target_token is None:
        raise RuntimeError(f"place_polymarket_bet: could not find {side} token in market tokens")

    token_id = target_token.get("token_id") or target_token.get("id", "")
    price = float(target_token.get("price") or 0.5)

    if not token_id:
        raise RuntimeError(f"place_polymarket_bet: token_id missing for {side} token")

    activity.logger.info(
        "place_polymarket_bet: placing %s $%.2f bet on market %s (token_id=%s, price=%.3f)",
        side, amount_usdc, market.get("condition_id", ""), token_id, price,
    )

    # Run blocking CLOB client calls in executor
    def _do_bet() -> str:
        client = ClobClient(
            host=POLYMARKET_CLOB,
            key=private_key,
            chain_id=POLYGON_CHAIN_ID,
        )
        order_args = OrderArgs(
            token_id=token_id,
            price=price,
            size=amount_usdc,
            side="BUY",
        )
        signed_order = client.create_order(order_args)
        resp = client.post_order(signed_order, OrderType.GTC)
        if isinstance(resp, dict):
            return resp.get("orderID") or resp.get("order_id") or str(resp)
        return str(resp)

    loop = asyncio.get_event_loop()
    order_id = await loop.run_in_executor(None, _do_bet)
    activity.logger.info("place_polymarket_bet: order placed order_id=%s", order_id)
    return str(order_id)


@activity.defn
async def check_market_resolution(condition_id: str) -> dict:
    """
    Check if a Polymarket market has resolved.

    Returns dict with: resolved (bool), winner (str or None), tokens (list).
    """
    url = f"{POLYMARKET_CLOB}/markets/{condition_id}"
    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        async with session.get(url) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise RuntimeError(f"check_market_resolution: API returned {resp.status}: {body[:200]}")
            data = await resp.json()

    tokens = data.get("tokens", [])
    resolved = False
    winner: str | None = None

    for t in tokens:
        if t.get("winner"):
            resolved = True
            winner = (t.get("outcome") or "").upper() or "YES"
            break

    # Also check top-level resolved flag
    if not resolved and data.get("resolved"):
        resolved = True

    result = {
        "resolved": resolved,
        "winner": winner,
        "question": data.get("question", ""),
        "tokens": tokens,
        "condition_id": condition_id,
    }
    activity.logger.info(
        "check_market_resolution: condition_id=%s resolved=%s winner=%s",
        condition_id, resolved, winner,
    )
    return result


@activity.defn
async def post_resolution_notification(
    market: dict,
    outcome: dict,
    bet_side: str,
    order_id: str,
    amount_usdc: float = BET_AMOUNT_USDC,
) -> None:
    """
    Post the market resolution outcome and P&L estimate to Discord.

    outcome: result of check_market_resolution
    bet_side: "YES" or "NO"
    """
    question = market.get("question", "Unknown market")
    condition_id = market.get("condition_id", "")
    winner = outcome.get("winner")
    resolved = outcome.get("resolved", False)

    if not resolved:
        msg = (
            f"⏳ **Polymarket Update** — market not yet resolved\n"
            f"**{question}**\n"
            f"Bet: ${amount_usdc:.2f} {bet_side} | Order: `{order_id}`"
        )
    else:
        won = (winner or "").upper() == (bet_side or "").upper()
        if won:
            # Rough P&L: need YES price at time of bet. Use 0.5 as conservative estimate.
            tokens = market.get("tokens", [])
            yes_price = 0.5
            for t in tokens:
                if (t.get("outcome") or "").upper() == "YES":
                    yes_price = float(t.get("price") or 0.5)
                    break
            # Winnings ≈ amount / price * (1 - price)  — simplified
            try:
                winnings = (amount_usdc / yes_price) - amount_usdc
                pnl_str = f"+${winnings:.2f} 🎉"
            except ZeroDivisionError:
                pnl_str = "WIN 🎉"
        else:
            pnl_str = f"-${amount_usdc:.2f} 😔"

        result_emoji = "✅" if won else "❌"
        msg = (
            f"{result_emoji} **Polymarket Result** — market resolved!\n"
            f"**{question}**\n"
            f"Winner: **{winner}** | Bet: ${amount_usdc:.2f} {bet_side}\n"
            f"P&L: {pnl_str} | Order: `{order_id}`"
        )

    await discord_post_message(MAIN_CHANNEL_ID, msg)
    activity.logger.info("post_resolution_notification: posted resolution for %s", condition_id)


@activity.defn
async def post_vote_result_notification(
    market: dict,
    tally: dict,
    action: str,
) -> None:
    """
    Post the vote tally result to Discord after the 12hr window closes.

    action: "bet_yes" | "skip" | "no_consensus"
    """
    question = market.get("question", "Unknown market")
    yea = tally.get("yea", 0)
    nay = tally.get("nay", 0)
    discord_yea = tally.get("discord_yea", 0)
    discord_nay = tally.get("discord_nay", 0)
    congress_vote = tally.get("congress_vote", "abstain")

    tally_line = (
        f"👍 {yea} yea (Discord: {discord_yea} + Congress: {'1' if congress_vote == 'yea' else '0'}) | "
        f"👎 {nay} nay (Discord: {discord_nay} + Congress: {'1' if congress_vote == 'nay' else '0'})"
    )

    if action == "bet_yes":
        action_line = f"✅ Placing $5 YES bet on Polymarket!"
    elif action == "skip":
        action_line = f"⏭️ 3 nay votes — skipping this market, trying another."
    else:
        action_line = f"🤷 No consensus reached ({yea} yea / {nay} nay) — no action."

    msg = (
        f"🗳️ **Polymarket Vote Result**\n"
        f"**{question}**\n"
        f"{tally_line}\n"
        f"{action_line}"
    )
    await discord_post_message(MAIN_CHANNEL_ID, msg)
