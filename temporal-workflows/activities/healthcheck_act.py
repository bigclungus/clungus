"""
Activities: check_sites, send_alert

check_sites — HTTP-checks all public clung.us endpoints and returns a status dict.
send_alert  — Sends an alert message via the omni inject endpoint.
"""
import time
from typing import Any

import aiohttp
from temporalio import activity

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
    """Send an alert message via the omni inject endpoint so it arrives as a BigClungus message."""
    inject_url = "http://127.0.0.1:8085/webhooks/bigclungus-main"
    async with aiohttp.ClientSession() as session:
        async with session.post(
            inject_url,
            json={"content": message, "user": "healthcheck"},
        ) as resp:
            if resp.status not in (200, 201, 204):
                body = await resp.text()
                raise RuntimeError(f"Omni inject error {resp.status}: {body}")
            return "injected"
