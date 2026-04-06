"""
LLM I/O activities — reusable across all workflows.

call_llm routes through together.ai's OpenAI-compatible endpoint.
call_image_gen is stubbed for now pending image gen service selection.
"""

import logging

import aiohttp
from temporalio import activity

from ..utils import load_env_key

logger = logging.getLogger(__name__)

TOGETHER_API_URL = "https://api.together.xyz/v1/chat/completions"


def _get_together_key() -> str:
    """Load TOGETHER_API_KEY from env or .env files."""
    return load_env_key("TOGETHER_API_KEY")


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
    api_key = _get_together_key()
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

    timeout = aiohttp.ClientTimeout(total=60)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(TOGETHER_API_URL, headers=headers, json=payload) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise RuntimeError(f"together.ai API error ({resp.status}): {body}")
            data = await resp.json()

    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError(f"together.ai returned no choices: {data}")
    return choices[0]["message"]["content"]


@activity.defn
async def call_image_gen(prompt: str) -> str:
    """Generate an avatar image from a prompt. Returns image URL.

    TODO: Implement when image gen service is selected (FLUX on together.ai,
    or another provider). For now, raises NotImplementedError so callers
    know to handle the stub.
    """
    raise NotImplementedError(
        "call_image_gen is not yet implemented — image gen service TBD"
    )
