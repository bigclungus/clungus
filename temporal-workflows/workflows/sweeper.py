"""
Temporal workflow: 15-minute task sweeper.

Checks GitHub Project #1 for open items every 15 minutes and posts to Discord
if there is anything open. Silent otherwise.
This workflow loops indefinitely — start it once and it runs forever.
"""
from datetime import timedelta

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from activities.sweeper_act import check_open_tasks


@workflow.defn
class TaskSweeperWorkflow:
    @workflow.run
    async def run(self) -> None:
        """Sleep 15 minutes, check for open tasks, repeat forever."""
        while True:
            await workflow.sleep(timedelta(minutes=15))
            await workflow.execute_activity(
                check_open_tasks,
                start_to_close_timeout=timedelta(minutes=2),
            )
