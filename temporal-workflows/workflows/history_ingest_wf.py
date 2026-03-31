"""
Temporal workflow: Discord history ingestion.

Triggered every 1 minute via a Temporal schedule (history-ingest-1m).
Executes the ingest activity with a 10-minute timeout.
Uses SKIP overlap policy (configured on the schedule) so concurrent runs are dropped.
"""
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.history_ingest_act import run_history_ingest


@workflow.defn
class HistoryIngestWorkflow:
    """Single-shot workflow executed by the history-ingest-1m schedule."""

    @workflow.run
    async def run(self) -> str:
        return await workflow.execute_activity(
            run_history_ingest,
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=RetryPolicy(maximum_attempts=1),
        )
