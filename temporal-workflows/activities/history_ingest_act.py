"""
Activity: run_history_ingest

Runs the Discord history ingest script as a subprocess.
Raises on non-zero exit — no silent failures.
"""
import subprocess

from temporalio import activity

INGEST_SCRIPT = "/mnt/data/scripts/history-ingest.py"


@activity.defn
async def run_history_ingest() -> str:
    """Run INGEST_SCRIPT and return combined stdout+stderr."""
    try:
        result = subprocess.run(
            ["python3", INGEST_SCRIPT],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"history-ingest.py exited with code {exc.returncode}:\n{exc.stderr}"
        ) from exc
    output = result.stdout + result.stderr
    activity.logger.info("history-ingest output: %s", output.strip() or "(no output)")
    return output
