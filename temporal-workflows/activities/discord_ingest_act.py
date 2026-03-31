"""
Discord → Graphiti incremental ingestion activity.

Fetches recent messages from the Discord channel and ingests new user-week
episodes into the Graphiti knowledge graph. Handles OpenAI rate limits with
backoff between episodes.
"""
import asyncio
import json
import logging
import os
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta

import requests

from temporalio import activity

logger = logging.getLogger(__name__)

CHANNEL_ID = "1485343472952148008"
GROUP_ID = "discord_history"
DISCORD_API_BASE = "https://discord.com/api/v10"
DEFAULT_DAYS = 7


def _get_discord_token() -> str:
    env_file = "/home/clungus/.claude/channels/discord/.env"
    env_vars: dict[str, str] = {}
    if os.path.exists(env_file):
        for line in open(env_file):
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env_vars[k.strip()] = v.strip()
    token = os.environ.get("DISCORD_BOT_TOKEN") or env_vars.get("DISCORD_BOT_TOKEN", "")
    if not token:
        raise RuntimeError("DISCORD_BOT_TOKEN not available")
    return token


def _get_openai_key() -> str:
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        return key
    env_paths = [
        "/mnt/data/temporal-workflows/.env",
        "/mnt/data/.env",
        os.path.expanduser("~/.claude/channels/discord/.env"),
    ]
    for path in env_paths:
        try:
            with open(path) as f:
                for line in f:
                    if line.startswith("OPENAI_API_KEY="):
                        return line.split("=", 1)[1].strip()
        except FileNotFoundError:
            continue
    raise RuntimeError("OPENAI_API_KEY not found in environment or any .env file")


def _fetch_messages_page(headers: dict, before: str | None = None, limit: int = 100) -> list:
    url = f"{DISCORD_API_BASE}/channels/{CHANNEL_ID}/messages"
    params: dict = {"limit": limit}
    if before:
        params["before"] = before

    max_retries = 5
    for attempt in range(max_retries):
        resp = requests.get(url, headers=headers, params=params)
        if resp.status_code == 429:
            retry_after = resp.json().get("retry_after", 5)
            logger.warning("Rate limited, sleeping %ss (attempt %d/%d)", retry_after, attempt + 1, max_retries)
            time.sleep(retry_after + 0.5)
            continue
        if resp.status_code != 200:
            logger.error("Discord API error %s: %s", resp.status_code, resp.text)
            resp.raise_for_status()
        return resp.json()
    raise RuntimeError(f"Discord API rate-limited after {max_retries} retries for channel {CHANNEL_ID}")


def _fetch_recent_messages(token: str, cutoff: datetime) -> list:
    headers = {"Authorization": f"Bot {token}", "User-Agent": "BigClungusBot/1.0"}
    logger.info("Fetching messages since %s", cutoff.isoformat())
    all_messages = []
    before = None
    page_count = 0

    while True:
        messages = _fetch_messages_page(headers, before=before)
        if not messages:
            break

        page_count += 1
        stop = False
        for msg in messages:
            ts = datetime.fromisoformat(msg["timestamp"].replace("Z", "+00:00"))
            if ts < cutoff:
                stop = True
                break
            if msg.get("content") or msg.get("embeds") or msg.get("attachments"):
                all_messages.append(msg)

        if stop:
            break

        before = messages[-1]["id"]
        oldest_ts = datetime.fromisoformat(messages[-1]["timestamp"].replace("Z", "+00:00"))
        logger.info("Page %d: %d msgs, oldest %s, total %d", page_count, len(messages), oldest_ts.isoformat(), len(all_messages))
        time.sleep(0.3)

    logger.info("Fetched %d messages across %d pages", len(all_messages), page_count)
    return all_messages


def _group_by_user_week(messages: list) -> dict:
    groups: dict = defaultdict(list)
    for msg in messages:
        author = msg.get("author", {})
        username = author.get("global_name") or author.get("username", "unknown")
        user_id = author.get("id", "unknown")
        ts = datetime.fromisoformat(msg["timestamp"].replace("Z", "+00:00"))
        week_key = ts.strftime("%Y-W%W")
        key = (user_id, username, week_key)
        groups[key].append(msg)
    return groups


def _build_episode_body(username: str, messages: list) -> str:
    lines = []
    for msg in sorted(messages, key=lambda m: m["timestamp"]):
        ts = datetime.fromisoformat(msg["timestamp"].replace("Z", "+00:00"))
        content = msg.get("content", "")
        if not content and msg.get("embeds"):
            content = f'[embed: {msg["embeds"][0].get("title","") or msg["embeds"][0].get("description","")[:100]}]'
        if not content and msg.get("attachments"):
            content = f'[attachment: {msg["attachments"][0].get("filename","file")}]'
        if content:
            lines.append(f'[{ts.strftime("%Y-%m-%d %H:%M")}] {username}: {content}')
    return "\n".join(lines)


