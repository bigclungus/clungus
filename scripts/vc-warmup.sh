#!/usr/bin/env bash
# vc-warmup.sh — Cache voice channel IDs and verify TTS works.
# Run at startup so the bot is ready for VC immediately.

set -euo pipefail

source /home/clungus/.claude/channels/discord/.env

CACHE_FILE="/tmp/vc-channels.json"
TEST_AUDIO="/tmp/vc-warmup-test.mp3"

echo "[vc-warmup] Fetching guild list..."
GUILDS=$(curl -sf -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  -H "User-Agent: BigClungus/1.0" \
  "https://discord.com/api/v10/users/@me/guilds")

GUILD_ID=$(echo "$GUILDS" | python3 -c "
import sys, json
guilds = json.load(sys.stdin)
for g in guilds:
    print(g['id'])
    break
")

if [ -z "$GUILD_ID" ]; then
  echo "[vc-warmup] ERROR: Could not determine guild ID"
  exit 1
fi

echo "[vc-warmup] Guild ID: $GUILD_ID"
echo "[vc-warmup] Fetching channels..."

curl -sf -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  -H "User-Agent: BigClungus/1.0" \
  "https://discord.com/api/v10/guilds/$GUILD_ID/channels" | \
  python3 -c "
import sys, json
channels = json.load(sys.stdin)
voice = [{'id': c['id'], 'name': c['name'], 'type': c['type']}
         for c in channels if c['type'] == 2]
json.dump({'guild_id': '$GUILD_ID', 'voice_channels': voice}, sys.stdout, indent=2)
print()
" > "$CACHE_FILE"

VC_COUNT=$(python3 -c "import json; d=json.load(open('$CACHE_FILE')); print(len(d['voice_channels']))")
echo "[vc-warmup] Cached $VC_COUNT voice channels to $CACHE_FILE"

echo "[vc-warmup] Testing kokoro-speak.py..."
AUDIO_PATH=$(python3 /mnt/data/scripts/kokoro-speak.py "Voice warmup test" 2>/dev/null)
if [ -n "$AUDIO_PATH" ] && [ -f "$AUDIO_PATH" ]; then
  cp "$AUDIO_PATH" "$TEST_AUDIO"
  rm -f "$AUDIO_PATH"
  echo "[vc-warmup] TTS test succeeded: $TEST_AUDIO"
else
  echo "[vc-warmup] WARNING: TTS test failed — kokoro-speak.py did not produce audio"
fi

echo "[vc-warmup] Done."
