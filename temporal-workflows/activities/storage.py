import aiosqlite
from temporalio import activity


async def _ensure_table(db: aiosqlite.Connection) -> None:
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS seen_listings (
            search_name TEXT NOT NULL,
            listing_id  TEXT NOT NULL,
            seen_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (search_name, listing_id)
        )
        """
    )
    await db.commit()


@activity.defn
async def load_seen_ids(db_path: str, search_name: str) -> list[str]:
    """Load previously seen listing IDs from SQLite."""
    async with aiosqlite.connect(db_path) as db:
        await _ensure_table(db)
        cursor = await db.execute(
            "SELECT listing_id FROM seen_listings WHERE search_name = ?",
            (search_name,),
        )
        rows = await cursor.fetchall()
        return [row[0] for row in rows]


@activity.defn
async def save_seen_ids(db_path: str, search_name: str, ids: list[str]) -> None:
    """Save newly seen listing IDs to SQLite."""
    async with aiosqlite.connect(db_path) as db:
        await _ensure_table(db)
        await db.executemany(
            "INSERT OR IGNORE INTO seen_listings (search_name, listing_id) VALUES (?, ?)",
            [(search_name, listing_id) for listing_id in ids],
        )
        await db.commit()
