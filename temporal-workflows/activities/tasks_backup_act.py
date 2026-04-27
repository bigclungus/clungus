"""Activity: back up tasks.db to git."""

from subprocess import run

from temporalio import activity

from .constants import META_REPO_PATH


@activity.defn
async def backup_tasks_db() -> str:
    """Commit tasks.db to git and push. No-ops if nothing changed."""
    # Stage the DB
    result = run(
        ["git", "-C", META_REPO_PATH, "add", "tasks.db"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"git add tasks.db failed: {result.stderr.strip()}")

    # Check if there's anything staged
    diff = run(
        ["git", "-C", META_REPO_PATH, "diff", "--staged", "--quiet"],
        capture_output=True,
        timeout=10,
    )
    if diff.returncode == 0:
        # Nothing changed
        return "tasks.db: no changes to commit"

    # Commit
    commit = run(
        ["git", "-C", META_REPO_PATH, "commit", "-m", "chore: task db backup"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if commit.returncode != 0:
        raise RuntimeError(f"git commit failed: {commit.stderr.strip()}")

    # Push
    push = run(
        ["git", "-C", META_REPO_PATH, "push"],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if push.returncode != 0:
        raise RuntimeError(f"git push failed: {push.stderr.strip()}")

    return f"tasks.db committed and pushed: {commit.stdout.strip()}"
