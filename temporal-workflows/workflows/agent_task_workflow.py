"""
AgentTaskWorkflow — tracker and executor for foreground/background agent tasks.

Two execution paths depending on input.provider (or model name prefix):

  claude (default):
    Shadow tracker mode. The agent is already running (spawned by Claude Code
    hooks). Workflow waits for a mark_complete signal from subagent-stop.ts,
    then finalizes the DB record.

  xai (model starts with "grok-"):
    Direct executor mode. Workflow calls run_xai_agent activity directly,
    which POSTs to the xAI API and returns the result. No external signal needed.

Control flow — claude path:
  1. create_task_record (Local Activity) — idempotent INSERT into tasks.db
  2. wait_condition on _complete flag — yields until mark_complete signal arrives
  3. finalize_task (Local Activity) — UPDATE tasks.db with result/status

Control flow — xai path:
  1. create_task_record (Local Activity) — idempotent INSERT into tasks.db
  2. run_xai_agent (Activity) — POST to xAI API, returns response + usage
  3. finalize_task (Local Activity) — UPDATE tasks.db with result/status

Signals: mark_complete, add_metadata, cancel
Query:   get_status
"""

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError, CancelledError

with workflow.unsafe.imports_passed_through():
    from activities.task_db import (
        create_task_record,
        finalize_task,
        record_error,
    )
    from activities.agent_executor import run_xai_agent
    from agent_types import AgentTaskInput


def _is_xai(input: AgentTaskInput) -> bool:
    """Return True when this task should use the xAI direct-call path."""
    if input.provider == "xai":
        return True
    # Infer from model name when provider is not explicitly set
    return input.model.startswith("grok-")


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

        if _is_xai(input):
            await self._run_xai(input)
        else:
            await self._run_claude(input)

        return self._result or {}

    # ------------------------------------------------------------------
    # xAI path — call the API directly, no external signal needed
    # ------------------------------------------------------------------

    async def _run_xai(self, input: AgentTaskInput) -> None:
        api_key = input.api_key
        if not api_key:
            raise ValueError(f"api_key is required for xAI tasks (task_id={input.task_id})")

        try:
            result = await workflow.execute_activity(
                run_xai_agent,
                args=[input.prompt, input.model, api_key, input.task_id],
                start_to_close_timeout=timedelta(minutes=5),
                heartbeat_timeout=timedelta(seconds=60),
                retry_policy=RetryPolicy(maximum_attempts=2),
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
            await workflow.execute_local_activity(
                finalize_task,
                args=[input, self._result or {"status": self._status}],
                start_to_close_timeout=timedelta(seconds=30),
            )

    # ------------------------------------------------------------------
    # Claude/tracker path — wait for external mark_complete signal
    # ------------------------------------------------------------------

    async def _run_claude(self, input: AgentTaskInput) -> None:
        # Wait for mark_complete signal (up to 90 minutes)
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
            # Always finalize — write status/tokens/cost to DB
            await workflow.execute_local_activity(
                finalize_task,
                args=[input, self._result or {"status": self._status}],
                start_to_close_timeout=timedelta(seconds=30),
            )

    # ------------------------------------------------------------------
    # Signals & queries (shared by both paths)
    # ------------------------------------------------------------------

    @workflow.signal
    async def mark_complete(self, data: dict) -> None:
        """
        Sent by subagent-stop.ts when the agent finishes.
        Sets the completion flag so wait_condition unblocks.
        Only meaningful on the claude path; ignored on xai path.
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
        self._complete = True  # unblock wait_condition on claude path

    @workflow.query
    def get_status(self) -> dict:
        """Return current status without side effects."""
        return {
            "task_id": workflow.info().workflow_id,
            "status": self._status,
            "metadata": self._metadata,
            "result": self._result,
        }
