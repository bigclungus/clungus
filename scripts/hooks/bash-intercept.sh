#!/bin/bash
# Hook: PreToolUse (matcher: "Bash")
# Blocks Bash calls on the main thread and instructs delegation to background agents.
#
# Input JSON fields (stdin):
#   agent_id   — present ONLY if this hook fires inside a subagent; absent on main thread
#   session_id — current session
#   tool_name  — "Bash"
#
# Exit codes:
#   0 — allow the tool call to proceed
#   2 — block the tool call and show the message to the model

INPUT=$(cat)

AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // empty')

# If agent_id is present, we're inside a subagent — allow Bash freely
if [ -n "$AGENT_ID" ]; then
  exit 0
fi

# Main thread: block and prompt delegation
echo "Bash blocked on main thread. Delegate to a background Agent with run_in_background: true instead." >&2
exit 2
