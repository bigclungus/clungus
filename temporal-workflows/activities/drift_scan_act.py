import subprocess

from temporalio import activity

from .constants import MAIN_CHANNEL_ID
from .inject_act import _do_inject


@activity.defn
async def run_drift_scan() -> None:
    result = subprocess.run(
        ["python3", "/mnt/data/scripts/drift_scan.py"],
        capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0 and result.stderr.strip():
        raise RuntimeError(f"drift_scan.py failed: {result.stderr.strip()}")

    output = result.stdout.strip()
    if not output:
        return  # Nothing stale — stay silent

    await _do_inject(output, MAIN_CHANNEL_ID, user="drift-scan")
