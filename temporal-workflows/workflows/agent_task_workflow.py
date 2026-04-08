"""
AgentTaskWorkflow — shadow tracker for foreground subagent tasks.

In shadow mode the agent is already running (spawned by Claude Code hooks).
This workflow tracks it, waits for a mark_complete signal from subagent-stop.ts,
then finalizes the DB record.

Control flow:
  1. create_task_record (Local Activity) — idempotent INSERT into agents.db
  2. wait_condition on _complete flag — yields until mark_complete signal arrives
  3. finalize_task (Local Activity) — UPDATE agents.db with result/status

Signals: mark_complete, add_metadata, cancel
Query:   get_status
"""

from datetime import timedelta

from temporalio import workflow
from temporalio.exceptions import CancelledError

with workflow.unsafe.imports_passed_through():
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
        self._complete = False

    @workflow.run
    async def run(self, input: AgentTaskInput) -> dict:
        # Step 1: idempotent DB record creation
        await workflow.execute_local_activity(
            create_task_record,
            input,
            start_to_close_timeout=timedelta(seconds=10),
        )

        # Step 2: wait for mark_complete signal (up to 90 minutes)
        try:
            await workflow.wait_condition(
                lambda: self._complete or self._status == "cancelled",
                timeout=timedelta(minutes=90),
            )
        except TimeoutError:
            self._status = "timed_out"
            self._result = {"status": "timed_out"}
            await workflow.execute_local_activity(
                record_error,
                args=[input.task_id, "workflow timed out waiting for mark_complete"],
                start_to_close_timeout=timedelta(seconds=10),
            )
        except CancelledError:
            self._status = "cancelled"
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
    async def mark_complete(self, data: dict) -> None:
        """
        Sent by subagent-stop.ts when the agent finishes.
        Sets the completion flag so wait_condition unblocks.
        """
        self._metadata.update(data)
        self._result = {
            "status": "completed",
            "completed_at": data.get("completed_at"),
            "last_message_preview": data.get("last_message_preview", ""),
            "exit_reason": data.get("exit_reason", "completed"),
            "input_tokens": 0,
            "output_tokens": 0,
            "cost_usd": 0.0,
        }
        self._status = "completed"
        self._complete = True

    @workflow.signal
    async def add_metadata(self, data: dict) -> None:
        """Accept runtime metadata updates from hooks or external callers."""
        self._metadata.update(data)

    @workflow.signal
    async def cancel(self) -> None:
        """Request cancellation of this workflow."""
        self._status = "cancelled"
        self._complete = True  # unblock wait_condition

    @workflow.query
    def get_status(self) -> dict:
        """Return current status without side effects."""
        return {
            "task_id": workflow.info().workflow_id,
            "status": self._status,
            "metadata": self._metadata,
            "result": self._result,
        }
