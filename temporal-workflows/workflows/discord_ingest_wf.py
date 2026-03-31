"""
Discord → Graphiti incremental ingestion workflow.

Scheduled to run periodically (e.g. daily). Fetches recent Discord messages
and ingests new user-week episodes into the Graphiti knowledge graph.
Rate limit backoff is handled inside the activity.
"""
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.discord_ingest_act import run_discord_ingest


@workflow.defn
class DiscordIngestWorkflow:
    @workflow.run
    async def run(self, days: int = 7) -> str:
        return await workflow.execute_activity(
            run_discord_ingest,
            days,
            start_to_close_timeout=timedelta(hours=2),
            retry_policy=RetryPolicy(
                maximum_attempts=2,
                initial_interval=timedelta(minutes=5),
            ),
        )
