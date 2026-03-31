"""Shared SQLite module for the BigClungus task store.

DB lives at /home/clungus/work/bigclungus-meta/tasks.db

Tables:
  tasks       — one row per task (id, title, status, timestamps, full JSON blob)
  task_events — append-only event log (mirrors the log[] array in JSON files)
"""

import sqlite3
from pathlib import Path

DEFAULT_DB = "/home/clungus/work/bigclungus-meta/tasks.db"


def get_db(db_path: str = DEFAULT_DB) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for concurrent readers
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(db_path: str = DEFAULT_DB) -> None:
    """Create tables if they don't exist. Safe to call on every startup."""
    conn = get_db(db_path)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS tasks (
            id          TEXT PRIMARY KEY,
            title       TEXT,
            status      TEXT,
            created_at  TEXT,
            updated_at  TEXT,
            data        TEXT    -- full task JSON blob
        );

        CREATE TABLE IF NOT EXISTS task_events (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id  TEXT NOT NULL,
            event    TEXT NOT NULL,
            message  TEXT,
            ts       TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id)
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_created  ON tasks(created_at);
        CREATE INDEX IF NOT EXISTS idx_events_task_id ON task_events(task_id);
    """)
    conn.commit()
    conn.close()
