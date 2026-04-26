"""
Filesystem I/O activities — reusable across all workflows.
"""

import asyncio
from logging import getLogger
from pathlib import Path

from temporalio import activity

logger = getLogger(__name__)


async def _run(args: list[str], cwd: str) -> tuple[int, str, str]:
    """Run a subprocess asynchronously. Returns (returncode, stdout, stderr)."""
    proc = await asyncio.create_subprocess_exec(
        *args,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode, stdout.decode(), stderr.decode()


@activity.defn
async def write_file(path: str, content: str) -> None:
    """Write content to a file, creating parent directories if needed."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    logger.info("Wrote %d bytes to %s", len(content), path)


@activity.defn
async def git_commit(paths: list[str], message: str) -> str:
    """Stage files and commit. Returns the commit hash.

    Raises RuntimeError if the commit fails (e.g. nothing to commit).
    """
    if not paths:
        raise RuntimeError("git_commit called with empty paths list")

    # Determine repo root from the first path
    first_path = Path(paths[0])
    repo_root = first_path.parent
    # Walk up to find .git
    while repo_root != repo_root.parent:
        if (repo_root / ".git").exists():
            break
        repo_root = repo_root.parent
    else:
        raise RuntimeError(f"Could not find git repo root from {paths[0]}")

    cwd = str(repo_root)

    # Stage
    rc, _, stderr = await _run(["git", "add"] + paths, cwd)
    if rc != 0:
        raise RuntimeError(f"git add failed: {stderr}")

    # Commit
    rc, _, stderr = await _run(["git", "commit", "-m", message], cwd)
    if rc != 0:
        raise RuntimeError(f"git commit failed: {stderr}")

    # Get commit hash
    rc, stdout, _ = await _run(["git", "rev-parse", "HEAD"], cwd)
    commit_hash = stdout.strip()
    logger.info("Committed %s: %s", commit_hash[:8], message)

    # Push
    rc, _, stderr = await _run(["git", "push"], cwd)
    if rc != 0:
        raise RuntimeError(f"git push failed: {stderr}")

    return commit_hash
