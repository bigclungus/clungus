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

import glob
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
        "provider": input.provider,
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


def _parse_jsonl_tokens(agent_id: str) -> dict:
    """
    Parse token usage from the agent's output JSONL file.
    Globs for /tmp/claude-1001/**/tasks/<agent_id>.output
    Deduplicates by message.id (last occurrence wins), sums tokens.
    Pricing: $3/1M input, $15/1M output, $0.30/1M cache_read.
    Returns dict with input_tokens, output_tokens, cache_read_tokens, cost_usd (all 0 on failure).
    """
    empty = {"input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0, "cost_usd": 0.0}
    if not agent_id:
        return empty

    matches = glob.glob(f"/tmp/claude-1001/**/tasks/{agent_id}.output", recursive=True)
    if not matches:
        return empty

    output_path = matches[0]
    try:
        with open(output_path, "r", encoding="utf-8") as f:
            raw = f.read()
    except OSError:
        return empty

    usage_by_msg_id: dict[str, dict] = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        # Support both top-level agentId check and plain assistant messages
        entry_agent_id = entry.get("agentId", "")
        if entry_agent_id and entry_agent_id != agent_id:
            continue

        msg = entry.get("message")
        if not isinstance(msg, dict):
            continue
        if msg.get("role") != "assistant":
            continue

        usage = msg.get("usage")
        if not isinstance(usage, dict):
            continue

        msg_id = msg.get("id", "")
        if not msg_id:
            continue

        usage_by_msg_id[msg_id] = {
            "input": int(usage.get("input_tokens", 0)),
            "output": int(usage.get("output_tokens", 0)),
            "cache_read": int(usage.get("cache_read_input_tokens", 0)),
        }

    total_input = sum(u["input"] for u in usage_by_msg_id.values())
    total_output = sum(u["output"] for u in usage_by_msg_id.values())
    total_cache_read = sum(u["cache_read"] for u in usage_by_msg_id.values())

    cost = (
        (total_input * 3) / 1_000_000
        + (total_output * 15) / 1_000_000
        + (total_cache_read * 0.30) / 1_000_000
    )

    return {
        "input_tokens": total_input,
        "output_tokens": total_output,
        "cache_read_tokens": total_cache_read,
        "cost_usd": round(cost, 6),
    }


@activity.defn
async def finalize_task(input: AgentTaskInput, result: dict) -> None:
    """
    UPDATE tasks row with final status, updated_at, and token usage.
    Appends a 'done' entry to the log blob.
    Token usage is parsed from the agent's output JSONL file.
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

    # Parse token usage from JSONL output file
    token_data = _parse_jsonl_tokens(input.agent_id)

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
                blob["input_tokens"] = token_data["input_tokens"]
                blob["output_tokens"] = token_data["output_tokens"]
                blob["cache_read_tokens"] = token_data["cache_read_tokens"]
                blob["cost_usd"] = token_data["cost_usd"]
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
