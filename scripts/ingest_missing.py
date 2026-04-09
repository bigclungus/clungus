#!/usr/bin/env python3
"""
Re-ingest specific failed episodes by name.
Run from /mnt/data/graphiti/repo/mcp_server with: uv run python /path/to/ingest_missing.py
"""
import asyncio
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

MCP_SERVER_DIR = Path(__file__).parent.parent / 'graphiti' / 'repo' / 'mcp_server'
sys.path.insert(0, str(MCP_SERVER_DIR))
load_dotenv(MCP_SERVER_DIR / '.env')

from graphiti_core import Graphiti
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.openai_client import OpenAIClient
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
from graphiti_core.nodes import EpisodeType
from graphiti_core.driver.falkordb_driver import FalkorDriver

logging.basicConfig(level=logging.INFO, format='%(asctime)s INFO %(message)s')
logger = logging.getLogger(__name__)

CHANNEL_ID = '1485343472952148008'
OUTPUT_FILE = '/tmp/discord_messages.jsonl'
GROUP_ID = 'discord_history'

MISSING_EPISODES = {
    'Discord 2025-W38 - graeme',
    'Discord 2025-W39 - graeme',
    'Discord 2025-W39 - koole',
    'Discord 2025-W42 - koole',
    'Discord 2025-W43 - koole',
    'Discord 2025-W44 - graeme',
    'Discord 2025-W44 - koole',
    'Discord 2025-W45 - graeme',
    'Discord 2025-W46 - Jaboostin',
    'Discord 2025-W46 - graeme',
    'Discord 2025-W52 - koole',
    'Discord 2026-W12 - Jaboostin',
}


def group_messages_by_user_week(messages):
    groups = {}
    for msg in messages:
        ts = msg.get('timestamp', '')
        author = msg.get('author', {})
        user_id  = author.get('id', 'unknown')
        username = author.get('global_name') or author.get('username', 'unknown')
        if ts:
            dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
            iso_week = dt.strftime('%Y-W%W')
        else:
            iso_week = 'unknown'
        key = (user_id, username, iso_week)
        groups.setdefault(key, []).append(msg)
    return groups


def build_episode_body(username, messages):
    lines = []
    for msg in sorted(messages, key=lambda m: m['timestamp']):
        lines.append(f"{username}: {msg.get('content', '')}")
    return '\n'.join(lines)


async def main():
    openai_api_key = os.environ.get('OPENAI_API_KEY')
    if not openai_api_key:
        logger.error('OPENAI_API_KEY not set')
        sys.exit(1)

    llm = OpenAIClient(config=LLMConfig(api_key=openai_api_key, model='gpt-4o-mini'))
    embedder = OpenAIEmbedder(config=OpenAIEmbedderConfig(api_key=openai_api_key))
    driver = FalkorDriver(host='localhost', port=6379)
    graphiti = Graphiti(graph_driver=driver, llm_client=llm, embedder=embedder)

    all_messages = []
    with open(OUTPUT_FILE) as f:
        for line in f:
            line = line.strip()
            if line:
                all_messages.append(json.loads(line))
    logger.info(f'Loaded {len(all_messages)} messages')

    groups = group_messages_by_user_week(all_messages)
    all_groups = sorted(groups.items(), key=lambda x: (x[0][2], x[0][1]))

    all_targets = []
    for (user_id, username, week_key), messages in all_groups:
        episode_name = f'Discord {week_key} - {username}'
        if episode_name in MISSING_EPISODES:
            all_targets.append((episode_name, username, week_key, messages))

    targets = all_targets[args.start:args.end]
    logger.info(f'[W{args.worker}] Found {len(all_targets)} total targets, running slice [{args.start}:{args.end}] = {len(targets)} episodes')

    ingested = 0
    for i, (episode_name, username, week_key, messages) in enumerate(targets, 1):
        episode_body = build_episode_body(username, messages)
        first_ts = datetime.fromisoformat(messages[0]['timestamp'].replace('Z', '+00:00'))
        try:
            await graphiti.add_episode(
                name=episode_name,
                episode_body=episode_body,
                source=EpisodeType.text,
                reference_time=first_ts,
                source_description=f'Discord channel {CHANNEL_ID} messages',
                group_id=GROUP_ID,
            )
            ingested += 1
            logger.info(f'[W{args.worker}][{i}/{len(targets)}] Ingested: {episode_name} ({len(messages)} messages)')
        except Exception as e:
            logger.error(f'[W{args.worker}][{i}/{len(targets)}] Failed: {episode_name}: {e}')

    logger.info(f'[W{args.worker}] === Done: {ingested}/{len(targets)} episodes ingested ===')
    await driver.close()


import argparse

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', type=int, default=0)
    parser.add_argument('--end',   type=int, default=999)
    parser.add_argument('--worker', type=int, default=0)
    args = parser.parse_args()
    asyncio.run(main())
