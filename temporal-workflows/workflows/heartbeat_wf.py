from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.constants import MAIN_CHANNEL_ID
    from activities.inject_act import inject_message

HEARTBEAT_INTERVAL_SECONDS = 3600  # 60 minutes


@workflow.defn
class HeartbeatWorkflow:
    """Fires [heartbeat] every 60 minutes to keep BigClungus active.

    Congress verdict (RFC-1): this is a watchdog, not a self-improvement loop.
    It pokes a sleeping process and checks if anything is on fire.
    """

    @workflow.run
    async def run(self) -> None:
        while True:
            await workflow.sleep(timedelta(seconds=HEARTBEAT_INTERVAL_SECONDS))
            await workflow.execute_activity(
                inject_message,
                args=["[heartbeat]", "heartbeat", MAIN_CHANNEL_ID],
                start_to_close_timeout=timedelta(seconds=15),
                retry_policy=RetryPolicy(maximum_attempts=3),
            )
