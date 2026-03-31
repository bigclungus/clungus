"""
OnceReminderWorkflow — sleeps until a target UTC time, then fires a Discord message.
"""

from datetime import datetime, timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.reminder_act import send_reminder


@workflow.defn
class OnceReminderWorkflow:
    @workflow.run
    async def run(self, input: dict) -> str:
        fire_at_iso = input["fire_at"]  # ISO format UTC string
        message = input["message"]

        fire_at = datetime.fromisoformat(fire_at_iso.replace("Z", "+00:00"))
        now = workflow.now()
        wait = fire_at - now

        if wait.total_seconds() > 0:
            await workflow.sleep(wait)

        result = await workflow.execute_activity(
            send_reminder,
            message,
            start_to_close_timeout=timedelta(minutes=1),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )
        return result
