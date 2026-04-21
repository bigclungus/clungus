"""
Temporal workflow: site healthcheck loop.

Checks all public clung.us endpoints every 60 seconds.
Alerts via Discord inject on state transitions only (up→down or down→up recovery).
Loops forever via continue_as_new to avoid memory growth.
"""
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.healthcheck_act import check_sites, send_alert


_CHECK_SITES_TIMEOUT = timedelta(seconds=60)
_CHECK_SITES_RETRY = RetryPolicy(maximum_attempts=3, initial_interval=timedelta(seconds=5))


@workflow.defn
class HealthcheckWorkflow:

    async def _run_check(self) -> dict:
        """Execute the check_sites activity with standard timeout and retry."""
        return await workflow.execute_activity(
            check_sites,
            start_to_close_timeout=_CHECK_SITES_TIMEOUT,
            retry_policy=_CHECK_SITES_RETRY,
        )

    @workflow.run
    async def run(self, previously_down: list[str] | None = None) -> None:
        """
        Run one healthcheck iteration, sleep 60s, then continue_as_new.

        previously_down: list of URLs that were down in the last iteration.
        """
        if previously_down is None:
            previously_down = []

        prev_down_set = set(previously_down)

        # Run the healthcheck activity with retries.
        # A transient failure is treated as "site unreachable" for this cycle;
        # the next iteration will correct it automatically.
        results: dict = await self._run_check()

        now_down_set: set[str] = {url for url, info in results.items() if not info["ok"]}

        # Determine state transitions.
        # Guard against stale URLs in prev_down_set that are no longer in SITES
        # (e.g. after a SITES list change between continue_as_new iterations).
        current_urls = set(results.keys())
        newly_down = now_down_set - prev_down_set
        recovered = (prev_down_set - now_down_set) & current_urls  # only URLs we actually checked

        # Confirmation step: if sites appear newly down, wait 30s and recheck
        # to avoid false alerts from transient failures.
        if newly_down:
            workflow.logger.info(
                "Sites appear down, waiting 30s for confirmation recheck: %s",
                ", ".join(sorted(newly_down)),
            )
            await workflow.sleep(timedelta(seconds=30))
            confirm_results: dict = await self._run_check()
            # Only alert for sites that are still down after the confirmation check
            confirmed_down = {
                url for url in newly_down
                if url in confirm_results and not confirm_results[url]["ok"]
            }
            # Update results with confirmation data for confirmed-down sites
            for url in confirmed_down:
                results[url] = confirm_results[url]
            # Sites that recovered during the 30s gap are not newly down
            newly_down = confirmed_down
            # Update now_down_set: remove sites that recovered during confirmation
            now_down_set = (now_down_set & prev_down_set) | confirmed_down

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
