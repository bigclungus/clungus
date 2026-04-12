#!/usr/bin/env bash
# cleanup-failed-workflows.sh
# Terminates and deletes failed Temporal workflows older than N hours.
# Usage: bash cleanup-failed-workflows.sh [--max-age-hours N] [--namespace NS] [--dry-run]
#
# Defaults: max-age=24h, namespace=default. Scans all namespaces if --namespace=all.

set -euo pipefail

MAX_AGE_HOURS=24
NAMESPACES=("default")
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-age-hours) MAX_AGE_HOURS="$2"; shift 2 ;;
    --namespace)
      if [[ "$2" == "all" ]]; then
        NAMESPACES=("default" "tasks")
      else
        NAMESPACES=("$2")
      fi
      shift 2
      ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

CUTOFF_EPOCH=$(( $(date +%s) - MAX_AGE_HOURS * 3600 ))
DELETED=0
SKIPPED=0

for NS in "${NAMESPACES[@]}"; do
  # List failed workflows as JSON
  WORKFLOWS=$(temporal workflow list --namespace "$NS" --query "ExecutionStatus='Failed'" --limit 50 --output json 2>/dev/null || echo "[]")

  if [[ "$WORKFLOWS" == "[]" ]] || [[ -z "$WORKFLOWS" ]]; then
    continue
  fi

  # Parse each workflow
  echo "$WORKFLOWS" | jq -c '.[]' 2>/dev/null | while read -r WF; do
    WF_ID=$(echo "$WF" | jq -r '.execution.workflowId // empty')
    RUN_ID=$(echo "$WF" | jq -r '.execution.runId // empty')
    START_TIME=$(echo "$WF" | jq -r '.startTime // empty')

    if [[ -z "$WF_ID" ]] || [[ -z "$START_TIME" ]]; then
      continue
    fi

    # Parse start time to epoch
    WF_EPOCH=$(date -d "$START_TIME" +%s 2>/dev/null || echo "0")

    if [[ "$WF_EPOCH" -lt "$CUTOFF_EPOCH" ]]; then
      if $DRY_RUN; then
        echo "[dry-run] would delete: $NS/$WF_ID (started: $START_TIME)"
      else
        echo "y" | temporal workflow delete --namespace "$NS" --workflow-id "$WF_ID" --run-id "$RUN_ID" 2>/dev/null && \
          echo "deleted: $NS/$WF_ID (started: $START_TIME)" || \
          echo "failed to delete: $NS/$WF_ID"
      fi
      DELETED=$((DELETED + 1))
    else
      SKIPPED=$((SKIPPED + 1))
    fi
  done
done

echo "cleanup done: deleted=$DELETED skipped=$SKIPPED (max_age=${MAX_AGE_HOURS}h)"
