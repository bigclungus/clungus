#!/usr/bin/env python3
"""
PostToolUse hook: log BigClungus's outgoing Discord replies to Graphiti memory.

Receives a JSON blob on stdin from Claude Code's hook system with:
  tool_name   - mcp__omni__omni_dispatch (omnichannel dispatch tool)
  tool_input  - dict with: channelId, capability, args (contains text), replyHandle
  tool_result - the tool's return value (may contain message id, etc.)

Adds an episode to Graphiti with group_id "discord_history" so the bot's own
replies are captured in the knowledge graph alongside ingested user messages.
"""

import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s log-to-graphiti %(levelname)s: %(message)s',
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)

# ── graphiti setup ────────────────────────────────────────────────────────────
MCP_SERVER_DIR = Path('/home/clungus/work/graphiti/repo/mcp_server')
sys.path.insert(0, str(MCP_SERVER_DIR / 'src'))

from dotenv import load_dotenv
load_dotenv(MCP_SERVER_DIR / '.env')

GROUP_ID = 'discord_history'


async def add_episode(text: str, chat_id: str) -> None:
    openai_api_key = os.environ.get('OPENAI_API_KEY')
    if not openai_api_key:
        logger.error('OPENAI_API_KEY not set — cannot log to Graphiti')
        return

    from graphiti_core import Graphiti
    from graphiti_core.nodes import EpisodeType
    from graphiti_core.llm_client.openai_client import OpenAIClient
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
    from graphiti_core.driver.falkordb_driver import FalkorDriver

    driver = FalkorDriver(host='localhost', port=6379)
    llm = OpenAIClient(config=LLMConfig(api_key=openai_api_key, model='gpt-4o-mini'))
    embedder = OpenAIEmbedder(config=OpenAIEmbedderConfig(api_key=openai_api_key))

    graphiti = Graphiti(graph_driver=driver, llm_client=llm, embedder=embedder)

    now = datetime.now(timezone.utc)
    episode_name = f'BigClungus Discord reply {now.strftime("%Y-%m-%d %H:%M:%S")}'
    episode_body = (
        f'[{now.strftime("%Y-%m-%d %H:%M")}] BigClungus (bot, channel {chat_id}): {text}'
    )

    await graphiti.add_episode(
        name=episode_name,
        episode_body=episode_body,
        group_id=GROUP_ID,
        source=EpisodeType.message,
        source_description='BigClungus Discord reply',
        reference_time=now,
    )
    await graphiti.close()


def main() -> None:
    raw = sys.stdin.read()
    if not raw.strip():
        logger.error('No input received on stdin')
        sys.exit(0)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error('Failed to parse stdin JSON: %s', exc)
        sys.exit(0)

    tool_input = payload.get('tool_input') or {}

    # omni_dispatch nests the message text inside tool_input.args
    args = tool_input.get('args') or {}
    text = args.get('text', '')
    chat_id = str(tool_input.get('channelId', ''))

    if not text:
        logger.info('No text in payload args, skipping (capability=%s)', tool_input.get('capability'))
        sys.exit(0)

    try:
        asyncio.run(add_episode(text, chat_id))
        logger.info('Logged reply to Graphiti (channel=%s, %d chars)', chat_id, len(text))
    except Exception as exc:
        # Log the full error with traceback so failures are diagnosable
        logger.error('Graphiti ingestion failed: %s', exc, exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
