"""
HTTP I/O activities — reusable across all workflows.
"""

import aiohttp
from temporalio import activity


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
