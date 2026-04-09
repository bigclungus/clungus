"""
Temporal worker — registers all workflows and activities, schedules cron singletons.

Run with:
    python worker.py

Requires DISCORD_BOT_TOKEN in the environment (loaded from .env if present).
"""

import asyncio
import json
import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from temporalio.client import Client
from temporalio.worker import Worker

# Load .env relative to this file
load_dotenv(Path(__file__).parent / ".env")

from activities.audit_act import (
    audit_sessions,
    load_sessions_since_last_audit,
    post_audit_results,
    save_audit_state,
)
from activities.congress_act import (
    congress_alert_failure,
    congress_announce,
    congress_check_ibrahim,
    congress_commit_evolutions,
    congress_create_tasks,
    congress_create_thread,
    congress_debate,
    congress_evolve,
    congress_finalize,
    congress_frame_topic,
    congress_graphiti_context,
    congress_identities,
    congress_load_session,
    congress_post_separator,
    congress_preflight_check,
    congress_report,
    congress_select_seats,
    congress_start,
    congress_vote,
)
from activities.bokoen1_ingest_act import run_bokoen1_ingest
from activities.discord_act import post_discord_message, post_listings_summary
from activities.discord_ingest_act import run_discord_ingest
from activities.drift_scan_act import run_drift_scan
from activities.email_act import check_new_emails, inject_email_notification
from activities.github_act import github_inject_discord_notification, github_post_ack_comment
from activities.healthcheck_act import check_sites, send_alert
from activities.history_ingest_act import run_history_ingest
from activities.http import rate_limited_get
from activities.inject_act import inject_message
from activities.persona_polls_act import run_create_persona_polls
from activities.mob_gen_act import (
    check_mob_cache,
    generate_mob_sprite,
    generate_mob_stats,
    save_mob_stats,
    select_entities_from_graph,
)
from activities.nightowl_act import nightowl_flag_risky, nightowl_inject, nightowl_poll_status
from activities.redfin import fetch_redfin_listings
from activities.reminder_act import send_reminder
from activities.simplify_act import run_simplify_review
from activities.startup_act import (
    startup_check_disk,
    startup_check_heartbeat,
    startup_check_services,
    startup_extract_directives,
    startup_fix_falkordb,
    startup_run_watchdog,
)
from activities.storage import load_seen_ids, save_seen_ids
from activities.sweeper_act import check_open_tasks
from activities.tasks_backup_act import backup_tasks_db
from activities.test_cron_act import alert_discord_test_failure, run_integration_tests
from activities.trial_act import (
    trial_alert_failure,
    trial_announce,
    trial_apply_retire_verdict,
    trial_generate_speech,
    trial_load_defendant,
    trial_phase_separator,
    trial_save_session,
    trial_verdict,
)
from workflows.audit_wf import CongressAuditWorkflow
from workflows.bokoen1_ingest_wf import Bokoen1IngestWorkflow
from workflows.discord_ingest_wf import DiscordIngestWorkflow
from workflows.drift_scan_wf import DriftScanWorkflow
from workflows.email_wf import EmailPollerWorkflow
from workflows.github_wf import GitHubWebhookWorkflow
from workflows.healthcheck_wf import HealthcheckWorkflow
from workflows.heartbeat_wf import HeartbeatWorkflow
from workflows.history_ingest_wf import HistoryIngestWorkflow
from workflows.listings import ListingsWorkflow, filter_new_listings
from workflows.mob_gen_wf import MobGenerationWorkflow
from workflows.persona_polls_wf import PersonaPollsWorkflow
from workflows.nightowl_wf import NightOwlWorkflow
from workflows.reminder_wf import OnceReminderWorkflow
from workflows.session_wf import CongressWorkflow, SessionWorkflow, TrialWorkflow
from workflows.simplify_wf import SimplifyCronWorkflow
from workflows.startup_wf import StartupWorkflow
from workflows.sweeper import TaskSweeperWorkflow
from workflows.tasks_backup_wf import TaskDbBackupWorkflow
from workflows.test_cron_wf import TestCronWorkflow

