#!/bin/bash
set -e
cd /mnt/data/bigclungus-meta

OUTPUT=$(python3 tests/integration_test.py 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    # Alert Discord via inject endpoint
    python3 - "$OUTPUT" <<'EOF'
import sys, pathlib
sys.path.insert(0, str(pathlib.Path("/mnt/data/scripts")))
from omni_inject import inject
msg = '\U0001f6a8 **Integration tests FAILED**\n```\n' + sys.argv[1][:1500] + '\n```'
inject(msg, user="integration-test", chat_id="1485343472952148008")
EOF
fi

exit $EXIT_CODE
