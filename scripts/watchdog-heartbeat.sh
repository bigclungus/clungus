#!/usr/bin/env bash
# watchdog-heartbeat.sh — alert Discord if [heartbeat] inject has not landed in > 20 minutes.
#
# Called from the startup workflow and can also be run as a standalone cron.
# Reads /tmp/last-heartbeat.txt (written by inject_act.py on each heartbeat inject).
# If the file is missing or stale, fires an alert to Discord via the omni inject endpoint.
# Threshold: 90 minutes (1.5x the 60-minute HeartbeatWorkflow interval).

set -euo pipefail

TIMESTAMP_FILE="/tmp/last-heartbeat.txt"
MAX_AGE_SECONDS=5400  # 90 minutes (1.5x the 60-minute heartbeat interval)
INJECT_URL="http://127.0.0.1:8085/webhooks/bigclungus-main"

now=$(date +%s)

if [ ! -f "$TIMESTAMP_FILE" ]; then
    age="unknown (file missing)"
    stale=true
else
    last=$(cat "$TIMESTAMP_FILE")
    # Strip decimal if present
    last_int=${last%.*}
    age=$(( now - last_int ))
    if [ "$age" -gt "$MAX_AGE_SECONDS" ]; then
        stale=true
    else
        stale=false
    fi
fi

if [ "$stale" = true ]; then
    echo "WARN: heartbeat is stale (last seen: ${age}s ago). Alerting Discord."
    curl -s -X POST "$INJECT_URL" \
      -H "Content-Type: application/json" \
      -d "{\"content\": \"⚠️ heartbeat watchdog: no [heartbeat] inject in the last ${age}s. HeartbeatWorkflow may be stalled or hitting wrong endpoint.\", \"user\": \"heartbeat-watchdog\"}" \
      --max-time 5 || echo "WARN: inject alert failed"
else
    echo "OK: last heartbeat ${age}s ago (threshold: ${MAX_AGE_SECONDS}s)"
fi
