"""
Activities: check_sites, send_alert

check_sites — HTTP-checks all public clung.us endpoints and returns a status dict.
send_alert  — Sends an alert message to Discord via bot API.
"""
import os
import time
from typing import Any

import aiohttp
from temporalio import activity

from .constants import DISCORD_API, MAIN_CHANNEL_ID

SITES = [
    {"url": "https://clung.us", "ok_codes": {200}},
    {"url": "https://labs.clung.us", "ok_codes": {200}},
    {"url": "https://terminal.clung.us", "ok_codes": {200, 302}},
    {"url": "https://temporal.clung.us", "ok_codes": {200, 302}},
    {"url": "https://clung.us/cockpit", "ok_codes": {200, 302}},
]


@activity.defn
async def check_sites() -> dict[str, Any]:
    """Check all public clung.us endpoints. Returns a dict keyed by URL."""
    results: dict[str, Any] = {}
    timeout = aiohttp.ClientTimeout(total=10)

    async with aiohttp.ClientSession() as session:
        for site in SITES:
            url = site["url"]
            ok_codes = site["ok_codes"]
            start = time.monotonic()
            try:
                async with session.get(
                    url,
                    timeout=timeout,
                    allow_redirects=False,
                    ssl=True,
                ) as resp:
                    latency_ms = int((time.monotonic() - start) * 1000)
                    results[url] = {
                        "url": url,
                        "status_code": resp.status,
                        "ok": resp.status in ok_codes,
                        "latency_ms": latency_ms,
                        "error": None,
                    }
            except Exception as exc:
                latency_ms = int((time.monotonic() - start) * 1000)
                results[url] = {
                    "url": url,
                    "status_code": None,
                    "ok": False,
                    "latency_ms": latency_ms,
                    "error": str(exc),
                }

    return results


@activity.defn
async def send_alert(message: str) -> str:
    """Send an alert message directly to Discord via bot API."""
    async with aiohttp.ClientSession() as session:
        # Post directly via Discord bot API so humans see the alert
        token = os.environ["DISCORD_BOT_TOKEN"]
        api_url = f"{DISCORD_API}/channels/{MAIN_CHANNEL_ID}/messages"
        headers = {
            "Authorization": f"Bot {token}",
            "Content-Type": "application/json",
        }
        async with session.post(api_url, headers=headers, json={"content": message}) as resp:
            if resp.status not in (200, 201):
                body = await resp.text()
                raise RuntimeError(f"Discord API error {resp.status}: {body}")
            data = await resp.json()
            return data["id"]
