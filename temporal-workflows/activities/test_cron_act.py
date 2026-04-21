"""
Activities: run_integration_tests, alert_discord_test_failure

Runs the integration test suite as a subprocess and reports failures to Discord
via the inject endpoint.
"""

import asyncio
from pathlib import Path

from temporalio import activity

from .constants import MAIN_CHANNEL_ID, META_REPO_PATH
from .inject_act import _do_inject

INTEGRATION_TEST_CMD = [
    "python3",
    str(Path(META_REPO_PATH) / "tests" / "integration_test.py"),
]


@activity.defn
async def run_integration_tests() -> tuple[bool, str]:
    """Run integration_test.py and return (success, output).

    Returns True if the process exits with code 0, False otherwise.
    Output is the combined stdout+stderr (truncated to 4000 chars).
    """
    proc = await asyncio.create_subprocess_exec(
        *INTEGRATION_TEST_CMD,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    stdout, _ = await proc.communicate()
    output = stdout.decode("utf-8", errors="replace")
    success = proc.returncode == 0
    activity.logger.info(
        "Integration tests finished: success=%s returncode=%s", success, proc.returncode
    )
    # Truncate so it fits in a Discord message
    if len(output) > 4000:
        output = output[:3900] + "\n… (truncated)"
    return success, output


@activity.defn
async def alert_discord_test_failure(output: str) -> None:
    """Inject a test-failure alert into the bot session via the inject endpoint."""
    message = f"🔴 **integration tests failed** (TestCronWorkflow)\n```\n{output}\n```"
    await _do_inject(message, MAIN_CHANNEL_ID, user="test-cron")
