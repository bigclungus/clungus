#!/usr/bin/env python3
"""
Re-embed existing attachment-only messages in the Discord history DB.

Finds messages with content like '(attachment)' or very short content that
likely had attachments, fetches the actual images from Discord, describes
them with gpt-4o-mini vision, and updates the content + re-embeds.
"""

import json
import os
import re
import sys
import sqlite3
import base64
import urllib.request

import sqlite_vec
from openai import OpenAI

# Reuse shared code
sys.path.insert(0, os.path.dirname(__file__))
from common import DB_PATH, EMBED_MODEL, EMBED_DIMS, get_openai_key

IMAGE_MIMES = {"image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"}
VISION_MODEL = "gpt-4o-mini"
MAX_IMAGE_SIZE = 5 * 1024 * 1024


def get_discord_token() -> str:
    env_path = os.path.expanduser("~/.claude/channels/discord/.env")
    with open(env_path) as f:
        for line in f:
            if line.startswith("DISCORD_BOT_TOKEN="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("DISCORD_BOT_TOKEN not found")


def fetch_message(channel_id: str, message_id: str, token: str) -> dict | None:
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
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"  WARNING: failed to fetch message {message_id}: {e}", file=sys.stderr)
        return None


def download_image(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DiscordBot (https://clung.us, 1.0)"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
            if len(data) > MAX_IMAGE_SIZE:
                return None
            return data
    except Exception as e:
        print(f"  WARNING: failed to download: {e}", file=sys.stderr)
        return None


def describe_image(client: OpenAI, image_bytes: bytes, content_type: str, filename: str) -> str:
    b64 = base64.b64encode(image_bytes).decode("ascii")
    media_type = content_type if content_type in IMAGE_MIMES else "image/png"
    try:
        resp = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe this Discord image attachment in one concise sentence. Focus on the key visual content -- what is shown, any text visible, the subject matter. Be specific and factual."},
                    {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}", "detail": "low"}},
                ],
            }],
            max_tokens=150,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        print(f"  WARNING: vision failed for {filename}: {e}", file=sys.stderr)
        return f"Image: {filename}"


def embed_text(client: OpenAI, text: str) -> list[float]:
    resp = client.embeddings.create(model=EMBED_MODEL, input=[text])
    return resp.data[0].embedding


def main():
    api_key = get_openai_key()
    client = OpenAI(api_key=api_key)
    token = get_discord_token()

    conn = sqlite3.connect(DB_PATH)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)

    # Find messages that are likely attachment-only:
    # - content is exactly '(attachment)' or starts with '(attachment)'
    # - content is just a mention like '<@123>' with nothing else meaningful
    rows = conn.execute("""
        SELECT id, message_id, author, channel_id, content
        FROM messages
        WHERE content LIKE '%%(attachment)%%'
           OR (content LIKE '<@%%>' AND length(content) < 30)
    """).fetchall()

    print(f"Found {len(rows)} candidate messages to re-embed")

    updated = 0
    failed = 0

    for row_id, message_id, author, channel_id, old_content in rows:
        # Need channel_id to fetch from Discord API
        if not channel_id:
            # Try to find channel from the main channels we know about
            # Default to main channel
            channel_id = "1485343472952148008"

        msg_data = fetch_message(channel_id, message_id, token)
        if not msg_data:
            # Try the other known channel
            if channel_id == "1485343472952148008":
                msg_data = fetch_message("1485369870165217535", message_id, token)
            if not msg_data:
                print(f"  SKIP {message_id}: could not fetch from Discord API")
                failed += 1
                continue

        attachments = msg_data.get("attachments", [])
        if not attachments:
            print(f"  SKIP {message_id}: no attachments in API response")
            failed += 1
            continue

        # Get the actual text content from Discord (not our '(attachment)' placeholder)
        discord_text = msg_data.get("content", "").strip()

        descriptions = []
        for att in attachments:
            ct = att.get("content_type", "")
            filename = att.get("filename", "unknown")
            url = att.get("url", "")

            if any(ct.startswith(mime.split("/")[0] + "/") for mime in IMAGE_MIMES) and url:
                # It's an image - download and describe
                image_bytes = download_image(url)
                if image_bytes:
                    desc = describe_image(client, image_bytes, ct, filename)
                    descriptions.append(f"[Image: {desc}]")
                else:
                    descriptions.append(f"[Image attachment: {filename}]")
            else:
                descriptions.append(f"[Attachment: {filename} ({ct or 'unknown'})]")

        # Build new content
        parts = []
        if discord_text:
            parts.append(discord_text)
        parts.extend(descriptions)
        new_content = " ".join(parts)

        if not new_content or new_content == old_content:
            print(f"  SKIP {message_id}: no improvement")
            continue

        # Update content in DB
        conn.execute("UPDATE messages SET content = ? WHERE id = ?", (new_content, row_id))

        # Re-embed
        emb = embed_text(client, new_content)
        emb_bytes = sqlite_vec.serialize_float32(emb)
        # Delete old vec entry and insert new one
        conn.execute("DELETE FROM messages_vec WHERE rowid = ?", (row_id,))
        conn.execute("INSERT INTO messages_vec (rowid, embedding) VALUES (?, ?)", (row_id, emb_bytes))
        conn.commit()

        updated += 1
        print(f"  OK {message_id} ({author}): {old_content!r} -> {new_content[:100]!r}")

    conn.close()
    print(f"\nDone. Updated: {updated}, Failed/skipped: {failed}, Total candidates: {len(rows)}")


if __name__ == "__main__":
    main()
