#!/bin/bash
set -e
cd /mnt/data/bigclungus-meta

OUTPUT=$(python3 tests/integration_test.py 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    # Alert Discord via inject endpoint
    python3 -c "
import urllib.request, json, sys
msg = '🚨 **Integration tests FAILED**\n\`\`\`\n' + sys.argv[1][:1500] + '\n\`\`\`'
req = urllib.request.Request('http://127.0.0.1:8085/webhooks/bigclungus-main',
  data=json.dumps({'content': msg, 'chat_id': '1485343472952148008', 'user': 'integration-test'}).encode(),
  headers={'Content-Type': 'application/json'}, method='POST')
urllib.request.urlopen(req, timeout=5)
" "$OUTPUT"
fi

exit $EXIT_CODE
