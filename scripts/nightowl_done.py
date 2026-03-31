#!/usr/bin/env python3
"""Signal NightOwlWorkflow that the current task is done."""
import asyncio
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / "temporal-workflows" / ".env")

import os
from temporalio.client import Client

TEMPORAL_HOST = os.environ.get("TEMPORAL_HOST", "localhost:7233")
WORKFLOW_ID = "nightowl-today"

async def main():
    client = await Client.connect(TEMPORAL_HOST)
    handle = client.get_workflow_handle(WORKFLOW_ID)
    await handle.signal("task_done")
    print("[nightowl-done] Signaled task_done to NightOwlWorkflow")

if __name__ == "__main__":
    asyncio.run(main())
