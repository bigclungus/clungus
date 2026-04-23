"""
LLM I/O activities — reusable across all workflows.

call_llm routes through together.ai's OpenAI-compatible endpoint.
"""

from temporalio import activity

from ..constants import TOGETHER_API_URL
from ..utils import get_together_key
from .http_io import post_json


@activity.defn
async def call_llm(
    model: str,
    system: str,
    prompt: str,
    max_tokens: int = 2048,
    temperature: float = 0.8,
) -> str:
    """Call an LLM via together.ai's OpenAI-compatible API. Returns the response text.

    Args:
        model: together.ai model identifier (e.g. "meta-llama/Meta-Llama-3-70B-Instruct")
        system: system prompt
        prompt: user prompt
        max_tokens: maximum tokens in the response (default 2048)
        temperature: sampling temperature (default 0.8)
    """
    api_key = get_together_key()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    status, data = await post_json(TOGETHER_API_URL, payload, headers=headers, timeout_s=60)
    if status != 200:
        raise RuntimeError(f"together.ai API error ({status}): {data}")

    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError(f"together.ai returned no choices: {data}")
    return choices[0]["message"]["content"]

