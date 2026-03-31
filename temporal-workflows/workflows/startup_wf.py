"""StartupWorkflow — runs the restart checklist and notifies Discord only if something is wrong."""
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.constants import MAIN_CHANNEL_ID
    from activities.inject_act import inject_message
    from activities.startup_act import (
        startup_check_disk,
        startup_check_heartbeat,
        startup_check_services,
        startup_extract_directives,
        startup_fix_falkordb,
        startup_run_watchdog,
    )

NO_RETRY = RetryPolicy(maximum_attempts=1)
TIMEOUT = timedelta(seconds=120)


@workflow.defn
class StartupWorkflow:
    """Run the restart checklist. Only injects to Discord if something is wrong."""

    @workflow.run
    async def run(self) -> None:
        issues: list[str] = []

        # 1. FalkorDB fix
        falkordb_result = await workflow.execute_activity(
            startup_fix_falkordb,
            schedule_to_close_timeout=TIMEOUT,
            retry_policy=NO_RETRY,
        )
        if falkordb_result != "ok":
            issues.append(f"FalkorDB fix failed: {falkordb_result}")

        # 2. Services
        failed_services = await workflow.execute_activity(
            startup_check_services,
            schedule_to_close_timeout=TIMEOUT,
            retry_policy=NO_RETRY,
        )
        if failed_services:
            issues.append(f"Failed services: {', '.join(failed_services)}")

        # 3. Disk
        disk = await workflow.execute_activity(
            startup_check_disk,
            schedule_to_close_timeout=TIMEOUT,
            retry_policy=NO_RETRY,
        )
        if disk.get("warning"):
            issues.append(
                f"Disk warning: root={disk.get('root_pct')}%, data={disk.get('data_pct')}%"
            )

        # 4. Stale task watchdog
        watchdog_output = await workflow.execute_activity(
            startup_run_watchdog,
            schedule_to_close_timeout=TIMEOUT,
            retry_policy=NO_RETRY,
        )
        if "stale" in watchdog_output.lower() and "0 task" not in watchdog_output.lower():
            issues.append(f"Stale tasks: {watchdog_output}")

        # 5. Heartbeat liveness check
        heartbeat_result = await workflow.execute_activity(
            startup_check_heartbeat,
            schedule_to_close_timeout=TIMEOUT,
            retry_policy=NO_RETRY,
        )
        if heartbeat_result != "ok":
            issues.append(f"Heartbeat liveness: {heartbeat_result}")

        # 6. Extract directives (informational — failure worth reporting but doesn't block)
        directives_result = await workflow.execute_activity(
            startup_extract_directives,
            schedule_to_close_timeout=TIMEOUT,
            retry_policy=NO_RETRY,
        )
        if directives_result.startswith("ERROR"):
            issues.append(f"Directives extraction failed: {directives_result}")

        # Only notify Discord if something is wrong
        if issues:
            msg = "⚠️ **Restart checklist issues:**\n" + "\n".join(f"- {i}" for i in issues)
            await workflow.execute_activity(
                inject_message,
                args=[msg, "startup-check", MAIN_CHANNEL_ID],
                schedule_to_close_timeout=TIMEOUT,
                retry_policy=NO_RETRY,
            )
