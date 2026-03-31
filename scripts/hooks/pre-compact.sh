#!/bin/bash
# Hook: PreCompact
# Fires when Claude Code is about to compact the conversation context.
# Posts a Discord notification so users know a compaction is happening.

set -euo pipefail

DISCORD_BOT_TOKEN=$(grep DISCORD_BOT_TOKEN /home/clungus/.claude/channels/discord/.env | cut -d= -f2-)

curl -s -X POST "https://discord.com/api/v10/channels/1485343472952148008/messages" \
  -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "🗜️ **Compacting context** — conversation is getting long, summarizing now. I'\''ll be right back."}' || true

exit 0
