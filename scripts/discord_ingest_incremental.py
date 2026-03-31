#!/usr/bin/env python3
"""
Incremental Discord → Graphiti ingestion.
Fetches recent messages (last N days) from the Discord channel and ingests
new user-week episodes into the Graphiti knowledge graph.

Run from /mnt/data/graphiti/repo/mcp_server with:
  uv run python /mnt/data/scripts/discord_ingest_incremental.py [--days 7]
Or directly (if graphiti deps are on the path):
  python3 /mnt/data/scripts/discord_ingest_incremental.py
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

try:
    import anthropic as _anthropic_module
    _ANTHROPIC_AVAILABLE = True
except ImportError:
    _ANTHROPIC_AVAILABLE = False

MCP_SERVER_DIR = Path('/home/clungus/work/graphiti/repo/mcp_server')
sys.path.insert(0, str(MCP_SERVER_DIR / 'src'))

from dotenv import load_dotenv
load_dotenv(MCP_SERVER_DIR / '.env')

from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType
from graphiti_core.llm_client.openai_client import OpenAIClient
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
from graphiti_core.driver.falkordb_driver import FalkorDriver

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger(__name__)

# Read bot token from env file
_env_file = '/home/clungus/.claude/channels/discord/.env'
_env_vars = {}
if os.path.exists(_env_file):
    for line in open(_env_file):
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            _env_vars[k.strip()] = v.strip()

DISCORD_BOT_TOKEN = os.environ.get('DISCORD_BOT_TOKEN') or _env_vars.get('DISCORD_BOT_TOKEN', '')
CHANNEL_ID = '1485343472952148008'
GROUP_ID = 'discord_history'
DISCORD_API_BASE = 'https://discord.com/api/v10'
HEADERS = {'Authorization': f'Bot {DISCORD_BOT_TOKEN}', 'User-Agent': 'BigClungusBot/1.0'}


def parse_args():
    p = argparse.ArgumentParser(description='Incremental Discord → Graphiti ingestion')
    p.add_argument('--days', type=int, default=7, help='How many days back to fetch (default: 7)')
    p.add_argument('--no-entity-extraction', action='store_true', help='Skip fine-grained entity extraction pass')
    return p.parse_args()


def fetch_messages_page(channel_id: str, before: str = None, limit: int = 100) -> list:
    url = f'{DISCORD_API_BASE}/channels/{channel_id}/messages'
    params = {'limit': limit}
    if before:
        params['before'] = before

    resp = requests.get(url, headers=HEADERS, params=params)
    if resp.status_code == 429:
        retry_after = resp.json().get('retry_after', 5)
        logger.warning(f'Rate limited, sleeping {retry_after}s')
        time.sleep(retry_after + 0.5)
        return fetch_messages_page(channel_id, before, limit)
    if resp.status_code != 200:
        logger.error(f'Discord API error {resp.status_code}: {resp.text}')
        resp.raise_for_status()
    return resp.json()


def fetch_recent_messages(channel_id: str, cutoff: datetime) -> list:
    logger.info(f'Fetching messages since {cutoff.isoformat()}')
    all_messages = []
    before = None
    page_count = 0

    while True:
        messages = fetch_messages_page(channel_id, before=before)
        if not messages:
            break

        page_count += 1
        stop = False
        for msg in messages:
            ts = datetime.fromisoformat(msg['timestamp'].replace('Z', '+00:00'))
            if ts < cutoff:
                stop = True
                break
            if msg.get('content') or msg.get('embeds') or msg.get('attachments'):
                all_messages.append(msg)

        if stop:
            break

        before = messages[-1]['id']
        oldest_ts = datetime.fromisoformat(messages[-1]['timestamp'].replace('Z', '+00:00'))
        logger.info(f'Page {page_count}: {len(messages)} msgs, oldest {oldest_ts.isoformat()}, total {len(all_messages)}')
        time.sleep(0.3)

    logger.info(f'Fetched {len(all_messages)} messages across {page_count} pages')
    return all_messages


def group_messages_by_user_week(messages: list) -> dict:
    groups = defaultdict(list)
    for msg in messages:
        author = msg.get('author', {})
        username = author.get('global_name') or author.get('username', 'unknown')
        user_id = author.get('id', 'unknown')
        ts = datetime.fromisoformat(msg['timestamp'].replace('Z', '+00:00'))
        week_key = ts.strftime('%Y-W%W')
        key = (user_id, username, week_key)
        groups[key].append(msg)
    return groups


def build_episode_body(username: str, messages: list) -> str:
    lines = []
    for msg in sorted(messages, key=lambda m: m['timestamp']):
        ts = datetime.fromisoformat(msg['timestamp'].replace('Z', '+00:00'))
        content = msg.get('content', '')
        if not content and msg.get('embeds'):
            content = f'[embed: {msg["embeds"][0].get("title","") or msg["embeds"][0].get("description","")[:100]}]'
        if not content and msg.get('attachments'):
            content = f'[attachment: {msg["attachments"][0].get("filename","file")}]'
        if content:
            lines.append(f'[{ts.strftime("%Y-%m-%d %H:%M")}] {username}: {content}')
    return '\n'.join(lines)


def extract_entities(messages: list) -> list:
    """Extract fine-grained entities from a batch of messages using Claude Haiku.

    Returns a list of dicts with fields: user, type, fact
    where type is one of: preference, project_status, opinion, intent

    Returns [] on any failure — this is a best-effort pass.
    """
    if not _ANTHROPIC_AVAILABLE:
        logger.warning('anthropic package not available; skipping entity extraction')
        return []

    msg_text = '\n'.join(
        f"{(m.get('author', {}).get('global_name') or m.get('author', {}).get('username', 'unknown'))}: {m['content']}"
        for m in messages
        if m.get('content') and not m['content'].startswith('[')
    )

    if not msg_text.strip():
        return []

    # Truncate to avoid blowing context budget on huge batches
    if len(msg_text) > 8000:
        msg_text = msg_text[:8000] + '\n[truncated]'

    client = _anthropic_module.Anthropic()

    try:
        response = client.messages.create(
            model='claude-haiku-4-5-20251001',
            max_tokens=1000,
            system=(
                'Extract structured facts from this Discord conversation. '
                'Return a JSON array of objects with fields: {user, type, fact} '
                'where type is one of: preference, project_status, opinion, intent. '
                'preference = tools/approaches they like or dislike. '
                'project_status = things they say are in progress, done, or broken. '
                'opinion = views on tools, approaches, or choices. '
                'intent = things they want to do or plan to do. '
                'Only include clear, specific statements — skip vague or conversational filler. '
                'Return [] if nothing notable. Return only valid JSON, no prose.'
            ),
            messages=[{'role': 'user', 'content': msg_text}],
        )
        raw = response.content[0].text.strip()
        entities = json.loads(raw)
        if not isinstance(entities, list):
            logger.warning(f'Entity extraction returned non-list: {type(entities)}')
            return []
        return entities
    except json.JSONDecodeError as e:
        logger.warning(f'Entity extraction JSON parse error: {e}')
        return []
    except Exception as e:
        logger.warning(f'Entity extraction failed: {e}')
        return []


async def add_entities_to_graphiti(graphiti, entities: list, reference_time: datetime, group_id: str) -> int:
    """Add extracted entities as structured Graphiti memories. Returns count added."""
    added = 0
    for entity in entities:
        user = entity.get('user', 'unknown')
        etype = entity.get('type', 'unknown')
        fact = entity.get('fact', '').strip()

        if not fact or not user:
            continue

        episode_name = f'entity:{etype}:{user}:{reference_time.strftime("%Y-%m-%dT%H:%M")}'
        episode_body = (
            f'Discord user "{user}" — {etype}: {fact}'
        )

        try:
            await graphiti.add_episode(
                name=episode_name,
                episode_body=episode_body,
                group_id=group_id,
                source=EpisodeType.text,
                source_description=f'Entity extraction from Discord channel {CHANNEL_ID}',
                reference_time=reference_time,
            )
            added += 1
        except Exception as e:
            logger.warning(f'Failed to add entity episode "{episode_name}": {e}')

    return added


async def ingest_into_graphiti(groups: dict, run_entity_extraction: bool = True) -> int:
    openai_api_key = os.environ.get('OPENAI_API_KEY')
    if not openai_api_key:
        raise RuntimeError('OPENAI_API_KEY not set — cannot ingest into Graphiti')

    logger.info('Connecting to Graphiti / FalkorDB...')
    driver = FalkorDriver(host='localhost', port=6379)
    llm = OpenAIClient(config=LLMConfig(api_key=openai_api_key, model='gpt-4o-mini'))
    embedder = OpenAIEmbedder(config=OpenAIEmbedderConfig(api_key=openai_api_key))

    graphiti = Graphiti(graph_driver=driver, llm_client=llm, embedder=embedder)
    await graphiti.build_indices_and_constraints()

    ingested = 0
    total = len(groups)
    logger.info(f'Ingesting {total} user-week groups...')

    for i, ((user_id, username, week_key), messages) in enumerate(groups.items(), 1):
        episode_name = f'Discord {week_key} - {username}'
        episode_body = build_episode_body(username, messages)

        if not episode_body.strip():
            logger.info(f'[{i}/{total}] Skipping empty: {episode_name}')
            continue

        first_ts = datetime.fromisoformat(messages[0]['timestamp'].replace('Z', '+00:00'))

        full_body = (
            f'User profile data for Discord user "{username}" (ID: {user_id}) '
            f'during week {week_key}. '
            f'The following are their Discord messages. '
            f'Extract personality traits, interests, tone, recurring topics, and communication style.\n\n'
            f'{episode_body}'
        )

        # Truncate if the body is very long (>12000 chars) to avoid context window errors
        if len(full_body) > 12000:
            logger.warning(f'[{i}/{total}] Truncating oversized episode {episode_name} ({len(full_body)} chars → 12000)')
            full_body = full_body[:12000] + '\n[truncated]'

        try:
            await graphiti.add_episode(
                name=episode_name,
                episode_body=full_body,
                group_id=GROUP_ID,
                source=EpisodeType.text,
                source_description=f'Discord channel {CHANNEL_ID} messages',
                reference_time=first_ts,
            )
            ingested += 1
            logger.info(f'[{i}/{total}] Ingested: {episode_name} ({len(messages)} msgs)')
        except Exception as e:
            logger.error(f'[{i}/{total}] Failed {episode_name}: {e}')
            # Don't abort the whole run for one bad episode

        # Second pass: fine-grained entity extraction for this user-week batch
        if run_entity_extraction:
            try:
                entities = extract_entities(messages)
                if entities:
                    added = await add_entities_to_graphiti(graphiti, entities, first_ts, GROUP_ID)
                    logger.info(f'[{i}/{total}] Entity extraction: {len(entities)} found, {added} added for {username}')
                else:
                    logger.debug(f'[{i}/{total}] Entity extraction: nothing notable for {username}')
            except Exception as e:
                logger.warning(f'[{i}/{total}] Entity extraction pass failed for {username}: {e}')
                # Never let entity extraction break the main ingestion run

        if i % 5 == 0:
            await asyncio.sleep(1)

    await graphiti.close()
    return ingested


async def main():
    args = parse_args()
    cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)

    logger.info(f'=== Incremental Discord Ingestion: last {args.days} days ===')
    logger.info(f'Channel: {CHANNEL_ID}')
    logger.info(f'Cutoff: {cutoff.isoformat()}')

    if not DISCORD_BOT_TOKEN:
        raise RuntimeError('DISCORD_BOT_TOKEN not available')

    messages = fetch_recent_messages(CHANNEL_ID, cutoff)

    if not messages:
        logger.info('No messages found in window. Nothing to ingest.')
        return

    groups = group_messages_by_user_week(messages)
    logger.info(f'Grouped into {len(groups)} user-week segments')

    run_entity_extraction = not args.no_entity_extraction
    if run_entity_extraction and not _ANTHROPIC_AVAILABLE:
        logger.warning('anthropic package not available; entity extraction will be skipped')
        run_entity_extraction = False

    ingested = await ingest_into_graphiti(groups, run_entity_extraction=run_entity_extraction)
    logger.info(f'=== Done! Ingested {ingested}/{len(groups)} episodes ===')
    logger.info(f'Total messages processed: {len(messages)}')


if __name__ == '__main__':
    asyncio.run(main())
