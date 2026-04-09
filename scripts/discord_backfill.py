#!/usr/bin/env python3
"""
Discord full backfill: fetch ALL messages from ALL text channels in the guild
via the Discord bot API and store them in the discord-history.db SQLite database.

Uses local sentence-transformers embeddings (all-MiniLM-L6-v2, 384 dims) instead
of OpenAI, stored in a separate messages_vec_local table.

Usage:
  python3 discord_backfill.py                    # backfill all text channels
  python3 discord_backfill.py --channel 12345    # backfill specific channel
  python3 discord_backfill.py --embed-only       # only generate embeddings for rows missing them
  python3 discord_backfill.py --migrate           # migrate existing rows to local embeddings
"""

import argparse
import sqlite3
import time

import requests
import sqlite_vec

from common import (
    DB_PATH, LOCAL_EMBED_MODEL,
    serialize_f32, get_bot_token, get_local_model,
)

# ---- Config ------------------------------------------------------------------

GUILD_ID = "1008814210144292894"
BATCH_SIZE = 100  # Discord API max per request
EMBED_BATCH_SIZE = 256  # sentences per embedding batch

DISCORD_API = "https://discord.com/api/v10"

# ---- Helpers -----------------------------------------------------------------


def open_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT UNIQUE,
            author TEXT,
            channel_id TEXT,
            ts TEXT,
            content TEXT
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS messages_vec_local USING vec0(
            embedding float[384]
        );
    """)
    conn.commit()
    return conn


# ---- Discord API -------------------------------------------------------------


class DiscordClient:
    def __init__(self, token: str):
        self.token = token
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bot {token}",
            "User-Agent": "DiscordBot (https://clung.us, 1.0)",
        })
        self._rate_limit_remaining = 10
        self._rate_limit_reset = 0.0

    def _request(self, method: str, url: str, **kwargs) -> requests.Response:
        """Make a rate-limit-aware request with exponential backoff."""
        backoff = 1.0
        for attempt in range(10):
            # Preemptive rate limit wait
            now = time.time()
            if self._rate_limit_remaining <= 1 and self._rate_limit_reset > now:
                wait = self._rate_limit_reset - now + 0.1
                print(f"  [rate-limit] preemptive wait {wait:.1f}s")
                time.sleep(wait)

            resp = self.session.request(method, url, **kwargs)

            # Update rate limit state
            self._rate_limit_remaining = int(resp.headers.get("X-RateLimit-Remaining", 10))
            self._rate_limit_reset = float(resp.headers.get("X-RateLimit-Reset", 0))

            if resp.status_code == 200:
                return resp
            elif resp.status_code == 429:
                retry_after = resp.json().get("retry_after", backoff)
                print(f"  [429] rate limited, waiting {retry_after}s (attempt {attempt+1})")
                time.sleep(retry_after)
                backoff = min(backoff * 2, 60)
                continue
            elif resp.status_code == 403:
                print(f"  [403] forbidden for {url} — skipping")
                return resp
            elif resp.status_code == 404:
                print(f"  [404] not found: {url} — skipping")
                return resp
            else:
                print(f"  [{resp.status_code}] unexpected response for {url}: {resp.text[:200]}")
                if attempt < 9:
                    time.sleep(backoff)
                    backoff = min(backoff * 2, 60)
                    continue
                raise RuntimeError(f"Failed after 10 attempts: {resp.status_code} {resp.text[:200]}")

        raise RuntimeError("Exhausted retries")

    def get_guild_channels(self, guild_id: str) -> list[dict]:
        resp = self._request("GET", f"{DISCORD_API}/guilds/{guild_id}/channels")
        if resp.status_code != 200:
            return []
        return resp.json()

    def get_channel_messages(self, channel_id: str, before: str = None, limit: int = 100) -> list[dict]:
        params = {"limit": limit}
        if before:
            params["before"] = before
        resp = self._request("GET", f"{DISCORD_API}/channels/{channel_id}/messages", params=params)
        if resp.status_code != 200:
            return []
        return resp.json()

    def get_active_threads(self, guild_id: str) -> list[dict]:
        resp = self._request("GET", f"{DISCORD_API}/guilds/{guild_id}/threads/active")
        if resp.status_code != 200:
            return []
        data = resp.json()
        return data.get("threads", [])


# ---- Backfill ----------------------------------------------------------------


def backfill_channel(client: DiscordClient, conn: sqlite3.Connection,
                     channel_id: str, channel_name: str) -> int:
    """Fetch all messages from a channel, oldest first. Returns count of new messages."""
    print(f"\n--- Backfilling #{channel_name} ({channel_id}) ---")

    # Find earliest message we already have for this channel to know our floor
    existing = conn.execute(
        "SELECT COUNT(*) FROM messages WHERE channel_id = ?", (channel_id,)
    ).fetchone()[0]
    print(f"  Existing messages in DB: {existing}")

    total_fetched = 0
    total_new = 0
    before_id = None

    while True:
        messages = client.get_channel_messages(channel_id, before=before_id)
        if not messages:
            break

        total_fetched += len(messages)
        batch_new = 0

        for msg in messages:
            msg_id = msg["id"]
            author = msg.get("author", {}).get("username", "unknown")
            content = msg.get("content", "").strip()
            ts = msg.get("timestamp", "")

            # Build content with attachment info
            attachments = msg.get("attachments", [])
            if attachments:
                att_descriptions = []
                for att in attachments:
                    att_descriptions.append(f"[Attachment: {att.get('filename', 'unknown')}]")
                if content:
                    content = content + " " + " ".join(att_descriptions)
                else:
                    content = " ".join(att_descriptions)

            # Include embeds description
            embeds = msg.get("embeds", [])
            if embeds and not content:
                embed_parts = []
                for emb in embeds:
                    if emb.get("title"):
                        embed_parts.append(f"[Embed: {emb['title']}]")
                    elif emb.get("description"):
                        embed_parts.append(f"[Embed: {emb['description'][:100]}]")
                if embed_parts:
                    content = " ".join(embed_parts)

            if not content:
                continue

            cursor = conn.execute(
                "INSERT OR IGNORE INTO messages (message_id, author, channel_id, ts, content) "
                "VALUES (?, ?, ?, ?, ?)",
                (msg_id, author, channel_id, ts, content),
            )
            if cursor.rowcount > 0:
                batch_new += 1

        # The oldest message in this batch becomes our next "before" cursor
        before_id = messages[-1]["id"]
        total_new += batch_new

        if total_fetched % 500 < BATCH_SIZE:
            conn.commit()
            print(f"  Fetched {total_fetched} messages, {total_new} new so far...")

        # If we got fewer than 100, we've reached the beginning
        if len(messages) < BATCH_SIZE:
            break

    conn.commit()
    print(f"  Done: fetched {total_fetched} total, {total_new} new messages stored")
    return total_new


def embed_missing(conn: sqlite3.Connection, model) -> int:
    """Generate local embeddings for all messages missing from messages_vec_local."""
    # Count total missing first
    missing_count = conn.execute("""
        SELECT COUNT(*)
        FROM messages m
        LEFT JOIN messages_vec_local v ON v.rowid = m.id
        WHERE v.rowid IS NULL
    """).fetchone()[0]

    if not missing_count:
        print("All messages already have local embeddings.")
        return 0

    print(f"Generating local embeddings for {missing_count} messages...")
    total = 0
    last_id = 0

    while True:
        batch = conn.execute("""
            SELECT m.id, m.content
            FROM messages m
            LEFT JOIN messages_vec_local v ON v.rowid = m.id
            WHERE v.rowid IS NULL AND m.id > ?
            ORDER BY m.id
            LIMIT ?
        """, (last_id, EMBED_BATCH_SIZE)).fetchall()

        if not batch:
            break

        ids = [row[0] for row in batch]
        texts = [row[1] for row in batch]
        last_id = ids[-1]

        embeddings = model.encode(texts, show_progress_bar=False)

        for row_id, emb in zip(ids, embeddings):
            emb_bytes = serialize_f32(emb.tolist())
            conn.execute(
                "INSERT OR IGNORE INTO messages_vec_local (rowid, embedding) VALUES (?, ?)",
                (row_id, emb_bytes),
            )

        conn.commit()
        total += len(batch)
        if total % 1000 == 0 or total == missing_count:
            print(f"  Embedded {total}/{missing_count} messages")

    print(f"Done: generated {total} local embeddings")
    return total


def main():
    parser = argparse.ArgumentParser(description="Discord full backfill with local embeddings")
    parser.add_argument("--channel", type=str, help="Backfill only this channel ID")
    parser.add_argument("--embed-only", action="store_true", help="Only generate missing embeddings")
    parser.add_argument("--migrate", action="store_true",
                        help="Generate local embeddings for existing messages (same as --embed-only)")
    parser.add_argument("--include-threads", action="store_true",
                        help="Also backfill active threads")
    args = parser.parse_args()

    conn = open_db()

    # Load embedding model
    print(f"Loading embedding model ({LOCAL_EMBED_MODEL})...")
    model = get_local_model()
    print(f"Model loaded (dims={model.get_sentence_embedding_dimension()})")

    if args.embed_only or args.migrate:
        embed_missing(conn, model)
        total = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        vec_count = conn.execute("SELECT COUNT(*) FROM messages_vec_local").fetchone()[0]
        print(f"\nTotal messages: {total}, Local embeddings: {vec_count}")
        conn.close()
        return

    # Fetch messages from Discord API
    token = get_bot_token()
    client = DiscordClient(token)

    if args.channel:
        channel_ids = [(args.channel, f"channel-{args.channel}")]
    else:
        # Get all text channels from guild
        channels = client.get_guild_channels(GUILD_ID)
        # type 0 = text, 5 = announcement
        text_channels = [
            (c["id"], c["name"])
            for c in channels
            if c["type"] in (0, 5)
        ]
        channel_ids = text_channels
        print(f"Found {len(channel_ids)} text channels to backfill")

    total_new = 0
    for ch_id, ch_name in channel_ids:
        new = backfill_channel(client, conn, ch_id, ch_name)
        total_new += new

    # Also get active threads if requested
    if args.include_threads:
        print("\n--- Fetching active threads ---")
        threads = client.get_active_threads(GUILD_ID)
        print(f"Found {len(threads)} active threads")
        for thread in threads:
            new = backfill_channel(client, conn, thread["id"], thread["name"])
            total_new += new

    print(f"\n=== Backfill complete: {total_new} new messages across all channels ===")

    # Now generate embeddings for everything missing
    embed_missing(conn, model)

    total = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    vec_count = conn.execute("SELECT COUNT(*) FROM messages_vec_local").fetchone()[0]
    print(f"\nFinal totals — Messages: {total}, Local embeddings: {vec_count}")
    conn.close()


if __name__ == "__main__":
    main()
