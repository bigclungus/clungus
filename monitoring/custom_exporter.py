#!/usr/bin/env python3
"""Custom Prometheus textfile exporter for systemd flaps and Temporal retries."""
import subprocess, json, re, time, os
from pathlib import Path

TEXTFILE_DIR = "/var/lib/node_exporter/textfile_collector"
OUTPUT_FILE = f"{TEXTFILE_DIR}/custom_metrics.prom"
INTERVAL = 30

# Ensure journalctl --user works inside a systemd service context where
# XDG_RUNTIME_DIR may not be set automatically.
_uid = os.getuid()
if "XDG_RUNTIME_DIR" not in os.environ:
    os.environ["XDG_RUNTIME_DIR"] = f"/run/user/{_uid}"

# Full path to the temporal binary so it is always found regardless of PATH.
_TEMPORAL = "/home/clungus/.local/bin/temporal"


def collect_systemd_flaps() -> dict:
    """Count start/stop transitions per user service in last 10 minutes."""
    result = subprocess.run(
        ["journalctl", "--user", "-n", "1000", "--since", "10 min ago",
         "--no-pager", "-o", "short"],
        capture_output=True, text=True, timeout=15
    )
    if result.returncode != 0:
        raise RuntimeError(f"journalctl failed: {result.stderr.strip()}")
    counts: dict = {}
    pattern = re.compile(r"(Started|Stopped)\s+(.+?)\.service", re.IGNORECASE)
    for line in result.stdout.splitlines():
        m = pattern.search(line)
        if m:
            svc = m.group(2).strip().lower().replace("-", "_")
            counts[svc] = counts.get(svc, 0) + 1
    return counts


def collect_temporal_retries() -> dict:
    """Get max attempt count per workflow from temporal CLI."""
    result = subprocess.run(
        [_TEMPORAL, "workflow", "list", "--namespace", "default", "--limit", "20", "--output", "json"],
        capture_output=True, text=True, timeout=20
    )
    if result.returncode != 0:
        raise RuntimeError(f"temporal workflow list failed: {result.stderr.strip()}")
    retries: dict = {}
    workflows = json.loads(result.stdout)
    if not isinstance(workflows, list):
        return retries
    for wf in workflows:
        wf_id = wf.get("execution", {}).get("workflowId", "unknown")
        desc = subprocess.run(
            [_TEMPORAL, "workflow", "describe", "--namespace", "default", "--workflow-id", wf_id, "--output", "json"],
            capture_output=True, text=True, timeout=10
        )
        if desc.returncode != 0:
            raise RuntimeError(
                f"temporal workflow describe failed for {wf_id}: {desc.stderr.strip()}"
            )
        d = json.loads(desc.stdout)
        pending = d.get("pendingActivities", [])
        attempt = pending[0].get("attempt", 0) if pending else 0
        if attempt > 0:
            safe_id = re.sub(r"[^a-zA-Z0-9_]", "_", wf_id)[:60]
            retries[safe_id] = attempt
    return retries


def write_metrics(flaps: dict, retries: dict) -> None:
    lines = [
        "# HELP systemd_service_flaps_10m Number of start/stop transitions in last 10 minutes",
        "# TYPE systemd_service_flaps_10m gauge",
    ]
    for svc, count in flaps.items():
        lines.append(f'systemd_service_flaps_10m{{service="{svc}"}} {count}')

    lines += [
        "# HELP temporal_workflow_max_attempt Max attempt count for running workflows",
        "# TYPE temporal_workflow_max_attempt gauge",
    ]
    for wf_id, attempt in retries.items():
        lines.append(f'temporal_workflow_max_attempt{{workflow_id="{wf_id}"}} {attempt}')

    tmp = OUTPUT_FILE + ".tmp"
    Path(tmp).write_text("\n".join(lines) + "\n")
    os.replace(tmp, OUTPUT_FILE)


if __name__ == "__main__":
    os.makedirs(TEXTFILE_DIR, exist_ok=True)
    print(f"Custom exporter running, writing to {OUTPUT_FILE}", flush=True)
    while True:
        try:
            flaps = collect_systemd_flaps()
        except Exception as e:
            print(f"ERROR collect_systemd_flaps: {e}", flush=True)
            flaps = {}
        try:
            retries = collect_temporal_retries()
        except Exception as e:
            print(f"ERROR collect_temporal_retries: {e}", flush=True)
            retries = {}
        try:
            write_metrics(flaps, retries)
        except Exception as e:
            print(f"ERROR write_metrics: {e}", flush=True)
        time.sleep(INTERVAL)
