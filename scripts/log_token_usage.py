#!/usr/bin/env python3
"""Log token usage for a completed agent to the token-usage SQLite DB."""

import argparse
import sqlite3

DB_PATH = "/mnt/data/data/token-usage.db"

# Cost per token (USD)
INPUT_COST_PER_TOKEN = 0.000003
OUTPUT_COST_PER_TOKEN = 0.000015


def get_db() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            agent_name TEXT,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            tool_uses INTEGER NOT NULL DEFAULT 0,
            duration_ms INTEGER,
            cost_usd REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_usage_session ON usage(session_id)"
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_usage_created ON usage(created_at)"
    )
    db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_agent ON usage(agent_id)"
    )
    db.commit()
    return db


def main() -> None:
    parser = argparse.ArgumentParser(description="Log agent token usage")
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--agent-id", required=True)
    parser.add_argument("--agent-name", default="")
    parser.add_argument("--input-tokens", type=int, default=0)
    parser.add_argument("--output-tokens", type=int, default=0)
    parser.add_argument("--tool-uses", type=int, default=0)
    parser.add_argument("--duration-ms", type=int, default=None)
    args = parser.parse_args()

    cost = (args.input_tokens * INPUT_COST_PER_TOKEN) + (
        args.output_tokens * OUTPUT_COST_PER_TOKEN
    )

    db = get_db()
    try:
        db.execute(
            """
            INSERT INTO usage
                (session_id, agent_id, agent_name, input_tokens, output_tokens,
                 tool_uses, duration_ms, cost_usd)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(agent_id) DO UPDATE SET
                session_id = excluded.session_id,
                agent_name = excluded.agent_name,
                input_tokens = excluded.input_tokens,
                output_tokens = excluded.output_tokens,
                tool_uses = excluded.tool_uses,
                duration_ms = excluded.duration_ms,
                cost_usd = excluded.cost_usd
            """,
            (
                args.session_id,
                args.agent_id,
                args.agent_name,
                args.input_tokens,
                args.output_tokens,
                args.tool_uses,
                args.duration_ms,
                cost,
            ),
        )
        db.commit()
        print(
            f"Logged agent {args.agent_id}: {args.input_tokens} in / {args.output_tokens} out tokens, cost=${cost:.6f}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
