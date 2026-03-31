import asyncio
import json
import os

import aiohttp
from temporalio import activity

from .constants import DISCORD_API


@activity.defn
async def post_discord_message(channel_id: str, content: str) -> str:
    """Post a message to Discord. Returns message ID."""
    token = os.environ["DISCORD_BOT_TOKEN"]
    url = f"{DISCORD_API}/channels/{channel_id}/messages"
    headers = {
        "Authorization": f"Bot {token}",
        "Content-Type": "application/json",
    }
    payload = {"content": content}

    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=payload) as resp:
            if resp.status not in (200, 201):
                body = await resp.text()
                raise RuntimeError(f"Discord API error {resp.status}: {body}")
            data = await resp.json()
            return data["id"]


@activity.defn
async def post_listings_summary(channel_id: str, listings: list) -> str:
    """Post a single Discord message summarising up to 3 listings.

    Each listing is one embed. If listings is empty this raises ValueError
    so the caller should guard before invoking.

    Returns the message ID of the posted message.
    """
    if not listings:
        raise ValueError("post_listings_summary called with empty listings list")

    token = os.environ["DISCORD_BOT_TOKEN"]
    url = f"{DISCORD_API}/channels/{channel_id}/messages"
    headers = {
        "Authorization": f"Bot {token}",
        "Content-Type": "application/json",
    }

    # Discord allows up to 10 embeds per message; we cap at 3.
    embeds = []
    for listing in listings[:3]:
        price = f"${listing['price']:,.0f}"
        beds = listing.get("beds", "?")
        baths = listing.get("baths", "?")
        sqft = f"{listing.get('sqft', 0):,}" if listing.get("sqft") else "?"
        address = listing.get("address", "Unknown address")
        listing_url = listing.get("url", "")
        photo = listing.get("photo", "")

        description_lines = [
            f"**{beds} bed / {baths} bath  |  {sqft} sqft  |  {price}**",
        ]
        if listing_url:
            description_lines.append(f"[View listing]({listing_url})")

        embed = {
            "title": address,
            "description": "\n".join(description_lines),
            "color": 0x2ECC71,  # green
        }
        if listing_url:
            embed["url"] = listing_url
        if photo:
            embed["image"] = {"url": photo}

        embeds.append(embed)

    count = len(embeds)
    content = f"**{count} new listing{'s' if count != 1 else ''} found**"

    payload = {"content": content, "embeds": embeds}

    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=payload) as resp:
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
                async with session.put(reaction_url, headers=headers) as react_resp:
                    if react_resp.status in (200, 201, 204):
                        break
                    body = await react_resp.text()
                    if react_resp.status == 429:
                        # Rate limited — parse retry_after and wait, then retry
                        try:
                            retry_after = json.loads(body).get("retry_after", 1.0)
                        except Exception:
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
