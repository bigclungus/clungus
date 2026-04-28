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

# Generous timeout for Polymarket CLOB API — response bodies can be large
POLYMARKET_TIMEOUT = aiohttp.ClientTimeout(total=60, connect=10, sock_read=30)


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


POLYMARKET_GAMMA = "https://gamma-api.polymarket.com"

# Browser-like headers to avoid CDN blocks
_POLYMARKET_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json",
}


@activity.defn
async def fetch_polymarket_markets(
    hours_min: int = 24, hours_max: int = 48, limit: int = 20
) -> list[dict]:
    """
    Fetch active Polymarket markets resolving within hours_min..hours_max from now.

    Uses the Gamma API (gamma-api.polymarket.com) which supports server-side
    date filtering — avoids paginating thousands of markets client-side.

    Returns list of market dicts sorted by volume descending, up to `limit` entries.
    Each dict contains: condition_id, question, description, end_date_iso,
    volume, tokens (list with YES/NO token ids and prices).
    """
    now = datetime.now(timezone.utc)
    window_start = now + timedelta(hours=hours_min)
    window_end = now + timedelta(hours=hours_max)

    # ISO 8601 strings for query params
    end_date_min = window_start.strftime("%Y-%m-%dT%H:%M:%SZ")
    end_date_max = window_end.strftime("%Y-%m-%dT%H:%M:%SZ")

    url = (
        f"{POLYMARKET_GAMMA}/markets"
        f"?closed=false&active=true"
        f"&end_date_min={end_date_min}&end_date_max={end_date_max}"
        f"&limit={min(limit * 5, 100)}"  # fetch a few extra to filter/sort, cap at 100
    )

    async with aiohttp.ClientSession(timeout=POLYMARKET_TIMEOUT, headers=_POLYMARKET_HEADERS) as session:
        async with session.get(url) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise RuntimeError(f"Polymarket Gamma API fetch failed ({resp.status}): {body[:300]}")
            raw_markets = await resp.json()

    if not isinstance(raw_markets, list):
        raise RuntimeError(f"Unexpected Gamma API response type: {type(raw_markets).__name__}")

    markets: list[dict] = []
    for m in raw_markets:
        # endDate has full datetime; endDateIso may be just a date string (YYYY-MM-DD)
        end_str = m.get("endDate") or m.get("endDateIso") or ""
        if not end_str:
            continue
        try:
            # Normalize: if bare date (no time component), treat as midnight UTC
            normalized = end_str.replace("Z", "+00:00")
            if "T" not in normalized:
                normalized = normalized + "T00:00:00+00:00"
            end_dt = datetime.fromisoformat(normalized)
        except ValueError:
            continue

        # Double-check window (server filter may be approximate)
        if not (window_start <= end_dt <= window_end):
            continue

        volume = float(m.get("volumeClob") or m.get("volume") or 0)

        # Build tokens list from outcomes + outcomePrices + clobTokenIds.
        # The Gamma API returns these fields as JSON-encoded strings within the JSON.
        def _parse_json_field(val: object) -> list:
            if isinstance(val, list):
                return val
            if isinstance(val, str):
                try:
                    parsed = loads(val)
                    return parsed if isinstance(parsed, list) else []
                except Exception:
                    return []
            return []

        outcomes = _parse_json_field(m.get("outcomes"))
        prices_raw = _parse_json_field(m.get("outcomePrices"))
        clob_ids = _parse_json_field(m.get("clobTokenIds"))

        tokens = []
        for i, outcome in enumerate(outcomes):
            token_id = clob_ids[i] if i < len(clob_ids) else ""
            price = float(prices_raw[i]) if i < len(prices_raw) else 0.5
            tokens.append({"outcome": outcome, "token_id": token_id, "price": price})

        # Prefer the event-level slug for URL construction — the market-level slug
        # produces 404s; the event slug at events[0].slug gives a valid 200.
        events = m.get("events") or []
        event_slug = events[0].get("slug", "") if events else ""

        markets.append({
            "condition_id": m.get("conditionId", ""),
            "question": m.get("question", ""),
            "description": m.get("description", ""),
            "end_date_iso": m.get("endDate") or end_str,
            "volume": volume,
            "tokens": tokens,
            "market_slug": m.get("slug", ""),
            "event_slug": event_slug,
            "category": m.get("category", ""),
        })

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


async def _screenshot_market_page(url: str) -> bytes | None:
    """
    Take a viewport screenshot of a Polymarket market page.

    Returns PNG bytes, or None if the screenshot fails (caller should
    fall back to a text-only message).
    """
    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 1280, "height": 800})
            try:
                await page.goto(url, wait_until="networkidle", timeout=30_000)
            except Exception:
                # networkidle may time out on JS-heavy pages — grab whatever rendered
                await page.wait_for_timeout(5_000)
            png_bytes: bytes = await page.screenshot(full_page=False)
            await browser.close()
            return png_bytes
    except Exception as exc:
        logger.warning("_screenshot_market_page: failed for %s — %s", url, exc)
        return None


