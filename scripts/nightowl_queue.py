#!/usr/bin/env python3
"""
nightowl_queue.py — queue a task for 1am execution via NightOwlWorkflow.

Usage:
  python3 /mnt/data/scripts/nightowl_queue.py "do the python to typescript migration"

The script:
  1. Tries to start NightOwlWorkflow with id "nightowl-today"
     (no-op if already running — WorkflowAlreadyStartedError is caught).
  2. Signals the running workflow with add_task("<task>".
"""
import asyncio
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env from temporal-workflows so TEMPORAL_HOST etc. are available
load_dotenv(Path(__file__).parent.parent / "temporal-workflows" / ".env")

import os
from temporalio.client import Client
from temporalio.exceptions import WorkflowAlreadyStartedError
from temporalio.service import RPCError


TEMPORAL_HOST = os.environ.get("TEMPORAL_HOST", "localhost:7233")
TASK_QUEUE = "listings-queue"
WORKFLOW_ID = "nightowl-today"


async def main(task: str) -> None:
    client = await Client.connect(TEMPORAL_HOST)

    # Try to start the workflow; ignore if already running
    try:
        handle = await client.start_workflow(
            "NightOwlWorkflow",
            id=WORKFLOW_ID,
            task_queue=TASK_QUEUE,
        )
        print(f"[nightowl] Started NightOwlWorkflow (id={WORKFLOW_ID}, run_id={handle.result_run_id})")
    except (WorkflowAlreadyStartedError, RPCError) as exc:
        if isinstance(exc, RPCError) and exc.status.value != 6:
            raise
        print(f"[nightowl] Workflow already running (id={WORKFLOW_ID}), will signal it")

    # Signal the workflow to add the task (use get_handle in case start returned a handle above)
    sig_handle = client.get_workflow_handle(WORKFLOW_ID)
    await sig_handle.signal("add_task", task)
    print(f"[nightowl] Queued task: {task!r}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 nightowl_queue.py <task description>", file=sys.stderr)
        sys.exit(1)
    task_arg = " ".join(sys.argv[1:])
    if task_arg.startswith("-"):
        print(f"Error: task description cannot start with '-' (got {task_arg!r}). Did you mean to pass a flag?", file=sys.stderr)
        print("Usage: python3 nightowl_queue.py <task description>", file=sys.stderr)
        sys.exit(1)
    asyncio.run(main(task_arg))
