"""
Discord I/O activities — reusable across all workflows.

Posts messages, polls reactions, adds reactions, creates threads via the
Discord bot API. Bot token loaded from the standard .env location.
"""

import logging

import aiohttp
from temporalio import activity

from ..constants import DISCORD_API
from ..utils import DISCORD_TIMEOUT, _discord_headers

logger = logging.getLogger(__name__)


@activity.defn
async def discord_post_message(
    channel_id: str, content: str, embeds: list | None = None
) -> str:
    """Post a message to a Discord channel, optionally with embeds. Returns message_id."""
    url = f"{DISCORD_API}/channels/{channel_id}/messages"
    payload: dict = {"content": content}
    if embeds:
        payload["embeds"] = embeds
    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        async with session.post(url, headers=_discord_headers(), json=payload) as resp:
            if resp.status not in (200, 201):
                body = await resp.text()
                raise RuntimeError(f"Discord POST message failed ({resp.status}): {body}")
            data = await resp.json()
            return data["id"]


@activity.defn
async def discord_poll_reactions(channel_id: str, message_id: str) -> dict:
    """Fetch all reactions on a message. Returns {emoji_name: [user_id, ...]}."""
    # First, get the message to see which reactions exist
    msg_url = f"{DISCORD_API}/channels/{channel_id}/messages/{message_id}"
    result: dict[str, list[str]] = {}

    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        async with session.get(msg_url, headers=_discord_headers()) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise RuntimeError(f"Discord GET message failed ({resp.status}): {body}")
            msg_data = await resp.json()

        reactions = msg_data.get("reactions", [])
        for reaction in reactions:
            emoji = reaction.get("emoji", {})
            # Unicode emoji: use the name directly; custom emoji: use name:id
            emoji_name = emoji.get("name", "")
            emoji_id = emoji.get("id")
            if emoji_id:
                encoded = f"{emoji_name}:{emoji_id}"
            else:
                encoded = emoji_name

            # Fetch users who reacted with this emoji
            users_url = (
                f"{DISCORD_API}/channels/{channel_id}/messages/{message_id}"
                f"/reactions/{encoded}"
            )
            async with session.get(users_url, headers=_discord_headers()) as uresp:
                if uresp.status != 200:
                    logger.warning("Failed to fetch reaction users for %s: %s", encoded, uresp.status)
                    continue
                users = await uresp.json()
                result[emoji_name] = [u["id"] for u in users]

    return result


@activity.defn
async def discord_add_reaction(channel_id: str, message_id: str, emoji: str) -> None:
    """Add a reaction to a message. emoji should be URL-encoded for unicode.

    No internal retry loop — Temporal's RetryPolicy handles transient failures.
    """
    url = (
        f"{DISCORD_API}/channels/{channel_id}/messages/{message_id}"
        f"/reactions/{emoji}/@me"
    )
    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        async with session.put(url, headers=_discord_headers()) as resp:
            if resp.status in (200, 201, 204):
                return
            body = await resp.text()
            raise RuntimeError(
                f"Discord add_reaction failed ({resp.status}): {body}"
            )


@activity.defn
async def discord_create_thread(channel_id: str, message_id: str, name: str) -> str:
    """Create a thread on a message. Returns the thread channel_id."""
    url = f"{DISCORD_API}/channels/{channel_id}/messages/{message_id}/threads"
    payload = {"name": name[:100]}  # Discord thread names max 100 chars
    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        async with session.post(url, headers=_discord_headers(), json=payload) as resp:
            if resp.status not in (200, 201):
                body = await resp.text()
                raise RuntimeError(f"Discord create_thread failed ({resp.status}): {body}")
            data = await resp.json()
            return data["id"]


async def discord_fetch_messages(channel_id: str, limit: int = 50) -> list[dict]:
    """Fetch recent messages from a Discord channel (newest-first). Returns [] on failure.

    This is a plain async helper (not a Temporal activity) for use inside other activities.
    """
    url = f"{DISCORD_API}/channels/{channel_id}/messages?limit={limit}"
    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        async with session.get(url, headers=_discord_headers()) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise RuntimeError(f"discord_fetch_messages: Discord API returned {resp.status}: {body[:200]}")
            return await resp.json()


async def discord_create_thread_or_reuse(channel_id: str, message_id: str, name: str) -> str:
    """Create a thread on a message, or reuse an existing one if Discord returns 400.

    Returns the thread channel_id. Raises RuntimeError on unrecoverable failures.
    This is a plain async helper (not a Temporal activity) for use inside other activities.
    """
    url = f"{DISCORD_API}/channels/{channel_id}/messages/{message_id}/threads"
    payload = {"name": name[:100], "auto_archive_duration": 1440}
    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        async with session.post(url, headers=_discord_headers(), json=payload) as resp:
            if resp.status in (200, 201):
                data = await resp.json()
                return data["id"]
            body = await resp.text()
            if resp.status == 400:
                # Discord returns 400 when a thread already exists on this message.
                # Fetch the message to retrieve the existing thread id.
                msg_url = f"{DISCORD_API}/channels/{channel_id}/messages/{message_id}"
                async with session.get(msg_url, headers=_discord_headers()) as msg_resp:
                    if msg_resp.status == 200:
                        msg_data = await msg_resp.json()
                        thread = msg_data.get("thread")
                        if thread and thread.get("id"):
                            return thread["id"]
                raise RuntimeError(
                    f"discord_create_thread_or_reuse: thread already exists but could not retrieve id; "
                    f"original 400 body: {body}"
                )
            raise RuntimeError(f"discord_create_thread_or_reuse failed {resp.status}: {body}")
