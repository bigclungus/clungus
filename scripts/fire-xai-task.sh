#!/bin/bash
# Usage: fire-xai-task.sh <model> <prompt>
# Fires an xAI temporal workflow and prints the task_id + workflow_id
# Model defaults to grok-3-mini if not provided.
set -euo pipefail

MODEL="${1:-grok-3}"
PROMPT="${2:-}"

if [[ -z "$PROMPT" ]]; then
  echo "Usage: fire-xai-task.sh <model> <prompt>" >&2
  exit 1
fi

TIMESTAMP=$(date +%s)
SLUG=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | cut -c1-20 | sed 's/-$//')
TASK_ID="xai-${SLUG}-${TIMESTAMP}"
WORKFLOW_ID="xai-task-${TIMESTAMP}"

INPUT=$(python3 -c "
import json, sys
data = {
    'task_id': sys.argv[1],
    'agent_id': '',
    'description': sys.argv[3][:100],
    'provider': 'xai',
    'model': sys.argv[2],
    'prompt': sys.argv[3],
    'api_key': ''
}
print(json.dumps(data))
" "$TASK_ID" "$MODEL" "$PROMPT")

/home/clungus/.local/bin/temporal workflow start \
  --namespace tasks \
  --task-queue agent-tasks-queue \
  --type AgentTaskWorkflow \
  --workflow-id "$WORKFLOW_ID" \
  --input "$INPUT" \
  --address 127.0.0.1:7233

echo "task_id: $TASK_ID"
echo "workflow_id: $WORKFLOW_ID"
