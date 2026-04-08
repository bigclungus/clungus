"""
agent_executor.py — Activity that waits for a mark_complete signal from subagent-stop.ts.

In shadow mode the agent is already running outside Temporal; this activity
heartbeats every 25 s to keep the workflow alive and exits when the workflow
sends it a cancellation (triggered by the mark_complete signal handler setting
the completion event, which causes Temporal to cancel the running activity via
workflow logic — see workflow for details).

The activity polls activity.is_cancelled() each loop iteration. When the
workflow receives mark_complete it stores the result and raises CancelledError
on the activity through Temporal's normal cancellation path. We catch that
here and return the stored result cleanly.

Usage tokens are zero-filled — workflow populates them from the signal payload.
"""

import asyncio

from temporalio import activity
from temporalio.exceptions import CancelledError

from agent_types import AgentTaskInput


@activity.defn
async def wait_for_completion(input: AgentTaskInput) -> dict:
    """
    Heartbeats every 25 s until Temporal cancels this activity.
    Cancellation is the signal that mark_complete was received.
    Returns a minimal result dict; the workflow fills in richer data
    from the signal payload stored in self._result.
    """
    try:
        while True:
            await asyncio.sleep(25)
            if activity.is_cancelled():
                raise CancelledError()
            activity.heartbeat({"task_id": input.task_id, "status": "running"})
    except (CancelledError, asyncio.CancelledError):
        # Normal path — mark_complete signal was received by the workflow,
        # which cancelled this activity. Return a placeholder; the workflow
        # will use self._result (populated from the signal) for finalize_task.
        return {
            "status": "completed",
            "model": input.model,
            "input_tokens": 0,
            "output_tokens": 0,
            "cost_usd": 0.0,
        }
