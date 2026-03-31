"""
Bokoen1 transcript ingestion workflow.

Ingests Bokoen1 YouTube transcripts into the bokoen1_transcripts Graphiti graph.
Can optionally download missing transcripts via yt-dlp first.
Progress is tracked in /mnt/data/data/bokoen1-ingestion-status.json.
"""
from dataclasses import dataclass
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.bokoen1_ingest_act import run_bokoen1_ingest


@dataclass
class Bokoen1IngestParams:
    download: bool = False
    download_limit: int = 100
    ingest_limit: int = 0


@workflow.defn
class Bokoen1IngestWorkflow:
    @workflow.run
    async def run(self, params: Bokoen1IngestParams | None = None) -> str:
        if params is None:
            params = Bokoen1IngestParams()
        return await workflow.execute_activity(
            run_bokoen1_ingest,
            args=[params.download, params.download_limit, params.ingest_limit],
            start_to_close_timeout=timedelta(hours=4),
            heartbeat_timeout=timedelta(minutes=5),
            retry_policy=RetryPolicy(
                maximum_attempts=2,
                initial_interval=timedelta(minutes=10),
            ),
        )
