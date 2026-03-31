"""
Persona polls workflow — generates avatar GIFs + sprite JS variants for a new
persona, creates poll files, commits to git, and notifies Discord.

Typically triggered from CongressWorkflow after a CREATE directive, or manually.
"""
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.persona_polls_act import run_create_persona_polls


@workflow.defn
class PersonaPollsWorkflow:
    @workflow.run
    async def run(self, slug: str) -> str:
        return await workflow.execute_activity(
            run_create_persona_polls,
            slug,
            start_to_close_timeout=timedelta(hours=1),
            retry_policy=RetryPolicy(
                maximum_attempts=2,
                initial_interval=timedelta(minutes=2),
            ),
        )
