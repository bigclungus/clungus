"""
Temporal workflow: site healthcheck loop.

Checks all public clung.us endpoints every 60 seconds.
Alerts via Discord inject on state transitions only (up→down or down→up recovery).
Loops forever via continue_as_new to avoid memory growth.
"""
from datetime import timedelta
from typing import Optional

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.healthcheck_act import check_sites, send_alert


@workflow.defn
class HealthcheckWorkflow:
    @workflow.run
    async def run(self, previously_down: Optional[list[str]] = None) -> None:
        """
        Run one healthcheck iteration, sleep 60s, then continue_as_new.

        previously_down: list of URLs that were down in the last iteration.
        """
        if previously_down is None:
            previously_down = []

        prev_down_set = set(previously_down)

        # Run the healthcheck activity — no retries, fire-and-forget style.
        # A transient failure is treated as "site unreachable" for this cycle;
        # the next iteration will correct it automatically.
        results: dict = await workflow.execute_activity(
            check_sites,
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=RetryPolicy(maximum_attempts=1),
        )

        now_down_set: set[str] = {url for url, info in results.items() if not info["ok"]}

        # Determine state transitions.
        # Guard against stale URLs in prev_down_set that are no longer in SITES
        # (e.g. after a SITES list change between continue_as_new iterations).
        current_urls = set(results.keys())
        newly_down = now_down_set - prev_down_set
        recovered = (prev_down_set - now_down_set) & current_urls  # only URLs we actually checked

        for url in sorted(newly_down):
            info = results[url]
            detail = info["error"] if info["error"] else str(info["status_code"])
            msg = f"🚨 **{url}** is down — {detail} (latency: {info['latency_ms']}ms)"
            workflow.logger.warning("ALERT: %s", msg)
            await workflow.execute_activity(
                send_alert,
                msg,
                start_to_close_timeout=timedelta(seconds=15),
                retry_policy=RetryPolicy(maximum_attempts=3),
            )

        for url in sorted(recovered):
            info = results[url]
            msg = (
                f"✅ **{url}** recovered (was down, now {info['status_code']}, "
                f"latency: {info['latency_ms']}ms)"
            )
            workflow.logger.info("RECOVERY: %s", msg)
            await workflow.execute_activity(
                send_alert,
                msg,
                start_to_close_timeout=timedelta(seconds=15),
                retry_policy=RetryPolicy(maximum_attempts=3),
            )

        if not newly_down and not recovered:
            workflow.logger.info(
                "All sites OK: %s",
                ", ".join(f"{u} ({results[u]['status_code']}, {results[u]['latency_ms']}ms)"
                          for u in sorted(results)),
            )

        # Sleep 60 seconds, then loop via continue_as_new
        await workflow.sleep(timedelta(seconds=60))

        workflow.continue_as_new(list(now_down_set))
