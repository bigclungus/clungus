import asyncio

import aiohttp
from temporalio import activity


@activity.defn
async def rate_limited_get(url: str, headers: dict = None, delay_secs: float = 1.0) -> dict:
    """Generic rate-limited HTTP GET. Returns {"status": int, "body": str}"""
    await asyncio.sleep(delay_secs)
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
        async with session.get(url, headers=headers or {}) as resp:
            return {"status": resp.status, "body": await resp.text()}
