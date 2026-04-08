#!/bin/bash
# Hook: SubagentStart
# Fires when a subagent is spawned.
# Creates a task JSON file in bigclungus-meta/tasks/ and async git commits it.
#
# Input JSON (stdin) fields:
#   agent_id        — unique ID for this subagent
#   agent_type      — agent type name (e.g. "Explore")
#   session_id      — parent session ID
#   hook_event_name — "SubagentStart"

set -euo pipefail

INPUT=$(cat)

AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // empty')
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // "unknown"')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')

if [ -z "$AGENT_ID" ]; then
  exit 0
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
STATE_DIR="/tmp/bc-agents"
mkdir -p "$STATE_DIR"

# Try to find a pending prompt context (written by pre-agent-spawn.sh)
NOW_TS=$(date +%s)
TITLE=""
BEST_PENDING=""
SUBAGENT_TYPE="general-purpose"
DISCORD_MESSAGE_ID="null"
DISCORD_USER="null"
RUN_IN_BG="false"
ISOLATION=""
MODEL=""

for f in "$STATE_DIR"/pending-"${SESSION_ID}"-*; do
  [ -f "$f" ] || continue
  FILE_TS=$(jq -r '.ts // 0' "$f")
  AGE=$(( NOW_TS - FILE_TS ))
  if [ "$AGE" -le 30 ]; then
    TITLE=$(jq -r '.title // ""' "$f")
    SUBAGENT_TYPE=$(jq -r '.subagent_type // "general-purpose"' "$f")
    DISCORD_MESSAGE_ID=$(jq -r 'if .discord_message_id == null then "null" else (.discord_message_id | @json) end' "$f")
    DISCORD_USER=$(jq -r 'if .discord_user == null then "null" else (.discord_user | @json) end' "$f")
    RUN_IN_BG=$(jq -r '.run_in_background // false' "$f")
    ISOLATION=$(jq -r '.isolation // empty' "$f")
    MODEL=$(jq -r '.model // empty' "$f")
    BEST_PENDING="$f"
  fi
done

[ -n "$BEST_PENDING" ] && rm -f "$BEST_PENDING"

if [ -z "$TITLE" ]; then
  TITLE="${AGENT_TYPE} — ${AGENT_ID:0:12}"
fi

# Generate task ID
TASK_ID="task-$(date +%Y%m%d-%H%M%S)-${AGENT_ID:0:8}"

TASKS_DIR="/home/clungus/work/bigclungus-meta/tasks"
TASK_FILE="$TASKS_DIR/${TASK_ID}.json"

# Write task JSON file with append-only log format
jq -n \
  --arg id "$TASK_ID" \
  --arg title "$TITLE" \
  --arg agent_id "$AGENT_ID" \
  --arg agent_type "$SUBAGENT_TYPE" \
  --arg session_id "$SESSION_ID" \
  --argjson discord_message_id "$DISCORD_MESSAGE_ID" \
  --argjson discord_user "$DISCORD_USER" \
  --argjson run_in_background "$RUN_IN_BG" \
  --arg isolation "${ISOLATION:-}" \
  --arg model "${MODEL:-}" \
  --arg ts "$TIMESTAMP" \
  '{
    id: $id,
    title: $title,
    agent_id: $agent_id,
    agent_type: $agent_type,
    session_id: $session_id,
    discord_message_id: $discord_message_id,
    discord_user: $discord_user,
    run_in_background: $run_in_background,
    isolation: (if $isolation == "" then null else $isolation end),
    model: (if $model == "" then null else $model end),
    log: [
      {
        ts: $ts,
        event: "started",
        context: $title
      }
    ]
  }' > "$TASK_FILE"

# Insert task into tasks.db so it appears on clung.us/tasks
python3 - <<PYEOF
import sqlite3, json, sys
sys.path.insert(0, '/mnt/data/scripts')
from tasks_db import DEFAULT_DB, get_db, init_db

task_id = '${TASK_ID}'
title   = '${TITLE}'
ts      = '${TIMESTAMP}'

task_data = {
    'id': task_id,
    'title': title,
    'status': 'open',
    'source': 'discord',
    'log': [{'ts': ts, 'event': 'started', 'context': title}]
}

init_db(DEFAULT_DB)
conn = get_db(DEFAULT_DB)
conn.execute(
    'INSERT OR IGNORE INTO tasks (id, title, status, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)',
    (task_id, title, 'open', ts, ts, json.dumps(task_data))
)
conn.execute(
    'INSERT INTO task_events (task_id, event, message, ts) VALUES (?, ?, ?, ?)',
    (task_id, 'started', title, ts)
)
conn.commit()
conn.close()
PYEOF

# Store task ID in agent state file for subagent-stop.sh to pick up
jq -n \
  --arg task_id "$TASK_ID" \
  --arg agent_id "$AGENT_ID" \
  --arg session_id "$SESSION_ID" \
  '{task_id: $task_id, agent_id: $agent_id, session_id: $session_id}' \
  > "$STATE_DIR/${AGENT_ID}.json"

# Write spawn record to agents.db via clunger HTTP endpoint
OUTPUT_FILE="/tmp/claude-1001/-mnt-data/${SESSION_ID}/tasks/${AGENT_ID}.output"
SPAWN_PAYLOAD=$(jq -cn \
  --arg id "$AGENT_ID" \
  --arg description "$TITLE" \
  --arg output_file "$OUTPUT_FILE" \
  --arg task_id "$TASK_ID" \
  '{id: $id, description: $description, output_file: $output_file, task_id: $task_id}')
curl -sf -X POST http://localhost:8081/api/agents/spawn \
  -H "Content-Type: application/json" \
  -d "$SPAWN_PAYLOAD" \
  || true  # non-fatal

# Async background git commit+push (zero blocking)
(cd /home/clungus/work/bigclungus-meta && git add tasks/ && git commit -m "task: start $TASK_ID" && git push) &

echo "subagent-start: created task $TASK_ID for agent $AGENT_ID ($AGENT_TYPE)" >&2

exit 0
