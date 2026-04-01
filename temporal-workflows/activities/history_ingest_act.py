"""
Activity: run_history_ingest

Incrementally reads Claude session JSONL files, extracts Discord messages,
embeds them with OpenAI, and stores them in the sqlite-vec database at
/mnt/data/data/discord-history.db.

Attachment handling: messages with image attachments are described using
gpt-4o-mini vision before embedding, so the vector captures actual content.
"""
import base64
import json
import glob
import os
import re
import sys
import sqlite3
import time
import urllib.request
from datetime import datetime

from temporalio import activity

from .constants import DISCORD_API
from .utils import get_discord_token

sys.path.insert(0, "/mnt/data/scripts")
from common import (
    DB_PATH, LOCAL_EMBED_MODEL, LOCAL_EMBED_DIMS,
    EMBED_MODEL, EMBED_DIMS, local_embed_texts, serialize_f32,
)

# ---- Constants ---------------------------------------------------------------

JSONL_GLOB = "/home/clungus/.claude/projects/*/*.jsonl"
BATCH_SIZE = 100

IMAGE_MIMES = {"image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"}
VISION_MODEL = "gpt-4o-mini"
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB limit for vision API

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
    for m in _CHANNEL_RE.finditer(text):
        chat_id, message_id, user, ts, body = m.groups()
        content = body.strip()
        content = re.sub(r'<thread_context>.*?</thread_context>', '', content, flags=re.DOTALL).strip()

        full_tag = m.group(0)
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
    for m in _OMNI_CHANNEL_RE.finditer(text):
        received_at, body = m.groups()
        body = body.strip()
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
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


def extract_messages_from_jsonl(filepath: str, start_offset: int) -> tuple[list[dict], int]:
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
                    obj = json.loads(line.decode("utf-8", errors="replace"))
                except json.JSONDecodeError:
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
                                for s in sub:
                                    if isinstance(s, dict):
                                        t = s.get("text", "")
                                        if t and _FETCH_LINE_RE.search(t):
                                            messages.extend(extract_from_fetch_result(t))
                            elif isinstance(sub, str) and _FETCH_LINE_RE.search(sub):
                                messages.extend(extract_from_fetch_result(sub))

    except OSError as e:
        activity.logger.warning("could not read %s: %s", filepath, e)

    return messages, new_offset


# ---- Attachment description --------------------------------------------------



def _parse_attachment_meta(meta: str) -> list[dict]:
    attachments = []
    if not meta:
        return attachments
    for part in meta.split("; "):
        part = part.strip()
        m = re.match(r'^(.+?)\s+\(([^,]+),\s*([^)]+)\)$', part)
        if m:
            attachments.append({
                "filename": m.group(1),
                "content_type": m.group(2),
                "size_str": m.group(3),
            })
        elif part:
            attachments.append({"filename": part, "content_type": "unknown", "size_str": ""})
    return attachments


def _fetch_attachment_urls(channel_id: str, message_id: str, token: str) -> list[dict]:
    url = f"{DISCORD_API}/channels/{channel_id}/messages/{message_id}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bot {token}",
            "User-Agent": "DiscordBot (https://clung.us, 1.0)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return data.get("attachments", [])
    except Exception as e:
        activity.logger.warning("failed to fetch message %s: %s", message_id, e)
        return []


def _download_image(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DiscordBot (https://clung.us, 1.0)"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
            if len(data) > MAX_IMAGE_SIZE:
                return None
            return data
    except Exception as e:
        activity.logger.warning("failed to download image: %s", e)
        return None


def _describe_image(client, image_bytes: bytes, content_type: str, filename: str) -> str:
    b64 = base64.b64encode(image_bytes).decode("ascii")
    media_type = content_type if content_type in IMAGE_MIMES else "image/png"
    try:
        resp = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe this Discord image attachment in one concise sentence. Focus on the key visual content — what is shown, any text visible, the subject matter. Be specific and factual."},
                    {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}", "detail": "low"}},
                ],
            }],
            max_tokens=150,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        activity.logger.warning("vision describe failed for %s: %s", filename, e)
        return f"Image: {filename}"


