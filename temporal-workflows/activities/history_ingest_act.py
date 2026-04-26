"""
Activity: run_history_ingest

Incrementally reads Claude session JSONL files, extracts Discord messages,
embeds them with local embeddings, and stores them in the sqlite-vec database at
/mnt/data/data/discord-history.db.
"""
from json import loads as json_loads, JSONDecodeError
import re
import sys
import sqlite3
import time
from pathlib import Path

from temporalio import activity

from .constants import SCRIPTS_DIR

sys.path.insert(0, str(SCRIPTS_DIR))
from common import (
    DB_PATH, LOCAL_EMBED_DIMS,
    EMBED_DIMS, local_embed_texts,
)

# ---- Constants ---------------------------------------------------------------

BATCH_SIZE = 100

_UPSERT_STATE = (
    "INSERT INTO ingest_state (filepath, byte_offset, last_size) VALUES (?, ?, ?) "
    "ON CONFLICT(filepath) DO UPDATE SET byte_offset=excluded.byte_offset, last_size=excluded.last_size"
)


# ---- Database ----------------------------------------------------------------

def open_db() -> sqlite3.Connection:
    import sqlite_vec
    conn = sqlite3.connect(DB_PATH)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)

    conn.executescript(f"""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT UNIQUE,
            author TEXT,
            channel_id TEXT,
            ts TEXT,
            content TEXT
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS messages_vec USING vec0(
            embedding float[{EMBED_DIMS}]
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS messages_vec_local USING vec0(
            embedding float[{LOCAL_EMBED_DIMS}]
        );

        CREATE TABLE IF NOT EXISTS ingest_state (
            filepath TEXT PRIMARY KEY,
            byte_offset INTEGER,
            last_size INTEGER
        );
    """)
    conn.commit()
    return conn


# ---- Parsers -----------------------------------------------------------------

_CHANNEL_RE = re.compile(
    r'<channel\s+source="plugin:discord[^"]*"\s+'
    r'chat_id="([^"]+)"\s+'
    r'message_id="([^"]+)"\s+'
    r'user="([^"]+)"[^>]*?ts="([^"]+)"[^>]*?>(.*?)</channel>',
    re.DOTALL,
)

_OMNI_CHANNEL_RE = re.compile(
    r'<channel\s+source="omni"[^>]*received_at="([^"]+)"[^>]*>(.*?)</channel>',
    re.DOTALL,
)

_ATTACH_COUNT_RE = re.compile(r'attachment_count="(\d+)"')
_ATTACH_META_RE = re.compile(r'attachments="([^"]*)"')

_FETCH_LINE_RE = re.compile(
    r'^\[([^\]]+)\]\s+([^:]+):\s+(.*?)\s+\(id:\s+(\d+)\)\s*$'
)


def extract_from_channel_tag(text: str) -> list[dict]:
    messages = []
    for match in _CHANNEL_RE.finditer(text):
        chat_id, message_id, user, ts, body = match.groups()
        content = body.strip()
        content = re.sub(r'<thread_context>.*?</thread_context>', '', content, flags=re.DOTALL).strip()

        full_tag = match.group(0)
        attach_count_m = _ATTACH_COUNT_RE.search(full_tag)
        attach_meta_m = _ATTACH_META_RE.search(full_tag)
        attachment_count = int(attach_count_m.group(1)) if attach_count_m else 0
        attachment_meta = attach_meta_m.group(1) if attach_meta_m else ""

        if content and not content.startswith('['):
            msg = {
                "message_id": message_id,
                "author": user,
                "channel_id": chat_id,
                "ts": ts,
                "content": content,
            }
            if attachment_count > 0:
                msg["attachment_count"] = attachment_count
                msg["attachment_meta"] = attachment_meta
            messages.append(msg)
        elif attachment_count > 0:
            messages.append({
                "message_id": message_id,
                "author": user,
                "channel_id": chat_id,
                "ts": ts,
                "content": content or "(attachment)",
                "attachment_count": attachment_count,
                "attachment_meta": attachment_meta,
            })
    return messages


def extract_from_omni_channel_tag(text: str) -> list[dict]:
    messages = []
    for match in _OMNI_CHANNEL_RE.finditer(text):
        received_at, body = match.groups()
        body = body.strip()
        try:
            data = json_loads(body)
        except JSONDecodeError:
            continue
        author_obj = data.get("author", {})
        if author_obj.get("bot"):
            continue
        content = data.get("text", "").strip()
        if not content or content.startswith("["):
            continue
        author = author_obj.get("username", "unknown")
        message_id = data.get("messageId", "")
        channel_id = data.get("channelId", data.get("omniChannelId", ""))
        ts = received_at
        messages.append({
            "message_id": message_id,
            "author": author,
            "channel_id": channel_id,
            "ts": ts,
            "content": content,
        })
    return messages


def extract_from_fetch_result(text: str) -> list[dict]:
    messages = []
    for line in text.splitlines():
        line = line.strip()
        m = _FETCH_LINE_RE.match(line)
        if m:
            ts_str, author, content, msg_id = m.groups()
            if author.strip() == "me":
                author = "BigClungus"
            messages.append({
                "message_id": msg_id,
                "author": author.strip(),
                "channel_id": "",
                "ts": ts_str,
                "content": content.strip(),
            })
    return messages


