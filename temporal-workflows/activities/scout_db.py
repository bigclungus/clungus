"""
SQLite database for the Model Scout workflow.

Table: scouted_models — tracks all models seen by the scout, their status,
and metadata from the source (HuggingFace / together.ai).
"""

import sqlite3
from pathlib import Path

from temporalio import activity

from .constants import BASE_DIR

DB_PATH = f"{BASE_DIR}/data/scouted-models.db"

# Status constants
STATUS_PROPOSED = "proposed"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"
STATUS_SKIPPED = "skipped"


def _init_db() -> None:
    """Create the database and table if they don't exist. Called once at import."""
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS scouted_models (
                model_id            TEXT PRIMARY KEY,
                source              TEXT NOT NULL,
                name                TEXT NOT NULL,
                params              INTEGER,
                description         TEXT,
                unique_description  TEXT,
                first_seen          TEXT NOT NULL,
                status              TEXT NOT NULL DEFAULT 'proposed'
            )
        """)
        # Migrate existing databases that lack the unique_description column
        existing_cols = [
            row[1] for row in conn.execute("PRAGMA table_info(scouted_models)").fetchall()
        ]
        if "unique_description" not in existing_cols:
            conn.execute("ALTER TABLE scouted_models ADD COLUMN unique_description TEXT")
        conn.commit()
    finally:
        conn.close()


_init_db()


def _get_conn() -> sqlite3.Connection:
    """Return a connection to the scouted_models database."""
    return sqlite3.connect(DB_PATH)


def get_all_model_ids() -> list[str]:
    """Return a list of all model_id values in the database."""
    conn = _get_conn()
    try:
        rows = conn.execute("SELECT model_id FROM scouted_models").fetchall()
        return [row[0] for row in rows]
    finally:
        conn.close()


def insert_model(
    model_id: str,
    source: str,
    name: str,
    params: int | None,
    description: str | None,
    first_seen: str,
    status: str = STATUS_PROPOSED,
    unique_description: str | None = None,
) -> None:
    """Insert a new model record."""
    conn = _get_conn()
    try:
        conn.execute(
            """INSERT INTO scouted_models
               (model_id, source, name, params, description, unique_description, first_seen, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (model_id, source, name, params, description, unique_description, first_seen, status),
        )
        conn.commit()
    finally:
        conn.close()


def update_status(model_id: str, status: str) -> None:
    """Update the status of a scouted model."""
    conn = _get_conn()
    try:
        conn.execute(
            "UPDATE scouted_models SET status = ? WHERE model_id = ?",
            (status, model_id),
        )
        conn.commit()
    finally:
        conn.close()


# --- Temporal activity wrappers ---
# Workflows must not call DB functions directly; these activities wrap them.

@activity.defn
async def db_insert_model(
    model_id: str,
    source: str,
    name: str,
    params: int | None,
    description: str | None,
    first_seen: str,
    status: str = STATUS_PROPOSED,
    unique_description: str | None = None,
) -> None:
    """Activity wrapper for insert_model."""
    insert_model(model_id, source, name, params, description, first_seen, status, unique_description)


@activity.defn
async def db_update_status(model_id: str, status: str) -> None:
    """Activity wrapper for update_status."""
    update_status(model_id, status)


@activity.defn
async def db_get_known_ids() -> list[str]:
    """Activity wrapper for get_all_model_ids. Returns all known model IDs."""
    return get_all_model_ids()