async def _post_discord_message_with_image(
    channel_id: str,
    content: str,
    image_bytes: bytes,
) -> str:
    """
    Post a Discord message with an attached PNG image via multipart/form-data.

    Returns the message_id string.
    """
    token = get_discord_token()
    url = f"{DISCORD_API}/channels/{channel_id}/messages"
    headers = {
        "Authorization": f"Bot {token}",
        "User-Agent": "BigClungusBot/1.0",
    }
    data = aiohttp.FormData()
    data.add_field("content", content)
    data.add_field(
        "files[0]",
        image_bytes,
        filename="market.png",
        content_type="image/png",
    )
    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        async with session.post(url, data=data, headers=headers) as resp:
            body = await resp.json()
            if resp.status not in (200, 201):
                raise RuntimeError(
                    f"_post_discord_message_with_image: Discord returned {resp.status}: {body}"
                )
            return str(body["id"])


@activity.defn
async def post_market_poll(market: dict) -> str:
    """
    Post a Discord poll message for the market with 👍/👎 reactions.

    Attaches a screenshot of the Polymarket page when possible.
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
    # event_slug (from events[0].slug) produces valid URLs; market_slug (market-level)
    # returns 404. Fall back to market_slug only if event_slug is absent.
    event_slug = market.get("event_slug", "") or market.get("market_slug", "")
    market_url = f"https://polymarket.com/event/{event_slug}" if event_slug else ""
    if market_url:
        content_parts.append(f"\n🔗 {market_url}")
    content_parts.append(
        "\n\n👍 = YES bet  |  👎 = NO  |  ⏭️ = SKIP (veto — any skip immediately skips this market)\n"
        "*Congress is also deliberating. Combined vote decides the bet in 12 hours.*"
    )

    content = "".join(content_parts)

    # Attempt screenshot; fall back to text-only if it fails
    screenshot: bytes | None = None
    if market_url:
        screenshot = await _screenshot_market_page(market_url)
        if screenshot is None:
            activity.logger.warning("post_market_poll: screenshot failed, posting text-only")

    if screenshot is not None:
        message_id = await _post_discord_message_with_image(MAIN_CHANNEL_ID, content, screenshot)
    else:
        message_id = await discord_post_message(MAIN_CHANNEL_ID, content)

    # Add seed reactions from the bot
    token = get_discord_token()
    headers = {
        "Authorization": f"Bot {token}",
        "Content-Type": "application/json",
        "User-Agent": "BigClungusBot/1.0",
    }
    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        for emoji in ["%F0%9F%91%8D", "%F0%9F%91%8E", "%E2%8F%AD%EF%B8%8F"]:  # URL-encoded 👍 👎 ⏭️
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
        args=[{"topic": topic, "chat_id": chat_id, "flavor": "meme"}],
        id=workflow_id,
        task_queue="listings-queue",
    )

    activity.logger.info(
        "launch_congress_on_market: started CongressWorkflow (meme flavor) id=%s run_id=%s",
        workflow_id, handle.result_run_id,
    )
    return handle.result_run_id


@activity.defn
async def get_congress_verdict(congress_run_id: str, condition_id: str, timeout_seconds: int = 7200) -> dict:
    """
    Poll for the CongressWorkflow result and return per-persona vote breakdown.

    Waits up to timeout_seconds (default 2h) for completion.

    Returns dict:
        {
            "verdict": str,           # raw Ibrahim verdict text
            "session_id": str,        # e.g. "congress-0091"
            "persona_votes": dict,    # {display_name: "yea" | "nay"}
            "persona_yea": int,
            "persona_nay": int,
        }
    """
    from temporalio.client import Client
    from .constants import TEMPORAL_HOST, HELLO_WORLD_SESSIONS_DIR

    workflow_id = f"congress-polymarket-{condition_id[:30]}"

    client = await Client.connect(TEMPORAL_HOST)
    handle = client.get_workflow_handle(workflow_id, run_id=congress_run_id)

    try:
        result = await asyncio.wait_for(handle.result(), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        raise RuntimeError(f"CongressWorkflow {workflow_id} did not complete within {timeout_seconds}s")

    verdict = result.get("verdict", "") if isinstance(result, dict) else str(result)
    session_id = result.get("session_id", "") if isinstance(result, dict) else ""

    activity.logger.info(
        "get_congress_verdict: workflow %s session_id=%s verdict=%s",
        workflow_id, session_id, verdict[:100],
    )

    # Parse per-persona votes from the session file's vote_summary
    persona_votes: dict[str, str] = {}
    persona_yea = 0
    persona_nay = 0

    if session_id:
        try:
            # session_id is like "congress-0091" — extract the number
            num_str = session_id.split("-")[-1].zfill(4)
            session_file = HELLO_WORLD_SESSIONS_DIR / f"congress-{num_str}.json"
            if session_file.exists():
                session_data = loads(session_file.read_text())
                vote_summary = session_data.get("vote_summary", {})
                if isinstance(vote_summary, str):
                    vote_summary = loads(vote_summary)
                agree_names = vote_summary.get("agree", [])
                disagree_names = vote_summary.get("disagree", [])
                for name in agree_names:
                    persona_votes[name] = "yea"
                    persona_yea += 1
                for name in disagree_names:
                    persona_votes[name] = "nay"
                    persona_nay += 1
                activity.logger.info(
                    "get_congress_verdict: %d yea / %d nay persona votes from %s",
                    persona_yea, persona_nay, session_file,
                )
            else:
                activity.logger.warning(
                    "get_congress_verdict: session file not found at %s — no persona votes", session_file
                )
        except Exception as exc:
            activity.logger.warning(
                "get_congress_verdict: failed to parse session file for %s: %s", session_id, exc
            )

    return {
        "verdict": verdict,
        "session_id": session_id,
        "persona_votes": persona_votes,
        "persona_yea": persona_yea,
        "persona_nay": persona_nay,
    }


@activity.defn
async def get_vote_tally(message_id: str, congress_result: dict) -> dict:
    """
    Tally Discord emoji reactions + per-persona Congress votes.

    Discord 👍 = yea, 👎 = nay, ⏭️ = skip/veto (bot's own reactions not counted).
    Congress: each individual persona in vote_summary gets their own yea/nay vote.

    If any non-bot ⏭️ reactions exist, skip_veto=True is returned — caller should
    immediately skip this market without waiting for the majority threshold.

    Returns dict: {
        "yea": int, "nay": int,
        "discord_yea": int, "discord_nay": int, "discord_skip": int,
        "persona_votes": dict,
        "persona_yea": int, "persona_nay": int,
        "skip_veto": bool,
    }
    """
    token = get_discord_token()
    headers = {
        "Authorization": f"Bot {token}",
        "Content-Type": "application/json",
        "User-Agent": "BigClungusBot/1.0",
    }

    # Extract per-persona vote breakdown from congress_result
    persona_votes: dict[str, str] = congress_result.get("persona_votes", {}) if isinstance(congress_result, dict) else {}
    persona_yea: int = congress_result.get("persona_yea", 0) if isinstance(congress_result, dict) else 0
    persona_nay: int = congress_result.get("persona_nay", 0) if isinstance(congress_result, dict) else 0

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

        # Fetch ⏭️ reactors (skip/veto)
        skip_users: list[str] = []
        url_skip = f"{DISCORD_API}/channels/{MAIN_CHANNEL_ID}/messages/{message_id}/reactions/%E2%8F%AD%EF%B8%8F?limit=100"
        async with session.get(url_skip, headers=headers) as resp:
            if resp.status == 200:
                skip_users = [u["id"] for u in await resp.json()]

    # Exclude bot's own reactions
    if bot_user_id:
        thumbs_up_users = [u for u in thumbs_up_users if u != bot_user_id]
        thumbs_down_users = [u for u in thumbs_down_users if u != bot_user_id]
        skip_users = [u for u in skip_users if u != bot_user_id]

    discord_yea = len(thumbs_up_users)
    discord_nay = len(thumbs_down_users)
    discord_skip = len(skip_users)

    # Any skip reaction = immediate veto
    skip_veto = discord_skip > 0

    # Combine Discord reactions + individual persona votes
    total_yea = discord_yea + persona_yea
    total_nay = discord_nay + persona_nay

    result = {
        "yea": total_yea,
        "nay": total_nay,
        "discord_yea": discord_yea,
        "discord_nay": discord_nay,
        "discord_skip": discord_skip,
        "persona_votes": persona_votes,
        "persona_yea": persona_yea,
        "persona_nay": persona_nay,
        "skip_veto": skip_veto,
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
    async with aiohttp.ClientSession(timeout=POLYMARKET_TIMEOUT) as session:
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
    persona_yea = tally.get("persona_yea", 0)
    persona_nay = tally.get("persona_nay", 0)

    tally_line = (
        f"👍 {yea} yea (Discord: {discord_yea} + Personas: {persona_yea}) | "
        f"👎 {nay} nay (Discord: {discord_nay} + Personas: {persona_nay})"
    )

    if action == "bet_yes":
        action_line = f"✅ Majority yea — placing $5 YES bet on Polymarket!"
    elif action == "skip_veto":
        discord_skip = tally.get("discord_skip", 0)
        action_line = f"⏭️ Veto! {discord_skip} skip reaction(s) — skipping this market immediately."
    elif action == "skip":
        action_line = f"⏭️ Majority nay — skipping this market, trying another."
    else:
        action_line = f"🤷 No consensus reached ({yea} yea / {nay} nay) — no action."

    msg = (
        f"🗳️ **Polymarket Vote Result**\n"
        f"**{question}**\n"
        f"{tally_line}\n"
        f"{action_line}"
    )
    await discord_post_message(MAIN_CHANNEL_ID, msg)
