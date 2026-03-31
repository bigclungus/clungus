#!/usr/bin/env python3
"""Append a log event to a task JSON file and to the SQLite task store.

Usage: python3 log_task_event.py <task_id_or_file> <event_type> <message>

event_type: started | milestone | user_feedback | blocked | done | failed
task_id_or_file: either a task ID like "task-20260324-..." or a full path
"""
import sys, json, os, re
from datetime import datetime, timezone
from pathlib import Path
import glob as _glob

# Patterns that suggest a credential is being logged
_CRED_PATTERNS = [
    re.compile(r'(?i)(password|passwd|api[_-]?key|apikey|token|secret|credential)[s]?\s*[=:]'),
    re.compile(r'(?i)bearer\s+[A-Za-z0-9\-_.~+/]{20,}'),
    # Long high-entropy alphanumeric strings (30+ chars, mix of cases/digits/symbols)
    re.compile(r'[A-Za-z0-9!@#$%^&*\-_.]{30,}'),
]

def _looks_like_credential(message: str) -> bool:
    for pattern in _CRED_PATTERNS:
        if pattern.search(message):
            return True
    return False

TASKS_DIR = "/home/clungus/work/bigclungus-meta/tasks"

def find_task_file(task_id_or_file: str) -> str:
    if os.path.isfile(task_id_or_file):
        return task_id_or_file
    # Try direct match
    direct = os.path.join(TASKS_DIR, task_id_or_file + ".json")
    if os.path.isfile(direct):
        return direct
    # Try prefix match
    matches = _glob.glob(os.path.join(TASKS_DIR, f"{task_id_or_file}*.json"))
    if matches:
        return matches[0]
    raise FileNotFoundError(f"No task file found for: {task_id_or_file}")


def _write_to_sqlite(task_id: str, task_data: dict, event_type: str, message: str, ts: str) -> None:
    """Write the event and update the task row in SQLite. Non-fatal if DB is unavailable."""
    try:
        # Import here so the script still works if tasks_db.py is missing during early migration
        scripts_dir = os.path.dirname(os.path.abspath(__file__))
        sys.path.insert(0, scripts_dir)
        from tasks_db import DEFAULT_DB, get_db, init_db

        db_path = DEFAULT_DB
        if not os.path.exists(db_path):
            # DB not yet initialized — skip silently during transition period
            return

        conn = get_db(db_path)

        # Determine current status
        status = task_data.get("status", "in_progress")

        # Upsert the task row (in case it's new or not yet migrated)
        conn.execute(
            """
            INSERT INTO tasks (id, title, status, created_at, updated_at, data)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status     = excluded.status,
                updated_at = excluded.updated_at,
                data       = excluded.data
            """,
            (
                task_id,
                task_data.get("title", ""),
                status,
                task_data.get("started_at", ts),
                ts,
                json.dumps(task_data),
            ),
        )

        # Insert the event
        conn.execute(
            "INSERT INTO task_events (task_id, event, message, ts) VALUES (?, ?, ?, ?)",
            (task_id, event_type, message, ts),
        )

        conn.commit()
        conn.close()
    except Exception as e:
        # Log to stderr but never block the JSON write
        print(f"Warning: SQLite write failed for {task_id}: {e}", file=sys.stderr)


def main():
    if len(sys.argv) < 4:
        print("Usage: log_task_event.py <task_id_or_file> <event_type> <message>")
        sys.exit(1)

    task_ref, event_type, message = sys.argv[1], sys.argv[2], sys.argv[3]

    if _looks_like_credential(message):
        print("ERROR: Message looks like it may contain credentials or sensitive data.")
        print("Task files are committed to a public GitHub repo — do not log secrets.")
        print("If this is a false positive, shorten or redact the sensitive-looking portion.")
        sys.exit(1)

    path = find_task_file(task_ref)

    data = json.load(open(path))
    if "log" not in data:
        data["log"] = []

    ts = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    entry = {
        "event": event_type,
        "ts": ts,
        "message": message
    }
    data["log"].append(entry)

    # Also update status field for done/failed/blocked events
    if event_type in ("done", "failed"):
        data["status"] = event_type
    elif event_type == "blocked":
        data["status"] = "blocked"

    # Write JSON (primary store during transition)
    json.dump(data, open(path, "w"), indent=2)

    # Write to SQLite (secondary store during transition)
    task_id = data.get("id", os.path.splitext(os.path.basename(path))[0])
    _write_to_sqlite(task_id, data, event_type, message, ts)

    print(f"Logged [{event_type}] to {os.path.basename(path)}: {message}")

if __name__ == "__main__":
    main()
