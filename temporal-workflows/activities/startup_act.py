"""Startup activities — run on bot restart, inject Discord only if something is wrong."""
from shutil import disk_usage
import subprocess

from temporalio import activity

from .constants import BASE_DIR, SCRIPTS_DIR


@activity.defn
async def startup_fix_falkordb() -> str:
    """Apply the FalkorDB bgsave-error fix. Returns 'ok' or error message."""
    try:
        result = subprocess.run(
            [
                "docker", "exec", "docker-falkordb-1", "redis-cli",
                "CONFIG", "SET", "stop-writes-on-bgsave-error", "no",
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode == 0 and "OK" in result.stdout:
            return "ok"
        return f"ERROR: {result.stderr or result.stdout}"
    except Exception as exc:
        return f"ERROR: {exc}"


@activity.defn
async def startup_check_services() -> list[str]:
    """Return list of failed service names, empty list if all healthy."""
    try:
        result = subprocess.run(
            [
                "systemctl", "--user", "list-units",
                "--type=service", "--state=failed", "--no-pager", "--plain",
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
        failed = []
        for line in result.stdout.splitlines():
            line = line.strip()
            if line and ".service" in line and "failed" in line:
                name = line.split()[0]
                failed.append(name)
        return failed
    except Exception as exc:
        return [f"check_failed: {exc}"]


@activity.defn
async def startup_check_disk() -> dict:
    """Check disk usage. Returns {'root_pct': int, 'data_pct': int, 'warning': bool}."""
    try:
        root_usage = disk_usage("/")
        root_pct = int(root_usage.used / root_usage.total * 100)
        try:
            data_usage = disk_usage(BASE_DIR)
            data_pct = int(data_usage.used / data_usage.total * 100)
        except Exception as exc:
            activity.logger.warning("[startup_check_disk] could not check %s: %s", BASE_DIR, exc)
            data_pct = 0
        return {
            "root_pct": root_pct,
            "data_pct": data_pct,
            "warning": root_pct > 85 or data_pct > 85,
        }
    except Exception as exc:
        return {"root_pct": 0, "data_pct": 0, "warning": True, "error": str(exc)}


@activity.defn
async def startup_run_watchdog() -> str:
    """Run the stale task watchdog. Returns output summary."""
    try:
        result = subprocess.run(
            ["bash", f"{SCRIPTS_DIR}/hooks/watchdog-stale-tasks.sh"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        return result.stdout.strip() or "ok"
    except Exception as exc:
        return f"ERROR: {exc}"


@activity.defn
async def startup_check_heartbeat() -> str:
    """Check if heartbeat inject has landed recently. Returns 'ok' or a warning message."""
    try:
        result = subprocess.run(
            ["bash", f"{SCRIPTS_DIR}/watchdog-heartbeat.sh"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        output = result.stdout.strip()
        if output.startswith("WARN"):
            return output
        return "ok"
    except Exception as exc:
        return f"ERROR: {exc}"


@activity.defn
async def startup_extract_directives() -> str:
    """Extract congress directives into learned-directives.md. Returns status."""
    try:
        result = subprocess.run(
            ["python3", f"{SCRIPTS_DIR}/extract-congress-directives.py"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        return result.stdout.strip() or "ok"
    except Exception as exc:
        return f"ERROR: {exc}"
