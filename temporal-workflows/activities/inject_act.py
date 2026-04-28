"""
inject_act — shared activity for injecting messages into the bot session.

Uses the omni inject endpoint (http://127.0.0.1:8085/webhooks/bigclungus-main)
so that Temporal workflows can reach the bot without relying on the Discord bot
API (bots cannot read their own messages). No secret header required — the
endpoint is localhost-only.
"""

from logging import getLogger
from pathlib import Path
from time import time

from temporalio import activity

from .constants import INJECT_URL
from .common.http_io import post_json

logger = getLogger(__name__)

HEARTBEAT_TIMESTAMP_FILE = "/tmp/last-heartbeat.txt"


async def _do_inject(
    content: str, chat_id: str, user: str = "system", return_message_id: bool = False
) -> str | None:
    """Shared HTTP helper for inject endpoint calls. Not a Temporal activity.

    If ``return_message_id`` is True, attempts to parse and return the Discord
    message_id from the response JSON. Returns None if unavailable. Always returns
    None when ``return_message_id`` is False (default).
    """
    payload = {"content": content, "chat_id": chat_id, "user": user}
    status, data = await post_json(INJECT_URL, payload, timeout_s=10)
    if status >= 400:
        raise RuntimeError(f"[inject] inject endpoint returned {status}: {data}")
    if return_message_id:
        if not isinstance(data, dict):
            logger.warning("[inject] unexpected response type for message_id: %r", type(data))
            return None
        return data.get("message_id") or data.get("id")
    return None


@activity.defn
async def inject_message(content: str, user: str, chat_id: str) -> None:
    """Inject a message into the bot session via the inject endpoint."""
    await _do_inject(content, chat_id, user)
    # Track heartbeat liveness: record timestamp whenever a heartbeat message is injected
    if "[heartbeat]" in content:
        try:
            Path(HEARTBEAT_TIMESTAMP_FILE).write_text(str(time()))
        except Exception as exc:
            activity.logger.warning("[inject] failed to write heartbeat timestamp: %s", exc)
