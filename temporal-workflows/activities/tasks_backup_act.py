"""Activity: back up tasks.db to git."""

from subprocess import run

from temporalio import activity

from .constants import META_REPO_PATH


@activity.defn
async def backup_tasks_db() -> str:
    """Commit tasks.db to git and push. No-ops if nothing changed."""
    repo = META_REPO_PATH

    # Stage the DB
    result = run(
        ["git", "-C", repo, "add", "tasks.db"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"git add tasks.db failed: {result.stderr.strip()}")

    # Check if there's anything staged
    diff = run(
        ["git", "-C", repo, "diff", "--staged", "--quiet"],
        capture_output=True,
        timeout=10,
    )
    if diff.returncode == 0:
        # Nothing changed
        return "tasks.db: no changes to commit"

    # Commit
    commit = run(
        ["git", "-C", repo, "commit", "-m", "chore: task db backup"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if commit.returncode != 0:
        raise RuntimeError(f"git commit failed: {commit.stderr.strip()}")

    # Push
    push = run(
        ["git", "-C", repo, "push"],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if push.returncode != 0:
        raise RuntimeError(f"git push failed: {push.stderr.strip()}")

    return f"tasks.db committed and pushed: {commit.stdout.strip()}"
