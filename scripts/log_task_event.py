#!/usr/bin/env python3
"""Append a log event to the SQLite task store.

Usage: python3 log_task_event.py <task_id> <event_type> <message>

event_type: started | milestone | user_feedback | blocked | done | failed
task_id: a task ID like "task-20260324-..." or a unique prefix
"""
import sys, os, re, time, json
from datetime import datetime, timezone

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

def _write_to_sqlite(task_id: str, event_type: str, message: str, ts: str) -> None:
    """Write the event and update the task row status in SQLite."""
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, scripts_dir)
    from tasks_db import DEFAULT_DB, get_db

    db_path = DEFAULT_DB
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"tasks.db not found at {db_path}")

    conn = get_db(db_path)

    # Verify the task exists
    row = conn.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        conn.close()
        raise ValueError(f"Task not found in DB: {task_id}")

    # Update status for terminal/blocked events
    if event_type in ("done", "failed"):
        conn.execute(
            "UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?",
            (event_type, ts, task_id),
        )
    elif event_type == "blocked":
        conn.execute(
            "UPDATE tasks SET status = 'blocked', updated_at = ? WHERE id = ?",
            (ts, task_id),
        )
    else:
        conn.execute(
            "UPDATE tasks SET updated_at = ? WHERE id = ?",
            (ts, task_id),
        )

    # Insert the event
    conn.execute(
        "INSERT INTO task_events (task_id, event, message, ts) VALUES (?, ?, ?, ?)",
        (task_id, event_type, message, ts),
    )

    conn.commit()
    conn.close()


def _import_json_task_into_db(task_id: str, db_path: str) -> bool:
    """
    Look for a JSON task file in bigclungus-meta/tasks/<task_id>.json.
    If found, import it into tasks.db on-demand and return True.
    Returns False if no JSON file exists.
    """
    tasks_dir = "/home/clungus/work/bigclungus-meta/tasks"
    json_path = os.path.join(tasks_dir, f"{task_id}.json")
    if not os.path.exists(json_path):
        return False

    try:
        with open(json_path) as fh:
            data = json.load(fh)
    except Exception as e:
        print(f"Warning: could not read {json_path}: {e}", file=sys.stderr)
        return False

    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, scripts_dir)
    from tasks_db import get_db, init_db

    title = data.get("title", task_id)
    status = data.get("status", "open")
    # Derive timestamps from the log if available
    log = data.get("log", [])
    ts_created = log[0].get("ts") if log else datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    ts_updated = log[-1].get("ts") if log else ts_created

    init_db(db_path)
    conn = get_db(db_path)
    conn.execute(
        "INSERT OR IGNORE INTO tasks (id, title, status, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)",
        (task_id, title, status, ts_created, ts_updated, json.dumps(data)),
    )
    # Re-import log entries as task_events (skip if they already exist)
    for entry in log:
        ts  = entry.get("ts", ts_created)
        evt = entry.get("event", "milestone")
        msg = entry.get("context", "")
        conn.execute(
            "INSERT INTO task_events (task_id, event, message, ts) VALUES (?, ?, ?, ?)",
            (task_id, evt, msg, ts),
        )
    conn.commit()
    conn.close()
    print(f"Imported task {task_id} from JSON file into tasks.db", file=sys.stderr)
    return True


def _resolve_task_id(task_ref: str) -> str:
    """Resolve a task reference (ID or prefix) to a canonical task_id via tasks.db.
    Falls back to the JSON task file directory if not found in tasks.db."""
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, scripts_dir)
    from tasks_db import DEFAULT_DB, get_db

    db_path = DEFAULT_DB
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"tasks.db not found at {db_path}")

    conn = get_db(db_path)

    # Exact match first
    row = conn.execute("SELECT id FROM tasks WHERE id = ?", (task_ref,)).fetchone()
    if row:
        conn.close()
        return row[0]

    # Prefix match
    row = conn.execute("SELECT id FROM tasks WHERE id LIKE ? ORDER BY created_at DESC LIMIT 1", (task_ref + "%",)).fetchone()
    conn.close()
    if row:
        return row[0]

    # JSON file fallback: import on-demand if the exact task ID exists as a file
    if _import_json_task_into_db(task_ref, db_path):
        return task_ref

    # Prefix fallback against JSON files
    tasks_dir = "/home/clungus/work/bigclungus-meta/tasks"
    if os.path.isdir(tasks_dir):
        import glob as _glob
        matches = sorted(_glob.glob(os.path.join(tasks_dir, f"{task_ref}*.json")), reverse=True)
        if matches:
            candidate = os.path.basename(matches[0])[:-5]  # strip .json
            if _import_json_task_into_db(candidate, db_path):
                return candidate

    raise ValueError(f"No task found for reference: {task_ref}")


def main():
    if len(sys.argv) < 4:
        print("Usage: log_task_event.py <task_id> <event_type> <message>")
        sys.exit(1)

    task_ref, event_type, message = sys.argv[1], sys.argv[2], sys.argv[3]

    if _looks_like_credential(message):
        print("ERROR: Message looks like it may contain credentials or sensitive data.")
        print("Tasks are stored in a DB — do not log secrets.")
        print("If this is a false positive, shorten or redact the sensitive-looking portion.")
        sys.exit(1)

    task_id = _resolve_task_id(task_ref)

    ts = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    _write_to_sqlite(task_id, event_type, message, ts)

    # Update agents.db completion data for done/failed events
    if event_type in ("done", "failed"):
        _update_agent_completion(task_id, event_type)

    print(f"Logged [{event_type}] to {task_id}: {message}")

if __name__ == "__main__":
    main()
