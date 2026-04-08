#!/usr/bin/env python3
"""
Milestone 1: Migrate existing task JSON files and token-usage.db into agents.db.

Creates /mnt/data/data/agents.db with unified schema, then:
  - Reads all *.json from /mnt/data/bigclungus-meta/tasks/ → tasks + task_events tables
  - Reads token-usage.db → agents table
  - Joins agents to tasks by agent_id where possible
  - Idempotent: skips already-inserted rows
"""

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

TASKS_DIR = Path("/mnt/data/bigclungus-meta/tasks")
TOKEN_USAGE_DB = Path("/mnt/data/data/token-usage.db")
AGENTS_DB = Path("/mnt/data/data/agents.db")

SCHEMA = """
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
);

CREATE TABLE IF NOT EXISTS tasks (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT,
    status          TEXT DEFAULT 'open',
    created_at      INTEGER,
    updated_at      INTEGER,
    source          TEXT
);

CREATE TABLE IF NOT EXISTS task_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    message         TEXT,
    created_at      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_agents_task_id   ON agents(task_id);
CREATE INDEX IF NOT EXISTS idx_agents_status    ON agents(status);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id);
"""


def parse_ts(ts_str: str | None) -> int | None:
    """Parse ISO timestamp string to Unix epoch integer."""
    if not ts_str:
        return None
    # Strip trailing Z, handle +00:00
    ts_str = ts_str.rstrip("Z").replace("+00:00", "")
    formats = [
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(ts_str, fmt).replace(tzinfo=timezone.utc)
            return int(dt.timestamp())
        except ValueError:
            continue
    return None


def file_mtime(path: Path) -> int:
    return int(path.stat().st_mtime)


def migrate_tasks(conn: sqlite3.Connection) -> tuple[int, int, int]:
    """
    Migrate task JSON files into tasks + task_events tables.
    Returns (tasks_inserted, tasks_skipped, events_inserted).
    """
    cur = conn.cursor()
    # Build set of existing task IDs for idempotency
    cur.execute("SELECT id FROM tasks")
    existing_tasks = {row[0] for row in cur.fetchall()}

    # Build set of existing (task_id, event_type, created_at) for events idempotency
    cur.execute("SELECT task_id, event_type, created_at FROM task_events")
    existing_events = {(r[0], r[1], r[2]) for r in cur.fetchall()}

    tasks_inserted = 0
    tasks_skipped = 0
    events_inserted = 0
    parse_errors = 0

    for fpath in sorted(TASKS_DIR.glob("*.json")):
        try:
            with open(fpath) as fh:
                data = json.load(fh)
        except (json.JSONDecodeError, OSError) as e:
            print(f"  WARN: could not parse {fpath.name}: {e}", file=sys.stderr)
            parse_errors += 1
            continue

        task_id = data.get("id")
        if not task_id:
            print(f"  WARN: no id in {fpath.name}, skipping", file=sys.stderr)
            continue

        # Derive timestamps
        mtime = file_mtime(fpath)
        created_at = parse_ts(data.get("started_at") or data.get("created_at")) or mtime
        finished_at = parse_ts(data.get("finished_at"))
        updated_at = finished_at or mtime

        # Derive status: check log entries for done/failed events
        status = data.get("status", "open")
        if not status or status == "open":
            for entry in data.get("log", []):
                ev = entry.get("event", "")
                if ev in ("done", "failed"):
                    status = ev
                    break
            else:
                status = "open"

        # Derive source from discord_user or discord_message_id
        source = None
        if data.get("discord_user"):
            source = f"discord:{data['discord_user']}"
        elif data.get("discord_message_id"):
            source = f"discord_msg:{data['discord_message_id']}"

        description = data.get("summary") or data.get("body")
        title = data.get("title", "(untitled)")

        if task_id not in existing_tasks:
            cur.execute(
                """
                INSERT INTO tasks (id, title, description, status, created_at, updated_at, source)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (task_id, title, description, status, created_at, updated_at, source),
            )
            tasks_inserted += 1
            existing_tasks.add(task_id)
        else:
            tasks_skipped += 1

        # Migrate log entries → task_events
        for entry in data.get("log", []):
            event_type = entry.get("event") or entry.get("event_type") or "unknown"
            message = entry.get("message") or entry.get("context") or entry.get("summary")
            entry_ts = parse_ts(entry.get("ts")) or created_at

            key = (task_id, event_type, entry_ts)
            if key not in existing_events:
                cur.execute(
                    """
                    INSERT INTO task_events (task_id, event_type, message, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (task_id, event_type, message, entry_ts),
                )
                events_inserted += 1
                existing_events.add(key)

    conn.commit()
    if parse_errors:
        print(f"  WARN: {parse_errors} task files failed to parse", file=sys.stderr)
    return tasks_inserted, tasks_skipped, events_inserted


def migrate_agents(conn: sqlite3.Connection) -> tuple[int, int, int]:
    """
    Migrate token-usage.db rows into agents table.
    Joins to tasks by agent_id prefix match.
    Returns (agents_inserted, agents_skipped, orphaned).
    """
    if not TOKEN_USAGE_DB.exists():
        print(f"  WARN: {TOKEN_USAGE_DB} not found, skipping agent migration", file=sys.stderr)
        return 0, 0, 0

    src = sqlite3.connect(TOKEN_USAGE_DB)
    src.row_factory = sqlite3.Row
    src_cur = src.cursor()
    src_cur.execute("SELECT * FROM usage")
    rows = src_cur.fetchall()
    src.close()

    cur = conn.cursor()

    # Existing agent IDs for idempotency
    cur.execute("SELECT id FROM agents")
    existing_agents = {row[0] for row in cur.fetchall()}

    # Build agent_id → task_id lookup from tasks table
    # task JSON agent_id is stored in the task file but NOT in tasks table
    # We need to rebuild it from task JSON files
    agent_to_task: dict[str, str] = {}
    for fpath in TASKS_DIR.glob("*.json"):
        try:
            with open(fpath) as fh:
                data = json.load(fh)
            aid = data.get("agent_id")
            tid = data.get("id")
            if aid and tid:
                agent_to_task[aid] = tid
        except (json.JSONDecodeError, OSError):
            pass

    agents_inserted = 0
    agents_skipped = 0
    orphaned = 0

    for row in rows:
        # Use a deterministic ID: "usage-{rowid}"
        agent_id = f"usage-{row['id']}"

        if agent_id in existing_agents:
            agents_skipped += 1
            continue

        # Try to find matching task
        raw_agent_id = row["agent_id"]
        task_id = agent_to_task.get(raw_agent_id)

        # Derive status from whether there's a cost logged
        status = "completed" if row["cost_usd"] > 0 else "in_progress"

        created_ts = parse_ts(row["created_at"])

        if task_id is None:
            orphaned += 1

        cur.execute(
            """
            INSERT INTO agents (id, task_id, session_id, started_at, completed_at,
                                status, input_tokens, output_tokens, cost_usd, model, output_file)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                agent_id,
                task_id,
                row["session_id"],
                created_ts,
                created_ts,  # no separate completed_at in source
                status,
                row["input_tokens"],
                row["output_tokens"],
                row["cost_usd"],
                row["agent_name"],  # agent_name holds the task description/model hint
                None,
            ),
        )
        agents_inserted += 1
        existing_agents.add(agent_id)

    conn.commit()
    return agents_inserted, agents_skipped, orphaned


def main() -> None:
    AGENTS_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(AGENTS_DB)
    conn.executescript(SCHEMA)
    conn.commit()

    print(f"Created/opened: {AGENTS_DB}")
    print()

    print("Migrating tasks...")
    t_ins, t_skip, ev_ins = migrate_tasks(conn)
    print(f"  Tasks inserted:  {t_ins}")
    print(f"  Tasks skipped:   {t_skip} (already existed)")
    print(f"  Events inserted: {ev_ins}")
    print()

    print("Migrating agents (token-usage.db)...")
    a_ins, a_skip, orphaned = migrate_agents(conn)
    print(f"  Agents inserted:  {a_ins}")
    print(f"  Agents skipped:   {a_skip} (already existed)")
    print(f"  Orphaned agents:  {orphaned} (no matching task)")
    print()

    # Summary query
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM tasks")
    total_tasks = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM task_events")
    total_events = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM agents")
    total_agents = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM agents WHERE task_id IS NULL")
    total_orphaned = cur.fetchone()[0]

    print("=== Migration Report ===")
    print(f"  tasks:       {total_tasks}")
    print(f"  task_events: {total_events}")
    print(f"  agents:      {total_agents}")
    print(f"  orphaned:    {total_orphaned}")

    conn.close()


if __name__ == "__main__":
    main()
