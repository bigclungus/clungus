"""
Reminder activity — posts a message to Discord via the inject endpoint.
"""

from temporalio import activity

from .constants import MAIN_CHANNEL_ID
from .inject_act import _do_inject


@activity.defn
async def send_reminder(message: str) -> str:
    """Post a message to Discord via the inject endpoint."""
    await _do_inject(message, MAIN_CHANNEL_ID, user="temporal-reminder")
    return "sent"
