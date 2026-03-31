"""
Temporal workflow: CongressAuditWorkflow

Runs daily at 20:00 UTC (noon Pacific) to audit all congress sessions
that have completed since the last audit run. Generates a BigClungus
self-audit covering vote tally accuracy, persona reasoning quality,
evolution/firing decision quality, and actionability of verdicts.

If the consolidated report is short enough it posts directly to the main
Discord channel; otherwise it posts a summary there and the full details
to a thread.
"""

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.audit_act import (
        audit_sessions,
        load_sessions_since_last_audit,
        post_audit_results,
        save_audit_state,
    )


@workflow.defn
class CongressAuditWorkflow:
    @workflow.run
    async def run(self) -> str:
        """Run one congressional audit pass. Temporal re-schedules via cron_schedule."""
        retry = RetryPolicy(
            maximum_attempts=3,
            initial_interval=timedelta(seconds=30),
            maximum_interval=timedelta(minutes=5),
        )

        # Step 1: load sessions completed since last audit
        sessions = await workflow.execute_activity(
            load_sessions_since_last_audit,
            start_to_close_timeout=timedelta(minutes=2),
            retry_policy=retry,
        )

        if not sessions:
            workflow.logger.info("CongressAuditWorkflow: no new sessions since last audit")
            return "no sessions to audit"

        workflow.logger.info(
            "CongressAuditWorkflow: auditing %d session(s)", len(sessions)
        )

        # Step 2: generate the audit text via Claude CLI
        audit_text = await workflow.execute_activity(
            audit_sessions,
            sessions,
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=retry,
        )

        # Step 3: post the results to Discord
        await workflow.execute_activity(
            post_audit_results,
            audit_text,
            start_to_close_timeout=timedelta(minutes=2),
            retry_policy=retry,
        )

        # Step 4: save updated audit state (timestamp of most recent session audited)
        latest_ts = max(s.get("completed_at", s.get("finished_at", "")) for s in sessions)
        await workflow.execute_activity(
            save_audit_state,
            latest_ts,
            start_to_close_timeout=timedelta(minutes=1),
            retry_policy=retry,
        )

        return f"audited {len(sessions)} session(s)"
