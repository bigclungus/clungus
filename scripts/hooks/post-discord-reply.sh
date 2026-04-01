#!/usr/bin/env bash
# PostToolUse hook for mcp__omni__omni_dispatch (omnichannel reply logging)
# Reads the hook payload from stdin and forwards it to log-to-graphiti.py.
# Runs async (fire-and-forget) — errors are logged to /tmp/post-discord-reply.log.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_GRAPHITI="${SCRIPT_DIR}/log-to-graphiti.py"

# Read stdin once
PAYLOAD="$(cat)"

# Only process reply capabilities (skip react, fetch_history, etc.)
CAPABILITY=$(echo "${PAYLOAD}" | jq -r '.tool_input.capability // empty' 2>/dev/null || true)
if [ -z "$CAPABILITY" ] || { [ "$CAPABILITY" != "reply" ] && [ "$CAPABILITY" != "send_message" ]; }; then
  exit 0
fi

# Write last Discord context so pre-agent-spawn.sh can attach it to task files
# omni_dispatch uses .channelId and .replyHandle (not .chat_id / .reply_to)
CHAT_ID=$(echo "${PAYLOAD}" | jq -r '.tool_input.channelId // empty' 2>/dev/null || true)
REPLY_HANDLE=$(echo "${PAYLOAD}" | jq -r '.tool_input.replyHandle // empty' 2>/dev/null || true)
if [ -n "$CHAT_ID" ] && [ -n "$REPLY_HANDLE" ]; then
  jq -n \
    --arg chat_id "$CHAT_ID" \
    --arg message_id "$REPLY_HANDLE" \
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
