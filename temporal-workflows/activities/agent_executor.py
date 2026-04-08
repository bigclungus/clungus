"""
agent_executor.py — Activity that runs the claude CLI subprocess with heartbeats.

The subprocess runs for up to 90 minutes. A background task heartbeats every 25s
so Temporal knows the activity is still alive. heartbeat_timeout=90s in the
workflow means if two heartbeats are missed the activity is considered failed.

Usage tokens are currently zero-filled — replace _parse_output when claude CLI
exposes structured output with token counts.
"""

import asyncio
import os

from temporalio import activity
from temporalio.exceptions import CancelledError

from agent_types import AgentTaskInput


@activity.defn
async def execute_agent(input: AgentTaskInput) -> dict:
    if activity.is_cancelled():
        raise CancelledError()

    cmd = ["claude", "-p", input.prompt, "--model", input.model]

    if input.extra_cli_args:
        cmd.extend(input.extra_cli_args)

    env = os.environ.copy()
    if input.api_key:
        env["ANTHROPIC_API_KEY"] = input.api_key
        # Note: --api-key flag may not exist in all claude CLI versions; env var is safer
        # cmd.extend(["--api-key", input.api_key])

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    heartbeat_task = asyncio.create_task(_heartbeat_loop(proc, input.task_id))
    try:
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(
                f"claude exited {proc.returncode}: {stderr.decode()[:500]}"
            )
        return _parse_output(stdout.decode(), input.model)
    finally:
        if not heartbeat_task.done():
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass


async def _heartbeat_loop(proc: asyncio.subprocess.Process, task_id: str) -> None:
    """Send a heartbeat to Temporal every 25 seconds so activity stays alive."""
    while True:
        await asyncio.sleep(25)
        if proc.returncode is not None:
            break
        activity.heartbeat({"task_id": task_id, "status": "running", "pid": proc.pid})


def _parse_output(output: str, model: str) -> dict:
    """
    Parse claude CLI output into a structured result dict.
    Token counts are zero-filled until claude CLI exposes structured output.
    """
    return {
        "status": "success",
        "model": model,
        "output": output.strip(),
        "input_tokens": 0,
        "output_tokens": 0,
        "cost_usd": 0.0,
        "raw": output,
    }
