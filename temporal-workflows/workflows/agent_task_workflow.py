"""
AgentTaskWorkflow — durable orchestrator for foreground subagent tasks.

Control flow:
  1. create_task_record (Local Activity) — idempotent INSERT into agents.db
  2. execute_agent (Activity with heartbeat) — runs claude CLI subprocess
  3. finalize_task (Local Activity) — UPDATE agents.db with result/status/tokens
  Error path: record_error (Local Activity) called before finalize on failure.

Signals: add_metadata, cancel
Query:   get_status
"""

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError, CancelledError

with workflow.unsafe.imports_passed_through():
    from activities.agent_executor import execute_agent
    from activities.task_db import (
        create_task_record,
        finalize_task,
        record_error,
    )
    from agent_types import AgentTaskInput


@workflow.defn(name="AgentTaskWorkflow")
class AgentTaskWorkflow:
    def __init__(self) -> None:
        self._status = "running"
        self._metadata: dict = {}
        self._result: dict | None = None

    @workflow.run
    async def run(self, input: AgentTaskInput) -> dict:
        # Step 1: idempotent DB record creation
        await workflow.execute_local_activity(
            create_task_record,
            input,
            start_to_close_timeout=timedelta(seconds=10),
        )

        try:
            # Step 2: run the actual agent subprocess with heartbeats
            result = await workflow.execute_activity(
                execute_agent,
                input,
                start_to_close_timeout=timedelta(minutes=90),
                heartbeat_timeout=timedelta(seconds=90),
                retry_policy=RetryPolicy(maximum_attempts=1),
            )
            self._result = result
            self._status = "completed"
        except ActivityError as e:
            if isinstance(e.cause, CancelledError) or "cancelled" in str(e).lower():
                self._status = "cancelled"
            else:
                self._status = "failed"
                await workflow.execute_local_activity(
                    record_error,
                    args=[input.task_id, str(e)],
                    start_to_close_timeout=timedelta(seconds=10),
                )
            raise
        finally:
            # Step 3: always finalize — write status/tokens/cost to DB
            await workflow.execute_local_activity(
                finalize_task,
                args=[input, self._result or {"status": self._status}],
                start_to_close_timeout=timedelta(seconds=30),
            )

        return self._result or {}

    @workflow.signal
    async def add_metadata(self, data: dict) -> None:
        """Accept runtime metadata updates from hooks or external callers."""
        self._metadata.update(data)

    @workflow.signal
    async def cancel(self) -> None:
        """Request cancellation of this workflow."""
        self._status = "cancelled"

    @workflow.query
    def get_status(self) -> dict:
        """Return current status without side effects."""
        return {
            "task_id": workflow.info().workflow_id,
            "status": self._status,
            "metadata": self._metadata,
            "result": self._result,
        }
