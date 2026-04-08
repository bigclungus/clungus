#!/usr/bin/env python3
"""
test_xai_agent.py — Invoke AgentTaskWorkflow with xAI/Grok input via Temporal SDK.

Usage:
    python3 /mnt/data/scripts/test_xai_agent.py

Reads XAI_API_KEY from environment or /mnt/data/secrets/xai_api_key.
"""

import asyncio
import os
import sys
from pathlib import Path
from uuid import uuid4

# Add temporal-workflows dir to path so we can import the types
sys.path.insert(0, "/mnt/data/temporal-workflows")

from dotenv import load_dotenv
from temporalio.client import Client

load_dotenv("/mnt/data/temporal-workflows/.env", override=True)

from agent_types import AgentTaskInput
from workflows.agent_task_workflow import AgentTaskWorkflow


def _load_api_key() -> str:
    key = os.environ.get("XAI_API_KEY", "").strip()
    if key:
        return key
    secret_path = Path("/mnt/data/secrets/xai_api_key")
    if secret_path.exists():
        key = secret_path.read_text().strip()
        if key:
            return key
    raise RuntimeError(
        "No XAI_API_KEY found. Set the env var or write key to /mnt/data/secrets/xai_api_key"
    )


async def main() -> None:
    api_key = _load_api_key()
    print(f"Using API key: {api_key[:12]}...{api_key[-4:]}")

    client = await Client.connect("localhost:7233")

    task_id = f"xai-test-{uuid4().hex[:8]}"
    print(f"Starting AgentTaskWorkflow with xAI input (task_id={task_id})...")

    handle = await client.start_workflow(
        AgentTaskWorkflow.run,
        AgentTaskInput(
            task_id=task_id,
            prompt="tell me a joke",
            model="grok-3-mini",
            api_key=api_key,
            provider="xai",
            agent_type="custom",
            is_foreground=False,
            metadata={"description": "test: tell me a joke"},
        ),
        id=task_id,
        task_queue="listings-queue",
    )

    print("Workflow started. Waiting for result...")
    result = await handle.result()

    print("\n--- Result ---")
    print(f"Status:        {result.get('status')}")
    print(f"Model:         {result.get('model')}")
    print(f"Input tokens:  {result.get('input_tokens')}")
    print(f"Output tokens: {result.get('output_tokens')}")
    print(f"Cost USD:      {result.get('cost_usd')}")
    print(f"\nResponse:\n{result.get('response')}")
    return result


if __name__ == "__main__":
    result = asyncio.run(main())
