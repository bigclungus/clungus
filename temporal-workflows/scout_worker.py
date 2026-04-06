"""
Temporal worker for the Model Scout workflow.

Runs on task queue "scout-queue". Separate from the main worker to keep
scouting concerns isolated.

Run with:
    python scout_worker.py
"""

import asyncio
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from temporalio.client import Client
from temporalio.worker import Worker

# Load .env relative to this file
load_dotenv(Path(__file__).parent / ".env")

# Common I/O activities
from activities.common.discord_io import (
    discord_add_reaction,
    discord_create_thread,
    discord_poll_reactions,
    discord_post_message,
)
from activities.common.fs_io import git_commit, write_file
from activities.common.http_io import fetch_json
from activities.common.llm_io import call_image_gen, call_llm

# Local (pure logic) activities
from activities.scout_local import (
    build_persona_frontmatter,
    determine_vote,
    filter_candidates,
    filter_non_text,
    generate_model_description,
    parse_persona_drafts,
    pick_winner,
)

# DB activities
from activities.scout_db import (
    db_get_known_ids,
    db_insert_model,
    db_update_status,
)

# Workflows
from workflows.model_scout_wf import ModelScoutWorkflow, PersonaOnboardingWorkflow

TASK_QUEUE = "scout-queue"
TEMPORAL_HOST = os.environ.get("TEMPORAL_HOST", "localhost:7233")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def main() -> None:
    logger.info("Connecting to Temporal at %s", TEMPORAL_HOST)
    client = await Client.connect(TEMPORAL_HOST)

    # Schedule the daily model scout cron (9am UTC)
    try:
        handle = await client.start_workflow(
            ModelScoutWorkflow.run,
            id="model-scout-daily",
            task_queue=TASK_QUEUE,
            cron_schedule="0 9 * * *",
        )
        logger.info(
            "Model scout cron scheduled: id=model-scout-daily run_id=%s",
            handle.result_run_id,
        )
    except Exception as exc:
        logger.info("Model scout cron already exists or scheduling skipped: %s", exc)

    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[
            ModelScoutWorkflow,
            PersonaOnboardingWorkflow,
        ],
        activities=[
            # Common I/O
            discord_add_reaction,
            discord_create_thread,
            discord_poll_reactions,
            discord_post_message,
            write_file,
            git_commit,
            fetch_json,
            call_llm,
            call_image_gen,
            # DB activities
            db_get_known_ids,
            db_insert_model,
            db_update_status,
            # Local logic
            filter_candidates,
            filter_non_text,
            determine_vote,
            parse_persona_drafts,
            pick_winner,
            build_persona_frontmatter,
            generate_model_description,
        ],
    )
    logger.info("Scout worker started on task queue %r", TASK_QUEUE)
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
