#!/usr/bin/env python3
"""
Discord message scraper and Graphiti ingestion script.
Fetches messages from a Discord channel and ingests them into Graphiti
knowledge graph as personality profile episodes per user per week.
"""

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

# Add graphiti mcp_server src to path
MCP_SERVER_DIR = Path('/home/clungus/work/graphiti/repo/mcp_server')
sys.path.insert(0, str(MCP_SERVER_DIR / 'src'))

# Load graphiti env
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

# Config
DISCORD_BOT_TOKEN = os.environ.get(
    'DISCORD_BOT_TOKEN',
    open('/home/clungus/.claude/channels/discord/.env').read().split('=', 1)[1].strip()
    if os.path.exists('/home/clungus/.claude/channels/discord/.env') else '',
)
CHANNEL_ID = '1383689218861039686'
OUTPUT_FILE = '/tmp/discord_messages.jsonl'
GROUP_ID = 'discord_history'
# 24 months back from 2026-03-23
CUTOFF_DATE = datetime(2024, 3, 23, tzinfo=timezone.utc)

DISCORD_API_BASE = 'https://discord.com/api/v10'
HEADERS = {'Authorization': f'Bot {DISCORD_BOT_TOKEN}'}


def fetch_messages_page(channel_id: str, before: str = None, limit: int = 100) -> list:
    """Fetch a page of messages from Discord."""
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
    elif resp.status_code != 200:
        logger.error(f'Discord API error {resp.status_code}: {resp.text}')
        resp.raise_for_status()

    return resp.json()


def fetch_all_messages(channel_id: str, cutoff: datetime, output_file: str) -> list:
    """Fetch all messages from channel up to cutoff date. Saves to JSONL."""
    logger.info(f'Fetching messages from channel {channel_id} back to {cutoff.isoformat()}')
    all_messages = []
    before = None
    page_count = 0

    with open(output_file, 'w') as f:
        while True:
            messages = fetch_messages_page(channel_id, before=before)
            if not messages:
                logger.info('No more messages.')
                break

            page_count += 1
            for msg in messages:
                ts = datetime.fromisoformat(msg['timestamp'].replace('Z', '+00:00'))
                if ts < cutoff:
                    logger.info(f'Reached cutoff date at message {msg["id"]} ({ts.isoformat()})')
                    logger.info(f'Total pages fetched: {page_count}, total messages: {len(all_messages)}')
                    return all_messages

                # Only keep non-bot messages with actual content
                if msg.get('content') or msg.get('embeds') or msg.get('attachments'):
                    all_messages.append(msg)
                    f.write(json.dumps(msg) + '\n')

            oldest = messages[-1]
            before = oldest['id']
            oldest_ts = datetime.fromisoformat(oldest['timestamp'].replace('Z', '+00:00'))
            logger.info(
                f'Page {page_count}: fetched {len(messages)} msgs, '
                f'oldest: {oldest_ts.isoformat()}, '
                f'total collected: {len(all_messages)}'
            )

            # Small sleep to avoid rate limits
            time.sleep(0.5)

    logger.info(f'Total pages fetched: {page_count}, total messages: {len(all_messages)}')
    return all_messages


def group_messages_by_user_week(messages: list) -> dict:
    """Group messages by (username, iso_week) for personality profiling."""
    groups = defaultdict(list)
    for msg in messages:
        author = msg.get('author', {})
        username = author.get('global_name') or author.get('username', 'unknown')
        user_id = author.get('id', 'unknown')
        ts = datetime.fromisoformat(msg['timestamp'].replace('Z', '+00:00'))
        # ISO week key: YYYY-Www
        week_key = ts.strftime('%Y-W%W')
        key = (user_id, username, week_key)
        groups[key].append(msg)
    return groups


def build_episode_body(username: str, messages: list) -> str:
    """Build a text episode body from a list of messages."""
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


async def ingest_into_graphiti(groups: dict) -> int:
    """Ingest grouped messages into Graphiti."""
    openai_api_key = os.environ.get('OPENAI_API_KEY')
    if not openai_api_key:
        logger.error('OPENAI_API_KEY not set')
        return 0

    logger.info('Connecting to Graphiti / FalkorDB...')
    driver = FalkorDriver(host='localhost', port=6379)
    llm = OpenAIClient(config=LLMConfig(api_key=openai_api_key, model='gpt-4o-mini'))
    embedder = OpenAIEmbedder(config=OpenAIEmbedderConfig(api_key=openai_api_key))

    graphiti = Graphiti(graph_driver=driver, llm_client=llm, embedder=embedder)
    await graphiti.build_indices_and_constraints()

    ingested = 0
    total = len(groups)
    logger.info(f'Ingesting {total} user-week groups into Graphiti...')

    for i, ((user_id, username, week_key), messages) in enumerate(groups.items(), 1):
        episode_name = f'Discord {week_key} - {username}'
        episode_body = build_episode_body(username, messages)

        if not episode_body.strip():
            continue

        # Reference time = timestamp of first message in group
        first_ts = datetime.fromisoformat(messages[0]['timestamp'].replace('Z', '+00:00'))

        # Add personality context preamble
        full_body = (
            f'User profile data for Discord user "{username}" (ID: {user_id}) '
            f'during week {week_key}. '
            f'The following are their Discord messages. '
            f'Extract personality traits, interests, tone, recurring topics, and communication style.\n\n'
            f'{episode_body}'
        )

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
            logger.info(f'[{i}/{total}] Ingested: {episode_name} ({len(messages)} messages)')
        except Exception as e:
            logger.error(f'Failed to ingest {episode_name}: {e}')

        # Small delay between episodes
        if i % 5 == 0:
            await asyncio.sleep(1)

    await graphiti.close()
    return ingested


async def main():
    logger.info('=== Discord Scraper + Graphiti Ingestion ===')
    logger.info(f'Channel: {CHANNEL_ID}')
    logger.info(f'Cutoff: {CUTOFF_DATE.isoformat()}')
    logger.info(f'Output: {OUTPUT_FILE}')

    # Step 1: Fetch messages
    if Path(OUTPUT_FILE).exists():
        logger.info(f'Found existing {OUTPUT_FILE}, loading cached messages...')
        all_messages = []
        with open(OUTPUT_FILE) as f:
            for line in f:
                line = line.strip()
                if line:
                    all_messages.append(json.loads(line))
        logger.info(f'Loaded {len(all_messages)} cached messages')
    else:
        all_messages = fetch_all_messages(CHANNEL_ID, CUTOFF_DATE, OUTPUT_FILE)

    logger.info(f'Total messages to process: {len(all_messages)}')

    if not all_messages:
        logger.warning('No messages found. Exiting.')
        return

    # Step 2: Group by user/week
    groups = group_messages_by_user_week(all_messages)
    logger.info(f'Grouped into {len(groups)} user-week segments')

    # Log user stats
    user_counts = defaultdict(int)
    for (user_id, username, week_key), msgs in groups.items():
        user_counts[username] += len(msgs)
    logger.info('Messages per user:')
    for username, count in sorted(user_counts.items(), key=lambda x: -x[1]):
        logger.info(f'  {username}: {count} messages')

    # Step 3: Ingest into Graphiti
    ingested = await ingest_into_graphiti(groups)
    logger.info(f'=== Done! Ingested {ingested}/{len(groups)} episodes into Graphiti ===')
    logger.info(f'Total messages processed: {len(all_messages)}')


if __name__ == '__main__':
    asyncio.run(main())
