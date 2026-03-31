"""GitHubWebhookWorkflow — handles ack comment and Discord notification for GitHub events."""
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.github_act import (
        github_inject_discord_notification,
        github_post_ack_comment,
    )

_TIMEOUT = timedelta(seconds=60)
_RETRY = RetryPolicy(maximum_attempts=2)


@workflow.defn
class GitHubWebhookWorkflow:
    """
    Handle a GitHub webhook event asynchronously:
    - Post an ack comment for new issues and PRs
    - Inject a Discord notification only for new issues and new PRs
    - Issue comments and other actions: no Discord noise
    """

    @workflow.run
    async def run(self, params: dict) -> None:
        event_type: str = params.get("event_type", "")   # "issues", "pull_request", "issue_comment"
        action: str = params.get("action", "")            # "opened", "created", etc.
        repo: str = params.get("repo", "")
        number: int = params.get("number", 0)
        title: str = params.get("title", "")
        url: str = params.get("url", "")
        user: str = params.get("user", "")

        if event_type in ("issues", "pull_request") and action == "opened":
            # Ack comment on the issue/PR
            await workflow.execute_activity(
                github_post_ack_comment,
                args=[repo, number, event_type],
                schedule_to_close_timeout=_TIMEOUT,
                retry_policy=_RETRY,
            )
            # Discord notification for significant events only
            await workflow.execute_activity(
                github_inject_discord_notification,
                args=[event_type, repo, title, number, url, user],
                schedule_to_close_timeout=_TIMEOUT,
                retry_policy=_RETRY,
            )

        elif event_type == "issue_comment" and action == "created":
            # Ack only — no Discord notification for routine comments
            await workflow.execute_activity(
                github_post_ack_comment,
                args=[repo, number, event_type],
                schedule_to_close_timeout=_TIMEOUT,
                retry_policy=_RETRY,
            )
