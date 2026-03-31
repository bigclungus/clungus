"""
nightowl_act — activities for injecting NightOwl queued tasks into the bot session.

Reuses the shared inject endpoint (_do_inject from inject_act) so all injection
logic stays in one place.
"""
import aiohttp
from temporalio import activity

from .constants import CLUNGER_BASE_URL, MAIN_CHANNEL_ID
from .inject_act import _do_inject


@activity.defn(name="nightowl_inject")
async def nightowl_inject(task: str) -> bool:
    """Inject a queued NightOwl task as a bot message to BigClungus."""
    await _do_inject(
        content=f"[nightowl] {task}",
        chat_id=MAIN_CHANNEL_ID,
        user="nightowl",
    )
    return True


@activity.defn(name="nightowl_flag_risky")
async def nightowl_flag_risky(task: str) -> bool:
    """Flag a risky task in Discord without executing it."""
    message = (
        f"⚠️ **NightOwl pre-flight hold**: task flagged as potentially risky and skipped:\n"
        f"> {task}\n"
        f"Manually queue it if you want it to run."
    )
    await _do_inject(
        content=message,
        chat_id=MAIN_CHANNEL_ID,
        user="nightowl-preflight",
    )
    return True


@activity.defn(name="nightowl_poll_status")
async def nightowl_poll_status(task_id: str) -> bool:
    """Poll clunger to check if a NightOwl task has been marked complete."""
    url = f"{CLUNGER_BASE_URL}/api/nightowl/status/{task_id}"
    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
            if resp.status != 200:
                raise RuntimeError(f"nightowl_poll_status: clunger returned {resp.status}")
            data = await resp.json()
            return bool(data.get("done", False))
