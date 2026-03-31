#!/usr/bin/env python3
"""Migrate task JSON files to SQLite.

Reads every *.json file from TASKS_DIR, inserts them into tasks.db.
Does NOT delete JSON files — run this first, verify, then decide.

Usage:
    python3 migrate_tasks_to_sqlite.py [--db /path/to/tasks.db]
"""

import argparse
import glob
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
from tasks_db import DEFAULT_DB, get_db, init_db

TASKS_DIR = "/home/clungus/work/bigclungus-meta/tasks"
TERMINAL_STATUSES = {"done", "failed", "cancelled", "stale"}


def derive_status(data: dict) -> str:
    status = data.get("status", "")
    if status:
        return status
    log = data.get("log", [])
    if not log:
        return "in_progress"
    last_event = log[-1].get("event", "")
    if last_event in ("done", "failed", "cancelled", "stale"):
        return last_event
    return "in_progress"


def derive_created_at(data: dict) -> str:
    # Prefer started_at, fall back to first log entry ts
    val = data.get("started_at", "")
    if val:
        return val
    log = data.get("log", [])
    if log:
        return log[0].get("ts", "")
    return ""


def main():
    parser = argparse.ArgumentParser(description="Migrate task JSON files to SQLite")
    parser.add_argument("--db", default=DEFAULT_DB, help="Path to tasks.db")
    args = parser.parse_args()

    db_path = args.db
    print(f"Initializing DB at {db_path}")
    init_db(db_path)

    conn = get_db(db_path)
    files = sorted(glob.glob(os.path.join(TASKS_DIR, "*.json")))
    files = [f for f in files if os.path.basename(f) != ".gitkeep"]

    inserted_tasks = 0
    skipped_tasks = 0
    inserted_events = 0
    errors = 0

    for fpath in files:
        try:
            with open(fpath) as f:
                data = json.load(f)
        except Exception as e:
            print(f"  ERROR reading {os.path.basename(fpath)}: {e}", file=sys.stderr)
            errors += 1
            continue

        task_id = data.get("id", "")
        if not task_id:
            print(f"  SKIP (no id): {os.path.basename(fpath)}", file=sys.stderr)
            skipped_tasks += 1
            continue

        status = derive_status(data)
        created_at = derive_created_at(data)

        # updated_at = last log entry ts, or finished_at, or created_at
        log = data.get("log", [])
        if log:
            updated_at = log[-1].get("ts", created_at)
        else:
            updated_at = data.get("finished_at", created_at)

        try:
            conn.execute(
                """
                INSERT OR IGNORE INTO tasks (id, title, status, created_at, updated_at, data)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    task_id,
                    data.get("title", ""),
                    status,
                    created_at,
                    updated_at,
                    json.dumps(data),
                ),
            )
            if conn.execute("SELECT changes()").fetchone()[0] > 0:
                inserted_tasks += 1
            else:
                skipped_tasks += 1

            # Insert log entries (INSERT OR IGNORE won't help since events have AUTOINCREMENT)
            # Only insert if task was freshly inserted to avoid duplicates on re-run
            existing_events = conn.execute(
                "SELECT COUNT(*) FROM task_events WHERE task_id = ?", (task_id,)
            ).fetchone()[0]

            if existing_events == 0:
                for entry in log:
                    ts = entry.get("ts", "")
                    event = entry.get("event", entry.get("event_type", "unknown"))
                    # Log entries can have 'context' or 'message'
                    message = entry.get("message", entry.get("context", ""))
                    conn.execute(
                        "INSERT INTO task_events (task_id, event, message, ts) VALUES (?, ?, ?, ?)",
                        (task_id, event, message, ts),
                    )
                    inserted_events += 1

        except Exception as e:
            print(f"  ERROR inserting {task_id}: {e}", file=sys.stderr)
            errors += 1
            continue

    conn.commit()
    conn.close()

    print(f"\nMigration complete.")
    print(f"  Tasks inserted:  {inserted_tasks}")
    print(f"  Tasks skipped (already existed): {skipped_tasks}")
    print(f"  Events inserted: {inserted_events}")
    print(f"  Errors:          {errors}")
    print(f"  Total JSON files scanned: {len(files)}")

    # Quick sanity check
    conn2 = get_db(db_path)
    total = conn2.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
    open_count = conn2.execute(
        "SELECT COUNT(*) FROM tasks WHERE status NOT IN ('done','failed','cancelled','stale')"
    ).fetchone()[0]
    terminal_count = conn2.execute(
        "SELECT COUNT(*) FROM tasks WHERE status IN ('done','failed','cancelled','stale')"
    ).fetchone()[0]
    event_count = conn2.execute("SELECT COUNT(*) FROM task_events").fetchone()[0]
    conn2.close()

    print(f"\nDB state:")
    print(f"  Total tasks:    {total}")
    print(f"  Open:           {open_count}")
    print(f"  Terminal:       {terminal_count}")
    print(f"  Total events:   {event_count}")


if __name__ == "__main__":
    main()
