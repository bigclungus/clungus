from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.drift_scan_act import run_drift_scan


@workflow.defn
class DriftScanWorkflow:
    @workflow.run
    async def run(self) -> None:
        await workflow.execute_activity(
            run_drift_scan,
            schedule_to_close_timeout=timedelta(minutes=10),
            retry_policy=RetryPolicy(maximum_attempts=1),
        )
