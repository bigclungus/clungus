#!/usr/bin/env python3
"""Append a log event to a task JSON file and to the SQLite task store.

Usage: python3 log_task_event.py <task_id_or_file> <event_type> <message>

event_type: started | milestone | user_feedback | blocked | done | failed
task_id_or_file: either a task ID like "task-20260324-..." or a full path
"""
import sys, json, os, re, time
from datetime import datetime, timezone
from pathlib import Path
import glob as _glob

AGENTS_DB = "/mnt/data/data/agents.db"

# Cost per token (USD) — Sonnet pricing
_INPUT_COST_PER_TOKEN = 0.000003
_OUTPUT_COST_PER_TOKEN = 0.000015


def _parse_output_file_usage(output_file: str) -> tuple[int, int, float, str | None]:
    """
    Read a Claude agent JSONL output file and sum all usage entries.
    Returns (input_tokens, output_tokens, cost_usd, model).
    Non-fatal: returns zeros on any error.
    """
    try:
        input_tokens = 0
        output_tokens = 0
        model = None
        with open(output_file) as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                msg = obj.get("message", {})
                if not isinstance(msg, dict):
                    continue
                usage = msg.get("usage")
                if not isinstance(usage, dict):
                    continue
                input_tokens += usage.get("input_tokens", 0)
                input_tokens += usage.get("cache_creation_input_tokens", 0)
                input_tokens += usage.get("cache_read_input_tokens", 0)
                output_tokens += usage.get("output_tokens", 0)
                if model is None and msg.get("model"):
                    model = msg["model"]
        cost_usd = (input_tokens * _INPUT_COST_PER_TOKEN) + (output_tokens * _OUTPUT_COST_PER_TOKEN)
        return input_tokens, output_tokens, cost_usd, model
    except Exception:
        return 0, 0, 0.0, None


def _update_agent_completion(task_id: str, event_type: str) -> None:
    """
    When a task is marked done/failed, find matching agent rows in agents.db
    and update their completion data from the output file.
    Non-fatal on any error.
    """
    try:
        import sqlite3
        if not os.path.exists(AGENTS_DB):
            return
        conn = sqlite3.connect(AGENTS_DB)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.row_factory = sqlite3.Row

        # Ensure table exists defensively
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agents (
                id              TEXT PRIMARY KEY,
                task_id         TEXT,
                session_id      TEXT,
                started_at      INTEGER,
                completed_at    INTEGER,
                status          TEXT DEFAULT 'in_progress',
                input_tokens    INTEGER DEFAULT 0,
                output_tokens   INTEGER DEFAULT 0,
                cost_usd        REAL DEFAULT 0.0,
                model           TEXT,
                output_file     TEXT
            )
            """
        )

        rows = conn.execute(
            "SELECT id, output_file FROM agents WHERE task_id = ? AND status = 'in_progress'",
            (task_id,),
        ).fetchall()

        if not rows:
            conn.close()
            return

        completed_at = int(time.time())
        status = event_type  # "done" or "failed"

        for row in rows:
            agent_id = row["id"]
            output_file = row["output_file"]

            input_tokens, output_tokens, cost_usd, model = 0, 0, 0.0, None
            if output_file and os.path.exists(output_file):
                input_tokens, output_tokens, cost_usd, model = _parse_output_file_usage(output_file)

            conn.execute(
                """
                UPDATE agents
                SET completed_at = ?,
                    status       = ?,
                    input_tokens = ?,
                    output_tokens = ?,
                    cost_usd     = ?,
                    model        = COALESCE(model, ?)
                WHERE id = ?
                """,
                (completed_at, status, input_tokens, output_tokens, cost_usd, model, agent_id),
            )

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Warning: agents.db update failed for task {task_id}: {e}", file=sys.stderr)

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

    # Update agents.db completion data for done/failed events
    if event_type in ("done", "failed"):
        _update_agent_completion(task_id, event_type)

    print(f"Logged [{event_type}] to {os.path.basename(path)}: {message}")

if __name__ == "__main__":
    main()
