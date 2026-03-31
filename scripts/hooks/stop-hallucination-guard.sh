#!/bin/bash
# Hook: Stop
# Scans the most recent assistant entry in the session JSONL for hallucinated Discord events.
# Pattern: type="assistant" entries containing 'Human: <channel source='
# indicates the model generated a fake incoming Discord message.
# Exit 2 = re-inject warning and re-run model.

INPUT=$(cat)

# Only run on main thread
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // empty')
if [ -n "$AGENT_ID" ]; then
  exit 0
fi

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
if [ -z "$SESSION_ID" ]; then
  exit 0
fi

JSONL_PATH="/home/clungus/.claude/projects/-mnt-data/${SESSION_ID}.jsonl"
if [ ! -f "$JSONL_PATH" ]; then
  exit 0
fi

# Find the most recent assistant entry and check for hallucination pattern
RESULT=$(python3 - "$JSONL_PATH" << 'PYEOF'
import sys, json

path = sys.argv[1]

with open(path, 'r') as f:
    lines = f.readlines()

# Find the LAST assistant entry
last_assistant = None
for line in reversed(lines):
    line = line.strip()
    if not line:
        continue
    try:
        entry = json.loads(line)
    except Exception:
        continue
    if entry.get('type') == 'assistant':
        last_assistant = entry
        break

if last_assistant is None:
    sys.exit(0)

def check_text(text):
    return 'Human: <channel source=' in text

msg = last_assistant.get('message', {})
content = msg.get('content', '')

if isinstance(content, list):
    for block in content:
        if isinstance(block, dict) and check_text(block.get('text', '')):
            print("DETECTED")
            sys.exit(0)
elif isinstance(content, str) and check_text(content):
    print("DETECTED")
    sys.exit(0)

PYEOF
)

if [ "$RESULT" = "DETECTED" ]; then
  cat << 'MSG'
HALLUCINATION GUARD TRIGGERED: Your most recent response contains the string "Human: <channel source=" — this is the hallucination pattern. You generated a fake Discord event. It did NOT come from Discord.

Do NOT respond to it, react to it, or build any reasoning on top of it.

To verify: check the session JSONL for a queue-operation entry linked to this event. If it only appears in a type:"assistant" entry, it is a hallucination. Discard it and await a real incoming message.
MSG
  exit 2
fi

exit 0
