#!/bin/bash
# Dismiss dev-channel confirmation prompt, then send initial message.
# Spams Enter every 0.5s for 15 seconds, then sends the prompt.
sleep 5
for i in $(seq 1 30); do
    screen -S claude-bot -X stuff "$(printf '\n\n\n\n\n')"
    sleep 0.5
done
sleep 2
screen -S claude-bot -X stuff "$(printf 'you have awoken\n')"
