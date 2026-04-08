#!/usr/bin/env bash
# heartbeat.sh — periodic system health check, posts status to Discord via inject endpoint.
#
# Checks:
#   1. Failed systemd user services
#   2. Disk usage (alert if root > 85%)
#   3. Whether the Temporal HeartbeatWorkflow is alive (/tmp/last-heartbeat.txt)
#
# Posts to Discord only when something is wrong, or on explicit --status flag.
#
# Usage:
#   bash heartbeat.sh           # check and alert on problems
#   bash heartbeat.sh --status  # always post a status summary

set -euo pipefail

INJECT_URL="http://127.0.0.1:8085/webhooks/bigclungus-main"
HEARTBEAT_FILE="/tmp/last-heartbeat.txt"
HEARTBEAT_STALE_SECONDS=5400  # 90 minutes (1.5x the 60-minute heartbeat interval)

FORCE_STATUS=false
if [[ "${1:-}" == "--status" ]]; then
    FORCE_STATUS=true
fi

post_to_discord() {
    local msg="$1"
    curl -s -X POST "$INJECT_URL" \
        -H "Content-Type: application/json" \
        -d "{\"content\": \"$msg\", \"user\": \"heartbeat-service\"}" \
        --max-time 5 || echo "WARN: discord post failed"
}

problems=()
status_lines=()

# 1. Check for failed services
failed_services=$(systemctl --user list-units --type=service --state=failed --no-legend --plain 2>/dev/null | awk '{print $1}' | tr '\n' ' ')
if [[ -n "$failed_services" ]]; then
    problems+=("failed services: $failed_services")
    status_lines+=("failed: $failed_services")
else
    status_lines+=("services: ok")
fi

# 2. Check disk usage
disk_pct=$(df / --output=pcent | tail -1 | tr -d ' %')
if [[ "$disk_pct" -gt 85 ]]; then
    problems+=("disk ${disk_pct}% full")
fi
status_lines+=("disk: ${disk_pct}%")

# 3. Check Temporal HeartbeatWorkflow liveness
now=$(date +%s)
if [[ ! -f "$HEARTBEAT_FILE" ]]; then
    problems+=("heartbeat timestamp missing (temporal may be down)")
    status_lines+=("temporal heartbeat: no timestamp file")
else
    last=$(cat "$HEARTBEAT_FILE")
    last_int=${last%.*}
    age=$(( now - last_int ))
    if [[ "$age" -gt "$HEARTBEAT_STALE_SECONDS" ]]; then
        problems+=("temporal heartbeat stale (${age}s ago)")
        status_lines+=("temporal heartbeat: stale (${age}s)")
    else
        status_lines+=("temporal heartbeat: ok (${age}s ago)")
    fi
fi

if [[ "${#problems[@]}" -gt 0 ]]; then
    alert_msg="⚠️ heartbeat alert: $(IFS=', '; echo "${problems[*]}")"
    echo "$alert_msg"
    post_to_discord "$alert_msg"
elif [[ "$FORCE_STATUS" == "true" ]]; then
    summary=$(IFS=', '; echo "${status_lines[*]}")
    post_to_discord "heartbeat ok — $summary"
    echo "status posted: $summary"
else
    echo "all ok — $(IFS=', '; echo "${status_lines[*]}")"
fi
