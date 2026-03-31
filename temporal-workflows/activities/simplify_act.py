"""
Activity: run_simplify_review

Injects a [simplify] trigger into the main bot session so the main
session handles the review with full file access and permissions.
"""

from temporalio import activity

from .constants import MAIN_CHANNEL_ID
from .inject_act import _do_inject


@activity.defn
async def run_simplify_review() -> str:
    """Inject [simplify] trigger into the main bot session."""
    await _do_inject("[simplify]", MAIN_CHANNEL_ID, user="simplify-cron")
    return "injected [simplify]"
