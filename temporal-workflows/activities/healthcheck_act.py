"""
Activities: check_sites, send_alert

check_sites — HTTP-checks all public clung.us endpoints and returns a status dict.
send_alert  — Sends an alert message via the omni inject endpoint.
"""
from typing import TypedDict

from temporalio import activity

from .common.http_io import fetch_status
from .constants import MAIN_CHANNEL_ID
from .inject_act import _do_inject

SITES = [
    {"url": "https://clung.us", "ok_codes": {200}},
    {"url": "https://labs.clung.us", "ok_codes": {200}},
    {"url": "https://terminal.clung.us", "ok_codes": {200, 302}},
    {"url": "https://temporal.clung.us", "ok_codes": {200, 302}},
    {"url": "https://clung.us/cockpit", "ok_codes": {200, 302}},
]


class SiteStatus(TypedDict):
    url: str
    status_code: int | None
    ok: bool
    latency_ms: float | None
    error: str | None


@activity.defn
async def check_sites() -> dict[str, SiteStatus]:
    """Check all public clung.us endpoints. Returns a dict keyed by URL."""
    results: dict[str, SiteStatus] = {}

    for site in SITES:
        url = site["url"]
        status_code, latency_ms, error = await fetch_status(url, allow_redirects=False, ssl=True)
        entry: SiteStatus = {
            "url": url,
            "status_code": status_code,
            "ok": status_code in site["ok_codes"] if status_code is not None else False,
            "latency_ms": latency_ms,
            "error": error,
        }
        results[url] = entry

    return results


@activity.defn
async def send_alert(message: str) -> str:
    """Send an alert message via the omni inject endpoint so it arrives as a BigClungus message."""
    await _do_inject(message, MAIN_CHANNEL_ID, user="healthcheck")
    return "injected"
