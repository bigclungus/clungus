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

python3 -c "
import urllib.request, json, sys
service, exit_code, result = sys.argv[1], sys.argv[2], sys.argv[3]
msg = f'⚠️ service crash: {service} stopped unexpectedly (exit_code={exit_code or \"?\"}, result={result or \"?\"}) — investigate and restart if needed.'
req = urllib.request.Request('http://127.0.0.1:8085/webhooks/bigclungus-main',
  data=json.dumps({'content': msg, 'chat_id': '1485343472952148008', 'user': 'system-monitor'}).encode(),
  headers={'Content-Type': 'application/json'}, method='POST')
urllib.request.urlopen(req, timeout=5)
" "$SERVICE" "$EXIT_CODE" "$SERVICE_RESULT"
