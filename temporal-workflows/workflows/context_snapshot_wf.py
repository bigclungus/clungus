"""
Temporal workflow: ContextSnapshotWorkflow

Generates a shared context snapshot (CONTEXT.md) from recent session JSONL analysis.
Calls generate_context_snapshot as a local activity with a 5-minute timeout.
"""

from datetime import timedelta

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from activities.context_snapshot import generate_context_snapshot


@workflow.defn(name="ContextSnapshotWorkflow")
class ContextSnapshotWorkflow:
    @workflow.run
    async def run(self) -> dict:
        return await workflow.execute_local_activity(
            generate_context_snapshot,
            start_to_close_timeout=timedelta(minutes=5),
        )
