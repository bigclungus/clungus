"""
Temporal workflow: SimplifyCronWorkflow

Runs a code simplification review on the hello-world codebase every hour.
Scheduled via cron_schedule="0 * * * *" with a fixed workflow ID so only
one instance ever runs (idempotent re-registration).

The workflow itself is a single-execution cron — Temporal re-runs it on schedule.
"""

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.simplify_act import run_simplify_review


@workflow.defn
class SimplifyCronWorkflow:
    @workflow.run
    async def run(self) -> str:
        """Run one simplify review pass. Temporal re-schedules via cron_schedule."""
        result = await workflow.execute_activity(
            run_simplify_review,
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=RetryPolicy(
                maximum_attempts=5,
                initial_interval=timedelta(seconds=30),
                maximum_interval=timedelta(minutes=2),
            ),
        )
        workflow.logger.info("Simplify review complete: %s", result)
        return result
