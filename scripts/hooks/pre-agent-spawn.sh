#!/bin/bash
# Hook: PreToolUse (matcher: "Agent")
# Fires before an Agent tool call executes — i.e., just before a subagent spawns.
# We cannot get the agent_id yet (it's assigned after spawn), but we CAN read the prompt.
#
# Strategy: write the prompt to /tmp/bc-pending-agent-prompt keyed by session+timestamp,
# then SubagentStart picks it up (matching on recency). This is a best-effort association.
#
# Input JSON fields:
#   session_id      — current session
#   tool_name       — "Agent"
#   tool_input.prompt      — the prompt being sent to the subagent
#   tool_input.description — short description if provided
#   tool_input.subagent_type — e.g. "Explore"
#   tool_input.discord_message_id — triggering Discord message ID (may be absent)
#   tool_input.discord_user       — triggering Discord user (may be absent)
#   hook_event_name — "PreToolUse"
#   agent_id        — present if THIS hook fires inside a subagent

set -euo pipefail

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only handle Agent tool calls
if [ "$TOOL_NAME" != "Agent" ]; then
  exit 0
fi

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
PROMPT=$(echo "$INPUT" | jq -r '.tool_input.prompt // ""')
DESCRIPTION=$(echo "$INPUT" | jq -r '.tool_input.description // ""')
SUBAGENT_TYPE=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // "general-purpose"')
RUN_IN_BACKGROUND=$(echo "$INPUT" | jq -r '.tool_input.run_in_background // false')
ISOLATION=$(echo "$INPUT" | jq -r '.tool_input.isolation // empty')
MODEL=$(echo "$INPUT" | jq -r '.tool_input.model // empty')

# Extract optional discord context from tool_input first,
# then fall back to /tmp/bc-last-discord-context.json (written by post-discord-reply.sh)
DISCORD_MESSAGE_ID=$(echo "$INPUT" | jq -r '.tool_input.discord_message_id // empty')
DISCORD_USER=$(echo "$INPUT" | jq -r '.tool_input.discord_user // empty')

if [ -z "$DISCORD_MESSAGE_ID" ] && [ -f /tmp/bc-last-discord-context.json ]; then
  # Only use if written within last 120 seconds (i.e. recent reply before this spawn)
  CTX_TS=$(jq -r '.ts // empty' /tmp/bc-last-discord-context.json 2>/dev/null || true)
  if [ -n "$CTX_TS" ]; then
    CTX_AGE=$(( $(date +%s) - $(date -d "$CTX_TS" +%s 2>/dev/null || echo 0) ))
    if [ "$CTX_AGE" -le 120 ]; then
      DISCORD_MESSAGE_ID=$(jq -r '.message_id // empty' /tmp/bc-last-discord-context.json)
    fi
  fi
fi

# Use description as title if available, else first 80 chars of prompt
if [ -n "$DESCRIPTION" ]; then
  TITLE="$DESCRIPTION"
else
  TITLE="${PROMPT:0:80}"
  # Clean up newlines
  TITLE=$(echo "$TITLE" | tr '\n' ' ' | sed 's/  */ /g')
fi

STATE_DIR="/tmp/bc-agents"
mkdir -p "$STATE_DIR"

# Write pending prompt state — SubagentStart will consume it
# Use session_id + nanosecond timestamp to avoid collisions
PENDING_FILE="$STATE_DIR/pending-${SESSION_ID}-$(date +%s%N)"
jq -n \
  --arg title "$TITLE" \
  --arg prompt "$PROMPT" \
  --arg subagent_type "$SUBAGENT_TYPE" \
  --arg session_id "$SESSION_ID" \
  --argjson ts "$(date +%s)" \
  --arg discord_message_id "${DISCORD_MESSAGE_ID:-}" \
  --arg discord_user "${DISCORD_USER:-}" \
  --argjson run_in_background "$RUN_IN_BACKGROUND" \
  --arg isolation "${ISOLATION:-}" \
  --arg model "${MODEL:-}" \
  '{
    title: $title,
    prompt: $prompt,
    subagent_type: $subagent_type,
    session_id: $session_id,
    ts: $ts,
    discord_message_id: (if $discord_message_id == "" then null else $discord_message_id end),
    discord_user: (if $discord_user == "" then null else $discord_user end),
    run_in_background: $run_in_background,
    isolation: (if $isolation == "" then null else $isolation end),
    model: (if $model == "" then null else $model end)
  }' > "$PENDING_FILE"

echo "pre-agent-spawn: saved pending prompt for session $SESSION_ID" >&2

# Allow the agent to proceed without modification
exit 0