TASK_QUEUE = "listings-queue"
TEMPORAL_HOST = os.environ.get("TEMPORAL_HOST", "localhost:7233")
CRITERIA_PATH = Path(__file__).parent / "criteria.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def main() -> None:
    logger.info("Connecting to Temporal at %s", TEMPORAL_HOST)
    client = await Client.connect(TEMPORAL_HOST)

    # Trigger the startup checklist (fire-and-forget — worker handles it once running).
    # Use a unique ID per run so it always executes; don't await the result.
    try:
        await client.start_workflow(
            StartupWorkflow.run,
            id=f"startup-{int(time.time())}",
            task_queue=TASK_QUEUE,
        )
        logger.info("StartupWorkflow triggered")
    except Exception as exc:
        logger.info("StartupWorkflow trigger skipped: %s", exc)

    # Schedule each search as a daily cron workflow (idempotent: start_workflow
    # with the same workflow ID is a no-op if already running).
    criteria = json.loads(CRITERIA_PATH.read_text())
    for search in criteria["searches"]:
        workflow_id = f"listings-{search['name'].replace(' ', '-').lower()}"
        try:
            handle = await client.start_workflow(
                ListingsWorkflow.run,
                search,
                id=workflow_id,
                task_queue=TASK_QUEUE,
                cron_schedule="0 8 * * *",  # 8 AM daily
            )
            logger.info(
                "Cron workflow scheduled: id=%s run_id=%s",
                workflow_id,
                handle.result_run_id,
            )
        except Exception as exc:
            logger.info("Workflow %r already exists or scheduling skipped: %s", workflow_id, exc)

    # Start the 15-minute task sweeper workflow (no-op if already running)
    try:
        handle = await client.start_workflow(
            TaskSweeperWorkflow.run,
            id="task-sweeper",
            task_queue=TASK_QUEUE,
        )
        logger.info(
            "Task sweeper workflow started: id=task-sweeper run_id=%s",
            handle.result_run_id,
        )
    except Exception as exc:
        logger.info("Task sweeper workflow already running or start skipped: %s", exc)

    # Start the healthcheck workflow singleton (no-op if already running)
    try:
        handle = await client.start_workflow(
            HealthcheckWorkflow.run,
            id="healthcheck-loop",
            task_queue=TASK_QUEUE,
        )
        logger.info(
            "Healthcheck workflow started: id=healthcheck-loop run_id=%s",
            handle.result_run_id,
        )
    except Exception as exc:
        logger.info("Healthcheck workflow already running or start skipped: %s", exc)

    # Start the heartbeat workflow (no-op if already running)
    try:
        handle = await client.start_workflow(
            HeartbeatWorkflow.run,
            id="heartbeat",
            task_queue=TASK_QUEUE,
        )
        logger.info(
            "Heartbeat workflow started: id=heartbeat run_id=%s",
            handle.result_run_id,
        )
    except Exception as exc:
        logger.info("Heartbeat workflow already running or start skipped: %s", exc)

    # Schedule the simplify cron — runs every hour (idempotent: fixed workflow ID)
    try:
        handle = await client.start_workflow(
            SimplifyCronWorkflow.run,
            id="simplify-cron",
            task_queue=TASK_QUEUE,
            cron_schedule="0 * * * *",
        )
        logger.info(
            "Simplify cron workflow scheduled: id=simplify-cron run_id=%s",
            handle.result_run_id,
        )
    except Exception as exc:
        logger.info("Simplify cron workflow already exists or scheduling skipped: %s", exc)

    # Schedule the tasks.db backup cron — commits to git every 6 hours
    try:
        handle = await client.start_workflow(
            TaskDbBackupWorkflow.run,
            id="tasks-db-backup-cron",
            task_queue=TASK_QUEUE,
            cron_schedule="0 */6 * * *",
        )
        logger.info(
            "Tasks DB backup cron scheduled: id=tasks-db-backup-cron run_id=%s",
            handle.result_run_id,
        )
    except Exception as exc:
        logger.info("Tasks DB backup cron already exists or scheduling skipped: %s", exc)

    # Schedule the integration test cron — runs every 6 hours, alerts Discord on failure
    try:
        handle = await client.start_workflow(
            TestCronWorkflow.run,
            id="test-cron",
            task_queue=TASK_QUEUE,
            cron_schedule="0 */6 * * *",
        )
        logger.info(
            "Test cron workflow scheduled: id=test-cron run_id=%s",
            handle.result_run_id,
        )
    except Exception as exc:
        logger.info("Test cron workflow already exists or scheduling skipped: %s", exc)

    # Schedule the daily congress audit — runs at 20:00 UTC (noon Pacific)
    try:
        handle = await client.start_workflow(
            CongressAuditWorkflow.run,
            id="congress-audit-cron",
            task_queue=TASK_QUEUE,
            cron_schedule="0 20 * * *",
        )
        logger.info(
            "Congress audit cron scheduled: id=congress-audit-cron run_id=%s",
            handle.result_run_id,
        )
    except Exception as exc:
        logger.info("Congress audit cron already exists or scheduling skipped: %s", exc)

    # Schedule the daily drift scan — runs at 13:00 UTC (6am Pacific)
    try:
        handle = await client.start_workflow(
            DriftScanWorkflow.run,
            id="drift-scan-daily",
            task_queue=TASK_QUEUE,
            cron_schedule="0 13 * * *",
        )
        logger.info(
            "Drift scan cron scheduled: id=drift-scan-daily run_id=%s",
            handle.result_run_id,
        )
    except Exception as exc:
        logger.info("Drift scan cron already exists or scheduling skipped: %s", exc)

    # Schedule daily Discord → Graphiti ingestion — runs at 02:00 UTC
    try:
        handle = await client.start_workflow(
            DiscordIngestWorkflow.run,
            7,  # ingest last 7 days
            id="discord-ingest-daily",
            task_queue=TASK_QUEUE,
            cron_schedule="0 2 * * *",
        )
        logger.info(
            "Discord ingest cron scheduled: id=discord-ingest-daily run_id=%s",
            handle.result_run_id,
        )
    except Exception as exc:
        logger.info("Discord ingest cron already exists or scheduling skipped: %s", exc)

    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[
            ListingsWorkflow,
            TaskSweeperWorkflow,
            HealthcheckWorkflow,
            SessionWorkflow,
            CongressWorkflow,
            TrialWorkflow,
            SimplifyCronWorkflow,
            OnceReminderWorkflow,
            EmailPollerWorkflow,
            HeartbeatWorkflow,
            StartupWorkflow,
            GitHubWebhookWorkflow,
            TaskDbBackupWorkflow,
            NightOwlWorkflow,
            TestCronWorkflow,
            CongressAuditWorkflow,
            DriftScanWorkflow,
            HistoryIngestWorkflow,
            MobGenerationWorkflow,
            DiscordIngestWorkflow,
            Bokoen1IngestWorkflow,
            PersonaPollsWorkflow,
        ],
        activities=[
            rate_limited_get,
            post_discord_message,
            post_listings_summary,
            load_seen_ids,
            save_seen_ids,
            fetch_redfin_listings,
            filter_new_listings,  # local activity — still needs registration
            check_open_tasks,
            check_sites,
            send_alert,
            congress_announce,
            congress_start,
            congress_identities,
            congress_debate,
            congress_post_separator,
            congress_report,
            congress_create_thread,
            congress_finalize,
            congress_evolve,
            congress_commit_evolutions,
            congress_create_tasks,
            congress_select_seats,
            congress_frame_topic,
            congress_graphiti_context,
            congress_vote,
            congress_check_ibrahim,
            congress_alert_failure,
            congress_load_session,
            congress_preflight_check,
            run_simplify_review,
            send_reminder,
            check_new_emails,
            inject_email_notification,
            inject_message,
            startup_fix_falkordb,
            startup_check_heartbeat,
            startup_check_services,
            startup_check_disk,
            startup_run_watchdog,
            startup_extract_directives,
            github_post_ack_comment,
            github_inject_discord_notification,
            backup_tasks_db,
            nightowl_inject,
            nightowl_flag_risky,
            nightowl_poll_status,
            run_integration_tests,
            alert_discord_test_failure,
            load_sessions_since_last_audit,
            audit_sessions,
            save_audit_state,
            post_audit_results,
            run_drift_scan,
            run_history_ingest,
            run_discord_ingest,
            run_bokoen1_ingest,
            run_create_persona_polls,
            trial_alert_failure,
            trial_announce,
            trial_apply_retire_verdict,
            trial_generate_speech,
            trial_load_defendant,
            trial_phase_separator,
            trial_save_session,
            trial_verdict,
            select_entities_from_graph,
            check_mob_cache,
            generate_mob_stats,
            save_mob_stats,
            generate_mob_sprite,
        ],
    )
    logger.info("Worker started on task queue %r", TASK_QUEUE)
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
