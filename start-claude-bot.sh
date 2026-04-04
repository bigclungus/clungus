#!/bin/bash

# Kill any existing claude-bot screen session gracefully
screen -S claude-bot -X quit 2>/dev/null || true

sleep 1

# Start a new screen session named claude-bot with a restart loop
screen -dmS claude-bot bash -c "
export PATH=\"\$HOME/.local/bin:\$HOME/.bun/bin:\$PATH\"
cd /home/clungus/work

# Claude proxy (model router & token tracker)
export ANTHROPIC_BASE_URL=http://localhost:3456

while true; do
    # Determine session name (Roman numeral based on JSONL count)
    export SESSION_NAME=\$(/mnt/data/scripts/session-number.sh)
    echo \"\$SESSION_NAME\" > /tmp/clungus-session-name.txt

    python3 /mnt/data/scripts/launch-claude.py

    # temporary gemini mode
    #/home/clungus/.nvm/versions/node/v24.14.0/bin/node  /mnt/data/gemini-cli/packages/cli/dist/index.js --yolo --resume

    echo \"Claude exited. Restarting in 10 seconds...\"
    sleep 10
done
"

sleep 1

# Set up logging
screen -S claude-bot -X logfile /tmp/screenlog.txt
screen -S claude-bot -X log on