def extract_messages_from_jsonl(filepath: Path, start_offset: int) -> tuple[list[dict], int]:
    messages = []
    new_offset = start_offset

    try:
        with open(filepath, "rb") as f:
            f.seek(start_offset)
            while True:
                line = f.readline()
                if not line:
                    break
                new_offset = f.tell()
                try:
                    obj = json_loads(line.decode("utf-8", errors="replace"))
                except JSONDecodeError:
                    continue

                msg = obj.get("message", {})
                content = msg.get("content", [])

                if isinstance(content, str) and "<channel source=" in content:
                    messages.extend(extract_from_channel_tag(content))
                    messages.extend(extract_from_omni_channel_tag(content))

                elif isinstance(content, list):
                    for item in content:
                        if not isinstance(item, dict):
                            continue

                        item_text = item.get("text", "") or item.get("content", "")
                        if isinstance(item_text, str) and "<channel source=" in item_text:
                            messages.extend(extract_from_channel_tag(item_text))
                            messages.extend(extract_from_omni_channel_tag(item_text))

                        elif item.get("type") == "tool_result":
                            sub = item.get("content", [])
                            if isinstance(sub, list):
                                for sub_item in sub:
                                    if isinstance(sub_item, dict):
                                        text = sub_item.get("text", "")
                                        if text and _FETCH_LINE_RE.search(text):
                                            messages.extend(extract_from_fetch_result(text))
                            elif isinstance(sub, str) and _FETCH_LINE_RE.search(sub):
                                messages.extend(extract_from_fetch_result(sub))

    except OSError as exc:
        activity.logger.warning("could not read %s: %s", filepath, exc)

    return messages, new_offset


# ---- Main ingest loop --------------------------------------------------------


def _run_history_ingest_sync() -> str:
    conn = open_db()

    jsonl_files = sorted(Path.home().glob(".claude/projects/*/*.jsonl"))
    activity.logger.info("Found %d JSONL files", len(jsonl_files))

    total_new = 0
    _last_heartbeat = 0.0

    for filepath in jsonl_files:
        # Throttle heartbeats to once per 10 seconds — queue maxsize is 1000
        # and with thousands of files we'd overflow it immediately.
        _now = time.monotonic()
        if _now - _last_heartbeat >= 10.0:
            activity.heartbeat(f"processing {filepath.name}")
            _last_heartbeat = _now
        current_size = filepath.stat().st_size

        row = conn.execute(
            "SELECT byte_offset, last_size FROM ingest_state WHERE filepath = ?",
            (str(filepath),)
        ).fetchone()

        if row:
            stored_offset, stored_size = row
            if current_size == stored_size:
                continue
            start_offset = stored_offset
        else:
            start_offset = 0

        messages, new_offset = extract_messages_from_jsonl(filepath, start_offset)

        if not messages:
            conn.execute(_UPSERT_STATE, (str(filepath), new_offset, current_size))
            conn.commit()
            continue

        seen_ids: set[str] = set()
        candidates = []
        for msg in messages:
            mid = msg["message_id"]
            if mid in seen_ids:
                continue
            seen_ids.add(mid)
            if not msg.get("content", "").strip() and not msg.get("attachment_count", 0):
                continue
            candidates.append(msg)

        if candidates:
            batch_ids = [msg["message_id"] for msg in candidates]
            existing_ids = set(
                row[0] for row in conn.execute(
                    f"SELECT message_id FROM messages WHERE message_id IN ({','.join('?' * len(batch_ids))})",
                    batch_ids
                ).fetchall()
            )
            new_messages = [msg for msg in candidates if msg["message_id"] not in existing_ids]
        else:
            new_messages = []

        if not new_messages:
            conn.execute(_UPSERT_STATE, (str(filepath), new_offset, current_size))
            conn.commit()
            continue

        activity.logger.info("%s: %d new messages", filepath.name, len(new_messages))

        for i in range(0, len(new_messages), BATCH_SIZE):
            batch = new_messages[i:i + BATCH_SIZE]
            texts = [msg["content"] for msg in batch]

            try:
                embeddings = local_embed_texts(texts)
            except Exception as exc:
                activity.logger.error("ERROR embedding batch locally: %s", exc)
                raise  # No silent failures

            for msg, emb in zip(batch, embeddings):
                cursor = conn.execute(
                    "INSERT OR IGNORE INTO messages (message_id, author, channel_id, ts, content) "
                    "VALUES (?, ?, ?, ?, ?) RETURNING id",
                    (msg["message_id"], msg["author"], msg["channel_id"], msg["ts"], msg["content"])
                )
                row = cursor.fetchone()
                if row is None:
                    row = conn.execute(
                        "SELECT id FROM messages WHERE message_id = ?", (msg["message_id"],)
                    ).fetchone()
                if row:
                    emb_bytes = sqlite_vec.serialize_float32(emb)
                    conn.execute(
                        "INSERT OR IGNORE INTO messages_vec_local (rowid, embedding) VALUES (?, ?)",
                        (row[0], emb_bytes)
                    )

            conn.commit()
            total_new += len(batch)

        conn.execute(_UPSERT_STATE, (str(filepath), new_offset, current_size))
        conn.commit()

    total_messages = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    total_local_vecs = conn.execute("SELECT COUNT(*) FROM messages_vec_local").fetchone()[0]
    conn.close()
    summary = f"Ingest complete. New messages this run: {total_new}. Total in DB: {total_messages}. Local embeddings: {total_local_vecs}."
    activity.logger.info(summary)
    return summary


@activity.defn
async def run_history_ingest() -> str:
    """Run Discord history ingest and return summary."""
    return _run_history_ingest_sync()
