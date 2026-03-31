#!/usr/bin/env python3
"""
Discord history ingest: incrementally reads Claude session JSONL files,
extracts Discord messages, embeds them with OpenAI, stores in sqlite-vec.

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
import tempfile
import urllib.request
from datetime import datetime

import sqlite_vec
from openai import OpenAI

from common import DB_PATH, EMBED_MODEL, EMBED_DIMS, get_openai_key

JSONL_GLOB = "/home/clungus/.claude/projects/*/*.jsonl"
BATCH_SIZE = 100

IMAGE_MIMES = {"image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"}
VISION_MODEL = "gpt-4o-mini"
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB limit for vision API

_UPSERT_STATE = (
    "INSERT INTO ingest_state (filepath, byte_offset, last_size) VALUES (?, ?, ?) "
    "ON CONFLICT(filepath) DO UPDATE SET byte_offset=excluded.byte_offset, last_size=excluded.last_size"
)


def open_db() -> sqlite3.Connection:
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

        CREATE TABLE IF NOT EXISTS ingest_state (
            filepath TEXT PRIMARY KEY,
            byte_offset INTEGER,
            last_size INTEGER
        );
    """)
    conn.commit()
    return conn


# ---- Parsers ----------------------------------------------------------------

_CHANNEL_RE = re.compile(
    r'<channel\s+source="plugin:discord[^"]*"\s+'
    r'chat_id="([^"]+)"\s+'
    r'message_id="([^"]+)"\s+'
    r'user="([^"]+)"[^>]*?ts="([^"]+)"[^>]*?>(.*?)</channel>',
    re.DOTALL,
)

# Omni gateway format: source="omni" with JSON body
_OMNI_CHANNEL_RE = re.compile(
    r'<channel\s+source="omni"[^>]*received_at="([^"]+)"[^>]*>(.*?)</channel>',
    re.DOTALL,
)

# Separate regex to extract attachment metadata from the opening tag
_ATTACH_COUNT_RE = re.compile(r'attachment_count="(\d+)"')
_ATTACH_META_RE = re.compile(r'attachments="([^"]*)"')

_FETCH_LINE_RE = re.compile(
    r'^\[([^\]]+)\]\s+([^:]+):\s+(.*?)\s+\(id:\s+(\d+)\)\s*$'
)


def extract_from_channel_tag(text: str) -> list[dict]:
    """Extract Discord messages from <channel ...> XML tags in user messages."""
    messages = []
    for m in _CHANNEL_RE.finditer(text):
        chat_id, message_id, user, ts, body = m.groups()
        content = body.strip()
        # Strip out <thread_context> blocks
        content = re.sub(r'<thread_context>.*?</thread_context>', '', content, flags=re.DOTALL).strip()

        # Extract attachment metadata from the full match (opening tag)
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
            # Attachment-only message (no text or just a mention)
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
    """Extract Discord messages from omni-format <channel source="omni"> tags."""
    messages = []
    for m in _OMNI_CHANNEL_RE.finditer(text):
        received_at, body = m.groups()
        body = body.strip()
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            continue
        # Skip bot messages
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
    """Extract Discord messages from fetch_messages tool results."""
    messages = []
    for line in text.splitlines():
        line = line.strip()
        m = _FETCH_LINE_RE.match(line)
        if m:
            ts_str, author, content, msg_id = m.groups()
            # Normalize author: 'me' means the bot
            if author.strip() == "me":
                author = "BigClungus"
            messages.append({
                "message_id": msg_id,
                "author": author.strip(),
                "channel_id": "",  # fetch results don't carry channel_id inline
                "ts": ts_str,
                "content": content.strip(),
            })
    return messages


def extract_messages_from_jsonl(filepath: str, start_offset: int) -> tuple[list[dict], int]:
    """
    Read a JSONL file from start_offset, extract all Discord messages.
    Returns (messages, new_byte_offset).
    """
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

                # Case 1: user message with <channel> XML tag (inbound Discord messages)
                if isinstance(content, str) and "<channel source=" in content:
                    messages.extend(extract_from_channel_tag(content))
                    messages.extend(extract_from_omni_channel_tag(content))

                elif isinstance(content, list):
                    for item in content:
                        if not isinstance(item, dict):
                            continue

                        # Case 2: user message content block with <channel> XML
                        item_text = item.get("text", "") or item.get("content", "")
                        if isinstance(item_text, str) and "<channel source=" in item_text:
                            messages.extend(extract_from_channel_tag(item_text))
                            messages.extend(extract_from_omni_channel_tag(item_text))

                        # Case 3: tool_result from fetch_messages
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
        print(f"  WARNING: could not read {filepath}: {e}", file=sys.stderr)

    return messages, new_offset


# ---- Attachment description --------------------------------------------------

def _get_discord_token() -> str:
    """Load Discord bot token from .env file."""
    env_path = os.path.expanduser("~/.claude/channels/discord/.env")
    try:
        with open(env_path) as f:
            for line in f:
                if line.startswith("DISCORD_BOT_TOKEN="):
                    return line.split("=", 1)[1].strip()
    except FileNotFoundError:
        pass
    raise RuntimeError(f"DISCORD_BOT_TOKEN not found in {env_path}")


