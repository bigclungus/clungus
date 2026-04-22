"""
HTTP I/O activities — reusable across all workflows.
"""

import aiohttp
from temporalio import activity

from ..constants import CLUNGER_BASE_URL, INTERNAL_TOKEN
from ..utils import DISCORD_TIMEOUT


@activity.defn
async def fetch_json(url: str, headers: dict | None = None) -> dict | list:
    """HTTP GET returning parsed JSON. Raises on non-200 responses."""
    timeout = aiohttp.ClientTimeout(total=30)
    req_headers = headers or {}
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url, headers=req_headers) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise RuntimeError(f"HTTP GET {url} failed ({resp.status}): {body[:500]}")
            return await resp.json()


async def post_json(url: str, payload: dict, headers: dict | None = None, timeout_s: int = 15) -> tuple[int, dict | list]:
    """HTTP POST with JSON body. Returns (status_code, response_json).

    This is a plain async helper (not a Temporal activity) for use inside other activities.
    Raises RuntimeError if the response body cannot be parsed as JSON.
    """
    timeout = aiohttp.ClientTimeout(total=timeout_s)
    req_headers = headers or {}
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(url, json=payload, headers=req_headers) as resp:
            try:
                data = await resp.json(content_type=None)
            except Exception as e:
                body = await resp.text()
                raise RuntimeError(f"post_json: could not parse JSON from {url} ({resp.status}): {e} — body: {body[:200]}")
            return resp.status, data


async def clunger_patch_session(session_id: str, payload: dict, caller: str = "clunger_patch_session") -> None:
    """PATCH fields onto a clunger congress session via the internal REST API.

    No-op if INTERNAL_TOKEN is not set or payload is empty.
    Raises RuntimeError on non-2xx responses.
    This is a plain async helper (not a Temporal activity) for use inside other activities.
    """
    if not INTERNAL_TOKEN or not payload:
        return
    url = f"{CLUNGER_BASE_URL}/api/congress/sessions/{session_id}"
    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        async with session.patch(
            url,
            json=payload,
            headers={"x-internal-token": INTERNAL_TOKEN},
        ) as resp:
            if resp.status not in (200, 201):
                body = await resp.text()
                raise RuntimeError(f"{caller}: REST PATCH failed {resp.status}: {body}")