def describe_attachments(client, msg: dict, discord_token: str) -> str:
    original_content = msg.get("content", "").strip()
    if original_content == "(attachment)":
        original_content = ""

    attachment_meta = msg.get("attachment_meta", "")
    parsed = _parse_attachment_meta(attachment_meta)

    if not parsed:
        return original_content or "(attachment)"

    channel_id = msg.get("channel_id", "")
    message_id = msg.get("message_id", "")
    api_attachments = []
    if channel_id and message_id:
        api_attachments = _fetch_attachment_urls(channel_id, message_id, discord_token)

    url_map = {}
    for a in api_attachments:
        url_map[a.get("filename", "")] = a

    descriptions = []
    for att in parsed:
        filename = att["filename"]
        content_type = att["content_type"]
        api_att = url_map.get(filename, {})

        if content_type in IMAGE_MIMES and api_att.get("url"):
            image_bytes = _download_image(api_att["url"])
            if image_bytes:
                desc = _describe_image(client, image_bytes, content_type, filename)
                descriptions.append(f"[Image: {desc}]")
            else:
                descriptions.append(f"[Image attachment: {filename}]")
        else:
            descriptions.append(f"[Attachment: {filename} ({content_type})]")

    parts = []
    if original_content:
        parts.append(original_content)
    parts.extend(descriptions)
    return " ".join(parts)


# ---- Embeddings --------------------------------------------------------------

def embed_batch(client, texts: list[str]) -> list[list[float]]:
    """Legacy OpenAI embedding (kept for backward compat)."""
    response = client.embeddings.create(
        model=EMBED_MODEL,
        input=texts,
    )
    return [item.embedding for item in response.data]


# ---- Main ingest loop --------------------------------------------------------


def _run_history_ingest_sync() -> str:
    import sqlite_vec

    conn = open_db()

    jsonl_files = sorted(glob.glob(JSONL_GLOB))
    activity.logger.info("Found %d JSONL files", len(jsonl_files))

    total_new = 0
    _last_heartbeat = 0.0

    for filepath in jsonl_files:
        # Throttle heartbeats to once per 10 seconds — queue maxsize is 1000
        # and with thousands of files we'd overflow it immediately.
        _now = time.monotonic()
        if _now - _last_heartbeat >= 10.0:
            activity.heartbeat(f"processing {os.path.basename(filepath)}")
            _last_heartbeat = _now
        current_size = os.path.getsize(filepath)

        row = conn.execute(
            "SELECT byte_offset, last_size FROM ingest_state WHERE filepath = ?",
            (filepath,)
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
            conn.execute(_UPSERT_STATE, (filepath, new_offset, current_size))
            conn.commit()
            continue

        seen_ids: set[str] = set()
        candidates = []
        for m in messages:
            mid = m["message_id"]
            if mid in seen_ids:
                continue
            seen_ids.add(mid)
            if not m.get("content", "").strip() and not m.get("attachment_count", 0):
                continue
            candidates.append(m)

        if candidates:
            batch_ids = [m["message_id"] for m in candidates]
            existing_ids = set(
                row[0] for row in conn.execute(
                    f"SELECT message_id FROM messages WHERE message_id IN ({','.join('?' * len(batch_ids))})",
                    batch_ids
                ).fetchall()
            )
            new_messages = [m for m in candidates if m["message_id"] not in existing_ids]
        else:
            new_messages = []

        if not new_messages:
            conn.execute(_UPSERT_STATE, (filepath, new_offset, current_size))
            conn.commit()
            continue

        activity.logger.info("%s: %d new messages", os.path.basename(filepath), len(new_messages))

        for i in range(0, len(new_messages), BATCH_SIZE):
            batch = new_messages[i:i + BATCH_SIZE]
            texts = [m["content"] for m in batch]

            try:
                embeddings = local_embed_texts(texts)
            except Exception as e:
                activity.logger.error("ERROR embedding batch locally: %s", e)
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

        conn.execute(_UPSERT_STATE, (filepath, new_offset, current_size))
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
