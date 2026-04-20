"""
tasks_worker.py — Temporal worker for the AgentTask tracking system.

Connects to namespace="tasks", task_queue="agent-tasks-queue".
Registers AgentTaskWorkflow, ContextSnapshotWorkflow, and all activities.

Run:
    python tasks_worker.py

Environment:
    TEMPORAL_HOST — defaults to localhost:7233
"""

import asyncio
import logging
from pathlib import Path

from dotenv import load_dotenv
from temporalio.client import Client
from temporalio.worker import Worker

load_dotenv(Path(__file__).parent / ".env")

from activities.constants import TEMPORAL_HOST
from activities.agent_executor import run_xai_agent
from activities.task_db import create_task_record, finalize_task, record_error, poll_agent_status
from activities.context_snapshot import generate_context_snapshot
from agent_types import AgentTaskInput  # noqa: F401 — needed for Temporal dataclass serialization
from workflows.agent_task_workflow import AgentTaskWorkflow
from workflows.context_snapshot_wf import ContextSnapshotWorkflow

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("tasks-worker")

NAMESPACE = "tasks"
TASK_QUEUE = "agent-tasks-queue"


async def main() -> None:
    logger.info("Connecting to Temporal at %s (namespace=%s)", TEMPORAL_HOST, NAMESPACE)
    client = await Client.connect(TEMPORAL_HOST, namespace=NAMESPACE)

    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[AgentTaskWorkflow, ContextSnapshotWorkflow],
        activities=[run_xai_agent, create_task_record, finalize_task, record_error, poll_agent_status, generate_context_snapshot],
    )

    logger.info("Worker started on task queue %r (namespace=%r)", TASK_QUEUE, NAMESPACE)
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
