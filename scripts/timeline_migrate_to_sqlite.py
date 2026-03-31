#!/usr/bin/env python3
"""
One-time migration: load timeline.json into the clunger timeline SQLite DB.
"""

import json
import sqlite3
import sys

TIMELINE_JSON = "/mnt/data/hello-world/data/timeline.json"
TIMELINE_DB = "/mnt/data/clunger/timeline.db"


def main():
    with open(TIMELINE_JSON) as f:
        events = json.load(f)

    conn = sqlite3.connect(TIMELINE_DB)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS timeline_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            category TEXT DEFAULT 'milestone',
            icon TEXT,
            url TEXT,
            source TEXT DEFAULT 'manual',
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)

    # Check if already populated
    count = conn.execute("SELECT COUNT(*) FROM timeline_events").fetchone()[0]
    if count > 0:
        print(f"DB already has {count} rows. Skipping migration (use --force to override).")
        if "--force" not in sys.argv:
            conn.close()
            return
        print("--force: deleting existing rows first.")
        conn.execute("DELETE FROM timeline_events")

    inserted = 0
    for ev in events:
        conn.execute(
            """INSERT INTO timeline_events (date, title, description, category, icon, url, source)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                ev.get("date"),
                ev.get("title"),
                ev.get("description"),
                ev.get("category", "milestone"),
                ev.get("icon"),
                ev.get("url"),
                ev.get("source", "manual"),
            ),
        )
        inserted += 1

    conn.commit()
    conn.close()
    print(f"Migrated {inserted} timeline events from JSON to SQLite ({TIMELINE_DB})")


if __name__ == "__main__":
    main()
