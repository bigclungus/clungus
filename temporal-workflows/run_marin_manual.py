"""One-off manual runner for Marin SFH ListingsWorkflow."""
import asyncio
import json
import subprocess
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from temporalio.client import Client

from activities.constants import MAIN_CHANNEL_ID
from activities.utils import get_discord_token
from workflows.listings import ListingsWorkflow

CRITERIA_PATH = Path(__file__).parent / "criteria.json"

def load_marin_criteria() -> dict:
    """Load Marin SFH search criteria from criteria.json."""
    with open(CRITERIA_PATH) as f:
        data = json.load(f)
    for search in data["searches"]:
        if search.get("name") == "Marin SFH":
            return search
    raise ValueError("Marin SFH entry not found in criteria.json")

def format_price(price: int) -> str:
    """Format price as human-readable (e.g. 2000000 -> $2M)."""
    if price >= 1_000_000:
        val = price / 1_000_000
        if val == int(val):
            return f"${int(val)}M"
        return f"${val:.1f}M"
    if price >= 1_000:
        return f"${price // 1000}K"
    return f"${price}"

async def main():
    criteria = load_marin_criteria()
    client = await Client.connect("localhost:7233")
    run_id = f"listings-marin-manual-{int(time.time())}"
    print(f"Starting workflow with id={run_id}")
    result = await client.execute_workflow(
        ListingsWorkflow.run,
        criteria,
        id=run_id,
        task_queue="listings-queue",
    )
    print(f"Workflow completed. New listings posted: {result}")
    return result, criteria

result, criteria = asyncio.run(main())

min_p = format_price(criteria.get("min_price", 0))
max_p = format_price(criteria.get("max_price", 0))
listing_type = criteria.get("listing_type", "for sale").replace("_", " ")
price_range = f"{min_p}-{max_p}"
msg = f"marin manual run ({price_range}, {listing_type}): found {result} new listings"

# Post directly to Discord via bot API
token = get_discord_token()
subprocess.run([
    "curl", "-s", "-X", "POST",
    f"https://discord.com/api/v10/channels/{MAIN_CHANNEL_ID}/messages",
    "-H", f"Authorization: Bot {token}",
    "-H", "Content-Type: application/json",
    "-H", "User-Agent: DiscordBot (https://clung.us, 1.0)",
    "-d", json.dumps({"content": msg}),
], check=True)
print(f"Discord notified: {msg}")
