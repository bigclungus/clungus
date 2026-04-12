"""
Manual test runner for the JobBoardWorkflow.

Usage:
    python run_jobboard.py
"""

import asyncio
import os

from temporalio.client import Client

TEMPORAL_HOST = os.environ.get("TEMPORAL_HOST", "localhost:7233")
TASK_QUEUE = "listings-queue"


async def main() -> None:
    client = await Client.connect(TEMPORAL_HOST)

    from workflows.jobboard_wf import JobBoardWorkflow

    handle = await client.start_workflow(
        JobBoardWorkflow.run,
        id="jobboard-manual-test",
        task_queue=TASK_QUEUE,
    )
    print(f"Started JobBoardWorkflow: id={handle.id} run_id={handle.result_run_id}")
    print("Waiting for result...")

    result = await handle.result()
    print(f"Result: {result}")


if __name__ == "__main__":
    asyncio.run(main())
