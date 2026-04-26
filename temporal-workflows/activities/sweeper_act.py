"""
Activity: check_open_tasks

Reads task files from bigclungus-meta/tasks/ and posts a summary of in_progress
tasks to the main Discord channel. Silent if nothing is open.
"""
from json import dump as json_dump, load as json_load
from datetime import datetime, timezone

from temporalio import activity

from .common.discord_io import discord_post_message
from .constants import MAIN_CHANNEL_ID, TASKS_DIR
from .inject_act import _do_inject


def _age_str(iso_str: str) -> str:
    """Return a human-readable age string like '2h ago' or '5m ago'."""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        delta = datetime.now(timezone.utc) - dt
        total_seconds = int(delta.total_seconds())
        if total_seconds < 60:
            return f"{total_seconds}s ago"
        elif total_seconds < 3600:
            return f"{total_seconds // 60}m ago"
        elif total_seconds < 86400:
            return f"{total_seconds // 3600}h ago"
        else:
            return f"{total_seconds // 86400}d ago"
    except Exception as e:
        activity.logger.warning("[sweeper_act] _age_str failed to parse %r: %s", iso_str, e)
        return "?"


_CLOSED = {"done", "failed", "cancelled", "stale"}


def _derive_status(task: dict) -> str:
    """
    Derive task status, checking the top-level status field first when it is a
    known terminal value.  Falls back to the last log entry event so that tasks
    whose only record of completion is the log still work correctly.

    Event mapping:
      started  -> in_progress
      done     -> done
      stale    -> stale
      failed   -> failed
      cancelled -> cancelled
    """
    # Top-level status wins when it is a known terminal value
    top_level = task.get("status")
    if top_level in _CLOSED:
        return top_level
    # Fall back to last log event
    log = task.get("log")
    if log and isinstance(log, list) and len(log) > 0:
        last_event = log[-1].get("event", "")
        if last_event == "started":
            return "in_progress"
        if last_event in _CLOSED:
            return last_event
    return top_level or "unknown"


def _get_started_ts(task: dict) -> str:
    """
    Get the started timestamp from the first log entry with event='started',
    or fall back to top-level started_at for old-format tasks.
    """
    log = task.get("log")
    if log and isinstance(log, list):
        for entry in log:
            if entry.get("event") == "started":
                return entry.get("ts", "")
    return task.get("started_at", "")


@activity.defn
async def check_open_tasks() -> str | None:
    """
    Read task files from bigclungus-meta/tasks/ and post to Discord if any
    in_progress tasks exist.
    Returns the Discord message ID if posted, or None if nothing to report.
    """
    open_items = []

    try:
        task_files = list(TASKS_DIR.glob("*.json"))
        for fpath in task_files:
            if fpath.name == ".gitkeep":
                continue
            try:
                with open(fpath, "r") as f:
                    task = json_load(f)
            except Exception as e:
                activity.logger.warning(f"Failed to read task file {fpath}: {e}")
                continue

            status = _derive_status(task)
            if status != "in_progress":
                continue

            title = task.get("title", "(no title)")
            task_id = task.get("id", "")
            started_at = _get_started_ts(task)
            age = _age_str(started_at) if started_at else "?"
            discord_user = task.get("discord_user")
            open_items.append((title, task_id, age, discord_user))

    except Exception as e:
        raise RuntimeError(f"Failed to read tasks directory: {e}")

    checked_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if not open_items:
        _write_status_file(checked_at, [])
        return None

    lines = [f"📋 open tasks ({len(open_items)}):"]
    status_items = []
    for title, task_id, age, discord_user in open_items:
        user_str = f" (@{discord_user})" if discord_user else ""
        lines.append(f"• {title}{user_str} ({age})")
        status_items.append({
            "title": title,
            "status": "In Progress",
            "url": "https://clung.us/tasks",
            "age": age,
        })

    message = "\n".join(lines)

    _write_status_file(checked_at, status_items)

    # Try inject endpoint first (routes to BigClungus session directly)
    try:
        await _do_inject(message, MAIN_CHANNEL_ID, user="temporal-sweeper")
        return None
    except Exception as _e:
        activity.logger.warning(f"inject endpoint unavailable, falling back to Discord API: {_e}")

    return await discord_post_message(MAIN_CHANNEL_ID, message)


def _write_status_file(checked_at: str, items: list) -> None:
    """Write open task status to /tmp/bc-open-tasks.json for startup checks."""
    status = {
        "checked_at": checked_at,
        "open_count": len(items),
        "items": items,
    }
    try:
        with open("/tmp/bc-open-tasks.json", "w") as f:
            json_dump(status, f, indent=2)
    except Exception as exc:
        activity.logger.warning(f"Failed to write /tmp/bc-open-tasks.json: {exc}")
