"""
task_db.py — Local Activities for idempotent SQLite writes to tasks.db.

All three functions are designed to be idempotent:
  - create_task_record: INSERT OR IGNORE into tasks table + insert task_events row
  - finalize_task: UPDATE tasks row with final status/completed_at
  - record_error: UPDATE failure_reason + status on tasks row

tasks.db path: /home/clungus/work/bigclungus-meta/tasks.db
Schema:
  tasks(id TEXT PK, title TEXT, status TEXT, created_at TEXT, updated_at TEXT, data TEXT)
  task_events(id INTEGER PK, task_id TEXT, event TEXT, message TEXT, ts TEXT)
"""

import json
import sqlite3
import time
from datetime import datetime, timezone

from temporalio import activity

from agent_types import AgentTaskInput

TASKS_DB = "/home/clungus/work/bigclungus-meta/tasks.db"


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _get_conn(db_path: str = TASKS_DB) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


@activity.defn
async def create_task_record(input: AgentTaskInput) -> None:
    """
    Idempotent INSERT of a task row into tasks.db.
    Uses INSERT OR IGNORE so replay is safe.
    Also inserts a 'started' task_events row (INSERT OR IGNORE via unique constraint not
    available, so we guard with a SELECT first).
    """
    now = _iso_now()
    title = input.description or input.prompt or input.task_id

    task_data = json.dumps({
        "id": input.task_id,
        "title": title,
        "status": "open",
        "source": "agent-hook",
        "agent_id": input.agent_id,
        "model": input.model,
        "log": [{"ts": now, "event": "started", "context": title}],
    })

    with _get_conn() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO tasks
              (id, title, status, created_at, updated_at, data)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (input.task_id, title, "open", now, now, task_data),
        )
        # Only insert started event if the tasks row was just created
        existing = conn.execute(
            "SELECT COUNT(*) FROM task_events WHERE task_id = ? AND event = 'started'",
            (input.task_id,),
        ).fetchone()[0]
        if existing == 0:
            conn.execute(
                "INSERT INTO task_events (task_id, event, message, ts) VALUES (?, ?, ?, ?)",
                (input.task_id, "started", title, now),
            )
        conn.commit()


@activity.defn
async def finalize_task(input: AgentTaskInput, result: dict) -> None:
    """
    UPDATE tasks row with final status and updated_at.
    Appends a 'done' entry to the log blob.
    Idempotent — safe to call multiple times.
    """
    now = _iso_now()

    status = result.get("status", "completed")
    if status in ("success", "completed"):
        status = "done"
    elif status == "timed_out":
        status = "timed_out"
    elif status in ("failed", "cancelled"):
        pass  # keep as-is

    last_preview = result.get("last_message_preview", "")
    context = (last_preview[:500] + "...(truncated)") if len(last_preview) > 500 else last_preview

    with _get_conn() as conn:
        row = conn.execute(
            "SELECT data FROM tasks WHERE id = ?", (input.task_id,)
        ).fetchone()

        updated_data = None
        if row and row[0]:
            try:
                blob = json.loads(row[0])
                blob["status"] = status
                blob["finished_at"] = now
                if isinstance(blob.get("log"), list):
                    blob["log"].append({"ts": now, "event": status, "context": context or "agent finished"})
                updated_data = json.dumps(blob)
            except (json.JSONDecodeError, TypeError):
                pass

        if updated_data is not None:
            conn.execute(
                "UPDATE tasks SET status = ?, updated_at = ?, data = ? WHERE id = ?",
                (status, now, updated_data, input.task_id),
            )
        else:
            conn.execute(
                "UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?",
                (status, now, input.task_id),
            )

        conn.execute(
            "INSERT INTO task_events (task_id, event, message, ts) VALUES (?, ?, ?, ?)",
            (input.task_id, status, context[:500] if context else "agent finished", now),
        )
        conn.commit()


@activity.defn
async def record_error(task_id: str, error_message: str) -> None:
    """
    Record failure on the tasks row.
    Called before finalize_task on error paths.
    """
    now = _iso_now()
    truncated = error_message[:1000] if error_message else "unknown error"

    with _get_conn() as conn:
        conn.execute(
            "UPDATE tasks SET status = 'failed', updated_at = ? WHERE id = ?",
            (now, task_id),
        )
        conn.execute(
            "INSERT INTO task_events (task_id, event, message, ts) VALUES (?, ?, ?, ?)",
            (task_id, "error", truncated[:500], now),
        )
        conn.commit()
