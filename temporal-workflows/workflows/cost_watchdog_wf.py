"""
Cost watchdog workflow — runs on a schedule every 5 minutes.
Reads Claude session JSONL files to track cumulative daily cost.
Stops claude-bot.service if cost exceeds the configured limit.
"""
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.cost_watchdog_act import run_cost_watchdog


@workflow.defn
class CostWatchdogWorkflow:
    @workflow.run
    async def run(self) -> str:
        return await workflow.execute_activity(
            run_cost_watchdog,
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=RetryPolicy(maximum_attempts=1),
        )
