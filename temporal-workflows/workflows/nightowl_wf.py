"""
NightOwlWorkflow — queue unlimited tasks, fire in batches of up to 5 at 3am PDT (10am UTC).

Design:
- add_task signal: unlimited queue
- At 3am PDT: pre-flight safety scan, then inject up to 5 tasks concurrently per batch
- Each injected task is tagged with a unique task_id; workflow polls clunger every 30s
  for up to 10 minutes to detect completion
- After all tasks in a batch complete (or timeout), inject next batch
- Pre-flight: tasks matching risky keywords are held and flagged in Discord before firing
"""
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.nightowl_act import nightowl_flag_risky, nightowl_inject, nightowl_poll_status


# Keywords that trigger a pre-flight hold
RISKY_KEYWORDS = [
    "temporal workflow", "nightowl", "heartbeat", "simplify",
    "systemd", "drop table", "delete database",
    "rm -rf", "reset --hard", "force push",
]

BATCH_SIZE = 5
POLL_INTERVAL_SECONDS = 30
POLL_MAX_ATTEMPTS = 20  # 20 * 30s = 10 minutes per task


@workflow.defn
class NightOwlWorkflow:
    def __init__(self):
        self._tasks: list[str] = []

    @workflow.signal
    def add_task(self, task: str):
        self._tasks.append(task)
        workflow.logger.info(f"NightOwl queued ({len(self._tasks)} total): {task[:80]!r}")

    @workflow.signal
    def clear_tasks(self):
        """Purge all queued tasks without terminating the workflow."""
        count = len(self._tasks)
        self._tasks.clear()
        workflow.logger.info(f"NightOwl tasks cleared ({count} removed)")

    @workflow.query
    def list_tasks(self) -> list[str]:
        """Return the current task queue."""
        return list(self._tasks)

    @workflow.run
    async def run(self, target_hour_utc: int = 10) -> dict:
        # Sleep until 3am PDT = 10am UTC
        now = workflow.now()
        target = now.replace(hour=target_hour_utc, minute=0, second=0, microsecond=0)
        if now >= target:
            target = target + timedelta(days=1)

        wait_seconds = (target - now).total_seconds()
        workflow.logger.info(f"NightOwl sleeping {wait_seconds:.0f}s until {target} UTC")
        await workflow.sleep(timedelta(seconds=wait_seconds))

        if not self._tasks:
            return {"fired": False, "reason": "no tasks queued"}

        # Pre-flight: scan for risky tasks
        safe_tasks = []
        risky_tasks = []
        for task in self._tasks:
            task_lower = task.lower()
            if any(kw in task_lower for kw in RISKY_KEYWORDS):
                risky_tasks.append(task)
            else:
                safe_tasks.append(task)

        # Flag risky tasks in Discord and skip them
        for task in risky_tasks:
            await workflow.execute_activity(
                nightowl_flag_risky,
                task,
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=RetryPolicy(maximum_attempts=3),
            )

        if not safe_tasks:
            return {"fired": False, "reason": "all tasks held for safety review", "held": risky_tasks}

        # Process safe tasks in batches of BATCH_SIZE
        all_results = []
        task_counter = int(workflow.now().timestamp())

        for batch_start in range(0, len(safe_tasks), BATCH_SIZE):
            batch = safe_tasks[batch_start:batch_start + BATCH_SIZE]
            workflow.logger.info(f"NightOwl firing batch of {len(batch)} tasks")

            # Generate unique task_ids and inject tasks with task_id appended
            task_ids = []
            for i, task in enumerate(batch):
                task_id = f"nightowl-{task_counter}-{batch_start + i}"
                task_ids.append(task_id)
                tagged_task = f"{task}\n\n[nightowl_task_id: {task_id}]"
                await workflow.execute_activity(
                    nightowl_inject,
                    tagged_task,
                    start_to_close_timeout=timedelta(seconds=30),
                    retry_policy=RetryPolicy(maximum_attempts=3),
                )

            # Poll for each task's completion (up to POLL_MAX_ATTEMPTS * POLL_INTERVAL_SECONDS)
            done_flags = [False] * len(batch)
            for _ in range(POLL_MAX_ATTEMPTS):
                await workflow.sleep(timedelta(seconds=POLL_INTERVAL_SECONDS))
                for idx, task_id in enumerate(task_ids):
                    if done_flags[idx]:
                        continue
                    try:
                        done = await workflow.execute_activity(
                            nightowl_poll_status,
                            task_id,
                            start_to_close_timeout=timedelta(seconds=10),
                            retry_policy=RetryPolicy(maximum_attempts=2),
                        )
                        if done:
                            done_flags[idx] = True
                            workflow.logger.info(f"NightOwl task {task_id} complete")
                    except Exception as exc:
                        workflow.logger.warning(f"NightOwl poll error for {task_id}: {exc}")

                if all(done_flags):
                    break

            done_count = sum(done_flags)
            status = "completed" if done_count == len(batch) else "partial_timeout"
            all_results.append({
                "batch": batch,
                "task_ids": task_ids,
                "status": status,
                "done": done_count,
                "total": len(batch),
            })

        return {
            "fired": True,
            "batches": all_results,
            "held_risky": risky_tasks,
        }