def _extract_entities(messages: list) -> list:
    """Extract fine-grained entities via Claude Haiku. Returns [] on any failure."""
    try:
        import anthropic as _anthropic_module
    except ImportError:
        logger.warning("anthropic package not available; skipping entity extraction")
        return []

    msg_text = "\n".join(
        f"{(m.get('author', {}).get('global_name') or m.get('author', {}).get('username', 'unknown'))}: {m['content']}"
        for m in messages
        if m.get("content") and not m["content"].startswith("[")
    )

    if not msg_text.strip():
        return []

    if len(msg_text) > 8000:
        msg_text = msg_text[:8000] + "\n[truncated]"

    client = _anthropic_module.Anthropic()

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1000,
            system=(
                "Extract structured facts from this Discord conversation. "
                "Return a JSON array of objects with fields: {user, type, fact} "
                "where type is one of: preference, project_status, opinion, intent. "
                "preference = tools/approaches they like or dislike. "
                "project_status = things they say are in progress, done, or broken. "
                "opinion = views on tools, approaches, or choices. "
                "intent = things they want to do or plan to do. "
                "Only include clear, specific statements — skip vague or conversational filler. "
                "Return [] if nothing notable. Return only valid JSON, no prose."
            ),
            messages=[{"role": "user", "content": msg_text}],
        )
        raw = response.content[0].text.strip()
        entities = json.loads(raw)
        if not isinstance(entities, list):
            logger.warning("Entity extraction returned non-list: %s", type(entities))
            return []
        return entities
    except json.JSONDecodeError as e:
        logger.warning("Entity extraction JSON parse error: %s", e)
        return []
    except Exception as e:
        logger.warning("Entity extraction failed: %s", e)
        return []


async def _ingest_into_graphiti(groups: dict, openai_api_key: str) -> int:
    from dotenv import load_dotenv
    load_dotenv("/mnt/data/graphiti/repo/mcp_server/.env")

    from graphiti_core import Graphiti
    from graphiti_core.nodes import EpisodeType
    from graphiti_core.llm_client.openai_client import OpenAIClient
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
    from graphiti_core.driver.falkordb_driver import FalkorDriver

    driver = FalkorDriver(host="localhost", port=6379)
    llm = OpenAIClient(config=LLMConfig(api_key=openai_api_key, model="gpt-4o-mini"))
    embedder = OpenAIEmbedder(config=OpenAIEmbedderConfig(api_key=openai_api_key))

    graphiti = Graphiti(graph_driver=driver, llm_client=llm, embedder=embedder)
    await graphiti.build_indices_and_constraints()

    ingested = 0
    total = len(groups)
    logger.info("Ingesting %d user-week groups...", total)

    for i, ((user_id, username, week_key), messages) in enumerate(groups.items(), 1):
        activity.heartbeat(f"ingested {ingested} episodes, processing {i}/{total}: {username} {week_key}")
        episode_name = f"Discord {week_key} - {username}"
        episode_body = _build_episode_body(username, messages)

        if not episode_body.strip():
            logger.info("[%d/%d] Skipping empty: %s", i, total, episode_name)
            continue

        first_ts = datetime.fromisoformat(messages[0]["timestamp"].replace("Z", "+00:00"))

        full_body = (
            f'User profile data for Discord user "{username}" (ID: {user_id}) '
            f"during week {week_key}. "
            f"The following are their Discord messages. "
            f"Extract personality traits, interests, tone, recurring topics, and communication style.\n\n"
            f"{episode_body}"
        )

        if len(full_body) > 12000:
            logger.warning("[%d/%d] Truncating oversized episode %s (%d chars → 12000)", i, total, episode_name, len(full_body))
            full_body = full_body[:12000] + "\n[truncated]"

        try:
            await graphiti.add_episode(
                name=episode_name,
                episode_body=full_body,
                group_id=GROUP_ID,
                source=EpisodeType.text,
                source_description=f"Discord channel {CHANNEL_ID} messages",
                reference_time=first_ts,
            )
            ingested += 1
            logger.info("[%d/%d] Ingested: %s (%d msgs)", i, total, episode_name, len(messages))
        except Exception as e:
            logger.error("[%d/%d] Failed %s: %s", i, total, episode_name, e)

        # Entity extraction pass
        try:
            entities = _extract_entities(messages)
            if entities:
                entity_episode_name = f"entities:{username}:{week_key}"
                entity_body = "\n".join(
                    f'Discord user "{e.get("user","unknown")}" — {e.get("type","unknown")}: {e.get("fact","")}'
                    for e in entities
                    if e.get("fact") and e.get("user")
                )
                if entity_body:
                    await graphiti.add_episode(
                        name=entity_episode_name,
                        episode_body=entity_body,
                        group_id=GROUP_ID,
                        source=EpisodeType.text,
                        source_description=f"Entity extraction from Discord channel {CHANNEL_ID}",
                        reference_time=first_ts,
                    )
                    logger.info("[%d/%d] Entity extraction: %d entities for %s", i, total, len(entities), username)
        except Exception as e:
            logger.warning("[%d/%d] Entity extraction pass failed for %s: %s", i, total, username, e)

        await asyncio.sleep(3)

    await graphiti.close()
    return ingested


@activity.defn
async def run_discord_ingest(days: int = DEFAULT_DAYS) -> str:
    """Fetch recent Discord messages and ingest new episodes into Graphiti."""
    token = _get_discord_token()
    openai_api_key = _get_openai_key()

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    logger.info("=== Discord Ingest: last %d days (cutoff %s) ===", days, cutoff.isoformat())

    messages = _fetch_recent_messages(token, cutoff)
    if not messages:
        logger.info("No messages found in window. Nothing to ingest.")
        return "No new messages to ingest."

    groups = _group_by_user_week(messages)
    logger.info("Grouped into %d user-week segments", len(groups))

    ingested = await _ingest_into_graphiti(groups, openai_api_key)
    summary = f"Discord ingest complete. Ingested {ingested}/{len(groups)} episodes from {len(messages)} messages (last {days} days)."
    logger.info(summary)
    return summary
