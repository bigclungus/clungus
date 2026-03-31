"""
inject_act — shared activity for injecting messages into the bot session.

Uses the omni inject endpoint (http://127.0.0.1:8085/webhooks/bigclungus-main)
so that Temporal workflows can reach the bot without relying on the Discord bot
API (bots cannot read their own messages). No secret header required — the
endpoint is localhost-only.
"""

import aiohttp
from temporalio import activity

from .constants import INJECT_URL


async def _do_inject(
    content: str, chat_id: str, user: str = "system", return_message_id: bool = False
) -> "str | None":
    """Shared HTTP helper for inject endpoint calls. Not a Temporal activity.

    If ``return_message_id`` is True, attempts to parse and return the Discord
    message_id from the response JSON. Returns None if unavailable. Always returns
    None when ``return_message_id`` is False (default).
    """
    headers = {
        "Content-Type": "application/json",
    }
    payload = {"content": content, "chat_id": chat_id, "user": user}
    async with aiohttp.ClientSession() as session:
        async with session.post(
            INJECT_URL,
            json=payload,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            resp.raise_for_status()
            if return_message_id:
                try:
                    data = await resp.json()
                    return data.get("message_id") or data.get("id")
                except Exception:
                    return None
    return None


@activity.defn
async def inject_message(content: str, user: str, chat_id: str) -> None:
    """Inject a message into the bot session via the inject endpoint."""
    await _do_inject(content, chat_id, user)
