#!/bin/bash
# Called by systemd ExecStopPost when a service exits.
# Args: %n (unit name)
# Env vars set by systemd: SERVICE_RESULT, EXIT_CODE, EXIT_STATUS
SERVICE="$1"
EXIT_CODE="${EXIT_CODE:-}"
SERVICE_RESULT="${SERVICE_RESULT:-}"

# Only alert on unexpected exits:
# SERVICE_RESULT "success" = clean stop, skip
# EXIT_CODE "0" = also clean, skip
if [ "$SERVICE_RESULT" = "success" ]; then
    exit 0
fi
if [ -z "$SERVICE_RESULT" ] && [ "$EXIT_CODE" = "0" ]; then
    exit 0
fi

python3 - "$SERVICE" "$EXIT_CODE" "$SERVICE_RESULT" <<'EOF'
import sys
sys.path.insert(0, "/mnt/data/scripts")
from omni_inject import inject
service, exit_code, result = sys.argv[1], sys.argv[2], sys.argv[3]
msg = f'\u26a0\ufe0f service crash: {service} stopped unexpectedly (exit_code={exit_code or "?"}, result={result or "?"}) \u2014 investigate and restart if needed.'
inject(msg, user="system-monitor", chat_id="1485343472952148008")
EOF
