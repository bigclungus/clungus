"""
task_db.py — Local Activities for idempotent SQLite writes to agents.db.

All three functions are designed to be idempotent:
  - create_task_record: INSERT OR IGNORE into agents table
  - finalize_task: UPDATE agents row with final status/tokens/cost
  - record_error: UPDATE failure_reason + status on agents row

agents.db path: /mnt/data/data/agents.db
Schema note: agents table has id, task_id, session_id, started_at, status,
  model, input_tokens, output_tokens, cost_usd, description, failure_reason, etc.
"""

import sqlite3
import time

from temporalio import activity

from agent_types import AgentTaskInput

AGENTS_DB = "/mnt/data/data/agents.db"


def _get_conn(db_path: str = AGENTS_DB) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


@activity.defn
async def create_task_record(input: AgentTaskInput) -> None:
    """
    Idempotent INSERT of an agent row into agents.db.
    Uses INSERT OR IGNORE so replay is safe.
    """
    now_ts = int(time.time())
    session_id = input.metadata.get("session_id", "unknown")
    description = input.metadata.get("description", input.task_id)

    with _get_conn() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO agents
              (id, task_id, session_id, started_at, status, model, description,
               input_tokens, output_tokens, cost_usd)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0.0)
            """,
            (
                input.task_id,  # agent id = task_id in this system
                input.task_id,
                session_id,
                now_ts,
                "in_progress",
                input.model,
                description,
            ),
        )
        conn.commit()


@activity.defn
async def finalize_task(input: AgentTaskInput, result: dict) -> None:
    """
    UPDATE agents row with final status, token counts, cost, and completed_at.
    Idempotent — safe to call multiple times with same data.
    """
    now_ts = int(time.time())

    status = result.get("status", "completed")
    if status == "success":
        status = "completed"

    input_tokens = int(result.get("input_tokens", 0))
    output_tokens = int(result.get("output_tokens", 0))
    cost_usd = float(result.get("cost_usd", 0.0))

    with _get_conn() as conn:
        conn.execute(
            """
            UPDATE agents
            SET status = ?, completed_at = ?, input_tokens = ?,
                output_tokens = ?, cost_usd = ?
            WHERE id = ?
            """,
            (status, now_ts, input_tokens, output_tokens, cost_usd, input.task_id),
        )
        conn.commit()


@activity.defn
async def record_error(task_id: str, error_message: str) -> None:
    """
    Record failure reason on agents row.
    Called before finalize_task on error paths.
    """
    truncated = error_message[:1000] if error_message else "unknown error"

    with _get_conn() as conn:
        conn.execute(
            """
            UPDATE agents
            SET status = 'failed', failure_reason = ?, error_message = ?
            WHERE id = ?
            """,
            (truncated, truncated, task_id),
        )
        conn.commit()
