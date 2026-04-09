import asyncio
import datetime as _dt
import json
from datetime import date

import aiohttp
from temporalio import activity

from .constants import DISCORD_API
from .utils import DISCORD_TIMEOUT, _discord_headers

_PPSF_GOOD = 600
_PPSF_FAIR = 750
_COLOR_GREEN = 0x2ECC71
_COLOR_GOLD = 0xF1C40F
_COLOR_RED = 0xE74C3C
_COLOR_NEUTRAL = 0x95A5A6


@activity.defn
async def post_discord_message(channel_id: str, content: str) -> str:
    """Post a message to Discord. Returns message ID."""
    url = f"{DISCORD_API}/channels/{channel_id}/messages"
    payload = {"content": content}

    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        async with session.post(url, headers=_discord_headers(), json=payload) as resp:
            if resp.status not in (200, 201):
                body = await resp.text()
                raise RuntimeError(f"Discord API error {resp.status}: {body}")
            data = await resp.json()
            return data["id"]


def _format_price(price: float) -> str:
    """Format a price as $X.XXM or $XXXk."""
    if price >= 1_000_000:
        return f"${price / 1_000_000:.2f}M"
    elif price >= 1_000:
        return f"${price / 1_000:.0f}k"
    return f"${price:,.0f}"


def _extract_neighborhood(address: str) -> str:
    """Pull neighborhood or city from a formatted address string.

    Formatted addresses are typically: '123 Main St, Berkeley, CA 94710'
    We want the city portion (second comma-delimited segment).
    """
    parts = [p.strip() for p in address.split(",")]
    if len(parts) >= 2:
        return parts[1]
    return parts[0] if parts else address


def _price_per_sqft_tier(ppsf: float) -> tuple[str, int]:
    """Return (emoji, embed_color) for a price-per-sqft value."""
    if ppsf < _PPSF_GOOD:
        return "✅", _COLOR_GREEN
    elif ppsf <= _PPSF_FAIR:
        return "🟡", _COLOR_GOLD
    else:
        return "💸", _COLOR_RED


def _days_on_market(list_date_str: str) -> int | None:
    """Return integer days on market, or None if list_date is unparseable."""
    if not list_date_str:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S"):
        try:
            listed = _dt.datetime.strptime(list_date_str, fmt).date()
            return (date.today() - listed).days
        except ValueError:
            continue
    return None


@activity.defn
async def post_listings_summary(channel_id: str, listings: list) -> str:
    """Post a single Discord message summarising up to 3 listings.

    Each listing is one embed. If listings is empty this raises ValueError
    so the caller should guard before invoking.

    Returns the message ID of the posted message.
    """
    if not listings:
        raise ValueError("post_listings_summary called with empty listings list")

    url = f"{DISCORD_API}/channels/{channel_id}/messages"

    # Discord allows up to 10 embeds per message; we cap at 3.
    embeds = []
    content_parts = []
    for listing in listings[:3]:
        raw_price = listing.get("price", 0) or 0
        beds = listing.get("beds", "?")
        baths = listing.get("baths", "?")
        sqft_val = listing.get("sqft") or 0
        sqft_display = f"{sqft_val:,}" if sqft_val else "?"
        address = listing.get("address", "Unknown address")
        listing_url = listing.get("url", "")
        photo = listing.get("photo", "")
        list_date_str = listing.get("list_date", "") or ""

        price_str = _format_price(raw_price) if raw_price else "?"
        neighborhood = _extract_neighborhood(address)

        dom = _days_on_market(list_date_str)
        dom_display = f"📅 Day {dom}" if dom is not None else ""

        stats_parts = [f"🛏 {beds}", f"🛁 {baths}", f"📐 {sqft_display} sqft", f"🏷 {price_str}"]
        if dom_display:
            stats_parts.append(dom_display)
        stats_bar = "  ".join(stats_parts)

        ppsf_line = ""
        embed_color = _COLOR_NEUTRAL
        if raw_price and sqft_val:
            ppsf = raw_price / sqft_val
            tier_emoji, embed_color = _price_per_sqft_tier(ppsf)
            ppsf_line = f"${ppsf:,.0f}/sqft {tier_emoji}"

        description_lines = [f"**{stats_bar}**"]
        if ppsf_line:
            description_lines.append(ppsf_line)
        if listing_url:
            description_lines.append(f"[View listing]({listing_url})")

        embed: dict = {
            "title": address,
            "description": "\n".join(description_lines),
            "color": embed_color,
        }
        if listing_url:
            embed["url"] = listing_url
        if photo:
            embed["image"] = {"url": photo}

        embeds.append(embed)
        content_parts.append(f"🏡 New listing · {price_str} · {neighborhood}")

    content = "\n".join(content_parts)

    payload = {"content": content, "embeds": embeds}

    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        async with session.post(url, headers=_discord_headers(), json=payload) as resp:
            if resp.status not in (200, 201):
                body = await resp.text()
                raise RuntimeError(f"Discord API error {resp.status}: {body}")
            data = await resp.json()
            message_id = data["id"]

        # Add thumbs up and thumbs down reactions.
        # Reactions are best-effort: a failure here must NOT cause the activity
        # to raise, because the message has already been posted and Temporal
        # would retry the whole activity (re-posting the message as a duplicate).
        for emoji in ("%F0%9F%91%8D", "%F0%9F%91%8E"):
            reaction_url = (
                f"{DISCORD_API}/channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me"
            )
            for attempt in range(3):
                async with session.put(reaction_url, headers=_discord_headers()) as react_resp:
                    if react_resp.status in (200, 201, 204):
                        break
                    body = await react_resp.text()
                    if react_resp.status == 429:
                        # Rate limited — parse retry_after and wait, then retry
                        try:
                            retry_after = json.loads(body).get("retry_after", 1.0)
                        except Exception as e:
                            activity.logger.warning("[discord_act] failed to parse rate-limit retry_after body: %s", e)
                            retry_after = 1.0
                        await asyncio.sleep(float(retry_after) + 0.1)
                    else:
                        # Non-rate-limit error: log and give up on this reaction
                        activity.logger.warning(f"Discord reaction API error {react_resp.status} (giving up): {body}")
                        break
            else:
                # Exhausted retries for this reaction — log and continue
                activity.logger.warning(f"Gave up adding reaction {emoji} to message {message_id} after 3 attempts")

    return message_id
