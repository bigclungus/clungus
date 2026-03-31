#!/bin/bash
# session-close.sh
# Closes the rolling session issue and clears local session state.
# Run at end of day or manually to wrap up the session log.
#
# Usage: ./session-close.sh [--reason "optional closing note"]

set -euo pipefail

REASON="${2:-End of session.}"
SESSION_ISSUE_FILE="/tmp/bc-session-issue.json"

if [ ! -f "$SESSION_ISSUE_FILE" ]; then
  echo "session-close: no active session issue found (nothing to close)" >&2
  exit 0
fi

ISSUE_NUMBER=$(jq -r '.issue_number' "$SESSION_ISSUE_FILE")
ISSUE_NODE_ID=$(jq -r '.issue_node_id // empty' "$SESSION_ISSUE_FILE")
ITEM_ID=$(jq -r '.item_id // empty' "$SESSION_ISSUE_FILE")

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Close issue and set project status to Done in one batch (if node IDs available)
if [ -n "$ISSUE_NODE_ID" ] && [ "$ISSUE_NODE_ID" != "null" ] \
   && [ -n "$ITEM_ID" ] && [ "$ITEM_ID" != "null" ]; then
  gh api graphql \
    -f query='mutation($issueId:ID!, $projectId:ID!, $itemId:ID!, $fieldId:ID!, $optionId:String!) {
      closeIssue(input:{issueId:$issueId, stateReason:COMPLETED}) {
        issue { id }
      }
      updateProjectV2ItemFieldValue(input:{projectId:$projectId, itemId:$itemId, fieldId:$fieldId, value:{singleSelectOptionId:$optionId}}) {
        projectV2Item { id }
      }
    }' \
    -f issueId="$ISSUE_NODE_ID" \
    -f projectId=PVT_kwHOEBqF8c4BSf-9 \
    -f itemId="$ITEM_ID" \
    -f fieldId=PVTSSF_lAHOEBqF8c4BSf-9zhAA8iU \
    -f optionId=98236657 2>/dev/null || \
    gh issue close "$ISSUE_NUMBER" --repo BigClungus/bigclungus-meta 2>/dev/null || true
else
  gh issue close "$ISSUE_NUMBER" --repo BigClungus/bigclungus-meta 2>/dev/null || true
fi

# Add a closing comment
gh issue comment "$ISSUE_NUMBER" \
  --repo BigClungus/bigclungus-meta \
  --body "**Session closed**: ${TIMESTAMP}

${REASON}

_Closed by session-close.sh_" 2>/dev/null || true

# Clear session state files
rm -f "$SESSION_ISSUE_FILE"
rm -f /tmp/bc-session-log.jsonl

echo "session-close: closed session issue #$ISSUE_NUMBER" >&2
exit 0
