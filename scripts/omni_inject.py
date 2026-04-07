#!/usr/bin/env python3
"""
omni_inject.py — shared helper for posting messages to the omni gateway inject endpoint.

Usage as a library:
    from omni_inject import inject
    inject("hello from script", user="my-script")

Usage as a CLI:
    python3 omni_inject.py "message content" [--user <user>] [--channel <channel>]
"""

import json
import urllib.request
import urllib.error

OMNI_BASE_URL = "http://127.0.0.1:8085/webhooks"
DEFAULT_CHANNEL = "bigclungus-main"
DEFAULT_USER = "script"
REQUEST_TIMEOUT = 5


def inject(
    content: str,
    user: str = DEFAULT_USER,
    channel: str = DEFAULT_CHANNEL,
    chat_id: str | None = None,
    timeout: int = REQUEST_TIMEOUT,
) -> None:
    """Post a message to the omni gateway inject endpoint.

    Args:
        content:  Message text to send.
        user:     Display name shown as the sender (default: "script").
        channel:  Omni channel name (default: "bigclungus-main").
        chat_id:  Optional Discord channel ID to route the reply to a specific channel.
        timeout:  HTTP request timeout in seconds (default: 5).

    Raises:
        urllib.error.URLError: If the request fails to reach the omni gateway.
        RuntimeError:          If the gateway returns an unexpected HTTP status.
    """
    payload: dict = {"content": content, "user": user}
    if chat_id is not None:
        payload["chat_id"] = chat_id

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OMNI_BASE_URL}/{channel}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        status = resp.status
        if status not in (200, 201, 202, 204):
            raise RuntimeError(f"Unexpected HTTP status from omni gateway: {status}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Post a message to the omni inject endpoint.")
    parser.add_argument("content", help="Message content to send")
    parser.add_argument("--user", default=DEFAULT_USER, help="Sender display name")
    parser.add_argument("--channel", default=DEFAULT_CHANNEL, help="Omni channel name")
    parser.add_argument("--chat-id", dest="chat_id", default=None, help="Discord channel ID")
    args = parser.parse_args()

    inject(args.content, user=args.user, channel=args.channel, chat_id=args.chat_id)
