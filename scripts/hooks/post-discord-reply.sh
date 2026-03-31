#!/usr/bin/env bash
# PostToolUse hook for mcp__plugin_discord_discord__reply
# Reads the hook payload from stdin and forwards it to log-to-graphiti.py.
# Runs async (fire-and-forget) — errors are logged to stderr only.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_GRAPHITI="${SCRIPT_DIR}/log-to-graphiti.py"

# Read stdin once
PAYLOAD="$(cat)"

# Write last Discord context so pre-agent-spawn.sh can attach it to task files
CHAT_ID=$(echo "${PAYLOAD}" | jq -r '.tool_input.chat_id // empty' 2>/dev/null || true)
REPLY_TO=$(echo "${PAYLOAD}" | jq -r '.tool_input.reply_to // empty' 2>/dev/null || true)
if [ -n "$CHAT_ID" ] && [ -n "$REPLY_TO" ]; then
  jq -n \
    --arg chat_id "$CHAT_ID" \
    --arg message_id "$REPLY_TO" \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{chat_id: $chat_id, message_id: $message_id, ts: $ts}' \
    > /tmp/bc-last-discord-context.json 2>/dev/null || true
fi

# Delegate to Python script using the graphiti client directly.
# uv run picks up the mcp_server venv which has graphiti_core installed.
echo "${PAYLOAD}" | \
  /home/clungus/.local/bin/uv run \
    --project /home/clungus/work/graphiti/repo/mcp_server \
    python "${LOG_GRAPHITI}" 2>>/tmp/post-discord-reply.log || true
