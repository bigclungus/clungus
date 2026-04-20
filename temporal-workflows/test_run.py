"""One-off test runner for ListingsWorkflow, posting to main chat channel."""
import asyncio
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from temporalio.client import Client

from activities.constants import MAIN_CHANNEL_ID, TEMPORAL_HOST
from workflows.listings import ListingsWorkflow

TEST_SEARCH = {
    "name": "Berkeley/Piedmont SFH",
    "locations": ["Berkeley, CA", "Piedmont, CA"],
    "min_price": 900000,
    "max_price": 1300000,
    "home_type": "sfh",
    "discord_channel_id": MAIN_CHANNEL_ID,
    "dry_run": True,
}

async def main():
    client = await Client.connect(TEMPORAL_HOST)
    run_id = f"listings-test-{int(time.time())}"
    print(f"Starting workflow with id={run_id}")
    result = await client.execute_workflow(
        ListingsWorkflow.run,
        TEST_SEARCH,
        id=run_id,
        task_queue="listings-queue",
    )
    print(f"Workflow completed. New listings posted: {result}")

asyncio.run(main())
