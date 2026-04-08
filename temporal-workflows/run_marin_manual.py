"""One-off manual runner for Marin SFH ListingsWorkflow ($0-$500k)."""
import asyncio
import json
import subprocess
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from temporalio.client import Client

from workflows.listings import ListingsWorkflow

MARIN_SEARCH = {
    "name": "Marin SFH",
    "locations": ["Mill Valley, CA", "Tiburon, CA", "Sausalito, CA", "San Rafael, CA", "Larkspur, CA", "Corte Madera, CA"],
    "min_price": 0,
    "max_price": 500000,
    "home_type": "sfh",
    "listing_type": "for_sale",
    "discord_channel_id": "1383689218861039686",
    "dry_run": False,
}

async def main():
    client = await Client.connect("localhost:7233")
    run_id = f"listings-marin-manual-{int(time.time())}"
    print(f"Starting workflow with id={run_id}")
    result = await client.execute_workflow(
        ListingsWorkflow.run,
        MARIN_SEARCH,
        id=run_id,
        task_queue="listings-queue",
    )
    print(f"Workflow completed. New listings posted: {result}")
    return result

result = asyncio.run(main())

msg = f"marin manual run (rentals excluded): found {result} new listings"
subprocess.run([
    "curl", "-s", "-X", "POST", "http://127.0.0.1:8085/webhooks/bigclungus-main",
    "-H", "Content-Type: application/json",
    "-d", json.dumps({"content": msg, "user": "clungus"}),
])
print(f"Discord notified: {msg}")
