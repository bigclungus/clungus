"""
Temporal worker — registers all workflows and activities, schedules cron singletons.

Run with:
    python worker.py

Requires DISCORD_BOT_TOKEN in the environment (loaded from .env if present).
"""

from asyncio import run as asyncio_run
import json
import logging
import time
from pathlib import Path

from dotenv import load_dotenv
from temporalio.client import Client
from temporalio.worker import Worker

# Load .env relative to this file
load_dotenv(Path(__file__).parent / ".env")

from activities.constants import TEMPORAL_HOST
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
    congress_check_midpoint,
    congress_commit_evolutions,
    congress_create_tasks,
    congress_create_thread,
    congress_debate,
    congress_duel_vote,
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
from activities.discord_act import post_listings_summary
from activities.discord_ingest_act import run_discord_ingest
from activities.drift_scan_act import run_drift_scan
from activities.email_act import check_new_emails, inject_email_notification
from activities.github_act import github_inject_discord_notification, github_post_ack_comment
from activities.healthcheck_act import check_sites, send_alert
from activities.history_ingest_act import run_history_ingest
from activities.inject_act import inject_message
from activities.jobboard_act import (
    analyze_scraped_jobs,
    enrich_companies,
    fetch_existing_jobs,
    get_unenriched_companies,
    insert_new_jobs,
    notify_discord_new_jobs,
    scrape_career_pages,
    update_company_data,
)
from activities.persona_polls_act import run_create_persona_polls
from activities.mob_gen_act import (
    check_mob_cache,
    generate_mob_sprite,
    generate_mob_stats,
    save_mob_stats,
    select_entities_from_graph,
)
from activities.nightowl_act import nightowl_flag_risky, nightowl_inject, nightowl_poll_status
from activities.listing_commentary import generate_listing_commentary
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
from workflows.jobboard_wf import JobBoardWorkflow
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
CRITERIA_PATH = Path(__file__).parent / "criteria.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def _ensure_workflow(client: Client, workflow_fn, workflow_id: str, *, arg=None, cron_schedule: str = "") -> None:
    """Start or schedule a workflow idempotently (no-op if already running)."""
    kwargs: dict = {"id": workflow_id, "task_queue": TASK_QUEUE}
    if cron_schedule:
        kwargs["cron_schedule"] = cron_schedule
    try:
        if arg is not None:
            handle = await client.start_workflow(workflow_fn, arg, **kwargs)
        else:
            handle = await client.start_workflow(workflow_fn, **kwargs)
        logger.info("Workflow started: id=%s run_id=%s", workflow_id, handle.result_run_id)
    except Exception as exc:
        logger.info("Workflow %s already running or skipped: %s", workflow_id, exc)


async def main() -> None:
    logger.info("Connecting to Temporal at %s", TEMPORAL_HOST)
    client = await Client.connect(TEMPORAL_HOST)

    # Trigger the startup checklist (fire-and-forget — unique ID per run)
    await _ensure_workflow(client, StartupWorkflow.run, f"startup-{int(time.time())}")

    # Schedule each search as a daily cron workflow
    criteria = json.loads(CRITERIA_PATH.read_text())
    for search in criteria["searches"]:
        workflow_id = f"listings-{search['name'].replace(' ', '-').lower()}"
        await _ensure_workflow(client, ListingsWorkflow.run, workflow_id, arg=search, cron_schedule="0 8 * * *")

    # Singleton workflows (no cron — self-scheduling via continue_as_new)
    await _ensure_workflow(client, TaskSweeperWorkflow.run, "task-sweeper")
    await _ensure_workflow(client, HealthcheckWorkflow.run, "healthcheck-loop")
    await _ensure_workflow(client, HeartbeatWorkflow.run, "heartbeat")

    # Cron-scheduled workflows
    await _ensure_workflow(client, SimplifyCronWorkflow.run, "simplify-cron", cron_schedule="0 * * * *")
    await _ensure_workflow(client, TaskDbBackupWorkflow.run, "tasks-db-backup-cron", cron_schedule="0 */6 * * *")
    await _ensure_workflow(client, TestCronWorkflow.run, "test-cron", cron_schedule="0 */6 * * *")
    await _ensure_workflow(client, CongressAuditWorkflow.run, "congress-audit-cron", cron_schedule="0 20 * * *")
    await _ensure_workflow(client, DriftScanWorkflow.run, "drift-scan-daily", cron_schedule="0 13 * * *")
    await _ensure_workflow(client, DiscordIngestWorkflow.run, "discord-ingest-daily", arg=7, cron_schedule="0 2 * * *")
    await _ensure_workflow(client, JobBoardWorkflow.run, "jobboard-research-cron", cron_schedule="0 */12 * * *")

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
            JobBoardWorkflow,
        ],
        activities=[
            post_listings_summary,
            load_seen_ids,
            save_seen_ids,
            fetch_redfin_listings,
            generate_listing_commentary,
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
            congress_check_midpoint,
            congress_duel_vote,
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
            fetch_existing_jobs,
            scrape_career_pages,
            analyze_scraped_jobs,
            insert_new_jobs,
            notify_discord_new_jobs,
            get_unenriched_companies,
            enrich_companies,
            update_company_data,
        ],
    )
    logger.info("Worker started on task queue %r", TASK_QUEUE)
    await worker.run()


if __name__ == "__main__":
    asyncio_run(main())
