#!/usr/bin/env python3
"""
Parallel worker for Discord Graphiti ingestion.
Reads all episodes from the pre-built groups, slices by --start/--end, and ingests that slice.
Usage: uv run scrape_discord_worker.py --start 0 --end 28 --worker 0
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

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

# ── args ──────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument('--start', type=int, required=True, help='First episode index (inclusive)')
parser.add_argument('--end',   type=int, required=True, help='Last episode index (exclusive)')
parser.add_argument('--worker', type=int, default=0, help='Worker number (for logging)')
args = parser.parse_args()

# ── logging ───────────────────────────────────────────────────────────────────
log_file = f'/tmp/scrape_discord_{args.worker}.log'
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [W%(worker)d] %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler(sys.stdout),
    ],
)

class WorkerFilter(logging.Filter):
    def filter(self, record):
        record.worker = args.worker
        return True

logger = logging.getLogger(__name__)
logger.addFilter(WorkerFilter())
# Add filter to root handlers too
for h in logging.getLogger().handlers:
    h.addFilter(WorkerFilter())

# ── config ────────────────────────────────────────────────────────────────────
OUTPUT_FILE = '/tmp/discord_messages.jsonl'
GROUP_ID = 'discord_history'
CHANNEL_ID = '1383689218861039686'


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


async def ingest_slice(groups_slice: list) -> int:
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
    total = len(groups_slice)
    logger.info(f'Worker {args.worker}: ingesting episodes {args.start}–{args.end-1} ({total} total)')

    for i, ((user_id, username, week_key), messages) in enumerate(groups_slice, 1):
        episode_name = f'Discord {week_key} - {username}'
        episode_body = build_episode_body(username, messages)

        if not episode_body.strip():
            logger.info(f'[{i}/{total}] Skipping empty episode: {episode_name}')
            continue

        first_ts = datetime.fromisoformat(messages[0]['timestamp'].replace('Z', '+00:00'))

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
            logger.error(f'[{i}/{total}] Failed to ingest {episode_name}: {e}')

        if i % 5 == 0:
            await asyncio.sleep(1)

    await graphiti.close()
    return ingested


async def main():
    logger.info(f'=== Worker {args.worker}: episodes [{args.start}, {args.end}) ===')

    # Load messages
    all_messages = []
    with open(OUTPUT_FILE) as f:
        for line in f:
            line = line.strip()
            if line:
                all_messages.append(json.loads(line))
    logger.info(f'Loaded {len(all_messages)} messages from {OUTPUT_FILE}')

    # Build all groups (deterministic ordering via sorted)
    groups_dict = group_messages_by_user_week(all_messages)
    all_groups = sorted(groups_dict.items(), key=lambda x: (x[0][2], x[0][1]))  # sort by week, username
    logger.info(f'Total episodes: {len(all_groups)}, this worker slice: {args.start}:{args.end}')

    slice_ = all_groups[args.start:args.end]
    if not slice_:
        logger.warning(f'No episodes in range [{args.start}, {args.end}), exiting.')
        return

    ingested = await ingest_slice(slice_)
    logger.info(f'=== Worker {args.worker} done! Ingested {ingested}/{len(slice_)} episodes ===')


if __name__ == '__main__':
    asyncio.run(main())
