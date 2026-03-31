"""Workflow: TaskDbBackupWorkflow

Runs every 6 hours (via cron_schedule) and commits tasks.db to git.
"""

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.tasks_backup_act import backup_tasks_db


@workflow.defn
class TaskDbBackupWorkflow:
    @workflow.run
    async def run(self) -> str:
        result = await workflow.execute_activity(
            backup_tasks_db,
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=RetryPolicy(
                maximum_attempts=3,
                initial_interval=timedelta(seconds=30),
                maximum_interval=timedelta(minutes=2),
            ),
        )
        workflow.logger.info("Task DB backup complete: %s", result)
        return result
