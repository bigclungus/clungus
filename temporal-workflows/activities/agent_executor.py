"""
agent_executor.py — Activities for AgentTaskWorkflow execution paths.

wait_for_completion: used by the Claude/tracker path — heartbeats until
  mark_complete signal arrives (via Temporal cancellation).

run_xai_agent: used by the xAI path — calls the xAI API directly and returns
  the response. Moved here from the now-deleted xai_agent_activity.py.
"""

import asyncio
import json

import httpx
from temporalio import activity
from temporalio.exceptions import CancelledError

from agent_types import AgentTaskInput

XAI_API_URL = "https://api.x.ai/v1/chat/completions"

# Rough pricing per 1M tokens (input, output)
_PRICING: dict[str, tuple[float, float]] = {
    "grok-3-mini": (0.30, 0.50),
    "grok-3": (3.00, 15.00),
    "grok-2": (2.00, 10.00),
    "grok-beta": (5.00, 15.00),
}


def _estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    for key, (in_price, out_price) in _PRICING.items():
        if model.startswith(key):
            return round(
                (input_tokens / 1_000_000) * in_price
                + (output_tokens / 1_000_000) * out_price,
                8,
            )
    return 0.0


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


@activity.defn
async def run_xai_agent(
    prompt: str,
    model: str,
    api_key: str,
    task_id: str,
) -> dict:
    """
    Call xAI chat completions API and return response text + usage.

    Returns:
        {
            "status": "completed",
            "model": str,
            "response": str,
            "input_tokens": int,
            "output_tokens": int,
            "cost_usd": float,
        }
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
    }

    activity.heartbeat({"task_id": task_id, "status": "calling_xai_api"})

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(XAI_API_URL, headers=headers, json=payload)
        if resp.status_code != 200:
            raise RuntimeError(
                f"xAI API error {resp.status_code}: {resp.text[:500]}"
            )
        data = resp.json()

    activity.heartbeat({"task_id": task_id, "status": "received_response"})

    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError(f"xAI API returned no choices: {json.dumps(data)[:300]}")

    response_text = choices[0].get("message", {}).get("content", "")

    usage = data.get("usage", {})
    input_tokens = usage.get("prompt_tokens", 0)
    output_tokens = usage.get("completion_tokens", 0)
    cost_usd = _estimate_cost(model, input_tokens, output_tokens)

    return {
        "status": "completed",
        "model": model,
        "response": response_text,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": cost_usd,
    }
