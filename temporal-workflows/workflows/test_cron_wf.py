"""
Temporal workflow: TestCronWorkflow

Runs integration tests every 6 hours. If the test activity returns a failure,
posts an alert to Discord via the inject endpoint.

Scheduled via cron_schedule="0 */6 * * *" with fixed workflow ID "test-cron"
so only one instance ever runs (idempotent re-registration).
"""

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.test_cron_act import alert_discord_test_failure, run_integration_tests


@workflow.defn
class TestCronWorkflow:
    @workflow.run
    async def run(self) -> str:
        """Run one integration test pass. Temporal re-schedules via cron_schedule."""
        success, output = await workflow.execute_activity(
            run_integration_tests,
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=RetryPolicy(
                maximum_attempts=2,
                initial_interval=timedelta(seconds=30),
                maximum_interval=timedelta(minutes=2),
            ),
        )

        if not success:
            workflow.logger.warning("Integration tests failed — alerting Discord")
            await workflow.execute_activity(
                alert_discord_test_failure,
                args=[output],
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=RetryPolicy(maximum_attempts=3),
            )
            return f"FAILED: {output[:200]}"

        workflow.logger.info("Integration tests passed")
        return "passed"
