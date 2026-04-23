from asyncio import gather
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.email_act import check_new_emails, inject_email_notification

POLL_INTERVAL_SECONDS = 300


@workflow.defn
class EmailPollerWorkflow:
    """Polls ProtonMail every 5 minutes and injects notifications for new emails."""

    @workflow.run
    async def run(self) -> None:
        last_check = workflow.now().timestamp() - POLL_INTERVAL_SECONDS  # look back 5 min on first run

        while True:
            emails = await workflow.execute_activity(
                check_new_emails,
                last_check,
                start_to_close_timeout=timedelta(seconds=60),
                retry_policy=RetryPolicy(maximum_attempts=2),
            )

            await gather(*[
                workflow.execute_activity(
                    inject_email_notification,
                    email,
                    start_to_close_timeout=timedelta(seconds=15),
                    retry_policy=RetryPolicy(maximum_attempts=3),
                )
                for email in emails
            ])

            last_check = workflow.now().timestamp()
            await workflow.sleep(timedelta(seconds=POLL_INTERVAL_SECONDS))