def _parse_attachment_meta(meta: str) -> list[dict]:
    """Parse attachment metadata string like 'image.png (image/png, 23KB)' into structured list.

    Handles multiple attachments separated by '; ' (Discord plugin format).
    """
    attachments = []
    if not meta:
        return attachments
    # Split on '; ' for multi-attachment messages
    for part in meta.split("; "):
        part = part.strip()
        # Format: filename (mime/type, sizeKB)
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
    """Fetch actual attachment URLs from Discord API for a message."""
    url = f"https://discord.com/api/v10/channels/{channel_id}/messages/{message_id}"
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
        print(f"  WARNING: failed to fetch message {message_id}: {e}", file=sys.stderr)
        return []


def _download_image(url: str) -> bytes | None:
    """Download an image from a URL, return raw bytes or None on failure."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DiscordBot (https://clung.us, 1.0)"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
            if len(data) > MAX_IMAGE_SIZE:
                return None
            return data
    except Exception as e:
        print(f"  WARNING: failed to download image: {e}", file=sys.stderr)
        return None


def _describe_image(client: OpenAI, image_bytes: bytes, content_type: str, filename: str) -> str:
    """Use gpt-4o-mini vision to describe an image."""
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
        print(f"  WARNING: vision describe failed for {filename}: {e}", file=sys.stderr)
        return f"Image: {filename}"


def describe_attachments(client: OpenAI, msg: dict, discord_token: str) -> str:
    """Given a message dict with attachment info, produce a text description of its attachments.

    Returns the enhanced content string (original text + attachment descriptions).
    """
    original_content = msg.get("content", "").strip()
    # Remove the bare "(attachment)" placeholder
    if original_content == "(attachment)":
        original_content = ""

    attachment_meta = msg.get("attachment_meta", "")
    parsed = _parse_attachment_meta(attachment_meta)

    if not parsed:
        return original_content or "(attachment)"

    # Fetch actual URLs from Discord API
    channel_id = msg.get("channel_id", "")
    message_id = msg.get("message_id", "")
    api_attachments = []
    if channel_id and message_id:
        api_attachments = _fetch_attachment_urls(channel_id, message_id, discord_token)

    # Build URL map by filename
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
            # Non-image attachment
            descriptions.append(f"[Attachment: {filename} ({content_type})]")

    parts = []
    if original_content:
        parts.append(original_content)
    parts.extend(descriptions)
    return " ".join(parts)


# ---- Embeddings -------------------------------------------------------------

def embed_batch(client: OpenAI, texts: list[str]) -> list[list[float]]:
    response = client.embeddings.create(
        model=EMBED_MODEL,
        input=texts,
    )
    return [item.embedding for item in response.data]


# ---- Main ingest loop -------------------------------------------------------

def run_ingest():
    api_key = get_openai_key()
    client = OpenAI(api_key=api_key)
    conn = open_db()

    # Load Discord token for attachment downloads (non-fatal if missing)
    discord_token = None
    try:
        discord_token = _get_discord_token()
    except RuntimeError as e:
        print(f"  WARNING: {e} - attachment descriptions disabled", file=sys.stderr)

    jsonl_files = sorted(glob.glob(JSONL_GLOB))
    print(f"Found {len(jsonl_files)} JSONL files")

    total_new = 0

    for filepath in jsonl_files:
        current_size = os.path.getsize(filepath)

        row = conn.execute(
            "SELECT byte_offset, last_size FROM ingest_state WHERE filepath = ?",
            (filepath,)
        ).fetchone()

        if row:
            stored_offset, stored_size = row
            if current_size == stored_size:
                # No change
                continue
            start_offset = stored_offset
        else:
            start_offset = 0

        messages, new_offset = extract_messages_from_jsonl(filepath, start_offset)

        if not messages:
            # Update state even if no messages found (file grew but had no Discord content)
            conn.execute(
                _UPSERT_STATE,
                (filepath, new_offset, current_size)
            )
            conn.commit()
            continue

        seen_ids: set[str] = set()
        candidates = []
        for m in messages:
            mid = m["message_id"]
            if mid in seen_ids:
                continue
            seen_ids.add(mid)
            # Keep messages with attachments even if text content is empty
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
            conn.execute(
                _UPSERT_STATE,
                (filepath, new_offset, current_size)
            )
            conn.commit()
            continue

        print(f"  {os.path.basename(filepath)}: {len(new_messages)} new messages")

        for i in range(0, len(new_messages), BATCH_SIZE):
            batch = new_messages[i:i + BATCH_SIZE]
            # Enhance attachment messages with descriptions before embedding
            texts = []
            for m in batch:
                if m.get("attachment_count", 0) > 0 and discord_token:
                    enhanced = describe_attachments(client, m, discord_token)
                    m["content"] = enhanced  # update content for DB storage too
                    texts.append(enhanced)
                else:
                    texts.append(m["content"])
            try:
                embeddings = embed_batch(client, texts)
            except Exception as e:
                print(f"  ERROR embedding batch: {e}", file=sys.stderr)
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
                        "INSERT OR IGNORE INTO messages_vec (rowid, embedding) VALUES (?, ?)",
                        (row[0], emb_bytes)
                    )

            conn.commit()
            total_new += len(batch)

        conn.execute(_UPSERT_STATE, (filepath, new_offset, current_size))
        conn.commit()

    total_messages = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    conn.close()
    print(f"Ingest complete. New messages this run: {total_new}. Total in DB: {total_messages}.")


if __name__ == "__main__":
    run_ingest()
