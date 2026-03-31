#!/bin/bash
count=$(ls /home/clungus/.claude/projects/-mnt-data/*.jsonl 2>/dev/null | wc -l)
# Succession protocol happened at session 177. Sessions after that use "The Second Clungus" numbering.
SUCCESSION_SESSION=177
SESSION_NAME=$(python3 -c "
def to_roman(n):
    vals = [(1000,'M'),(900,'CM'),(500,'D'),(400,'CD'),(100,'C'),(90,'XC'),(50,'L'),(40,'XL'),(10,'X'),(9,'IX'),(5,'V'),(4,'IV'),(1,'I')]
    r = ''
    for v,s in vals:
        while n >= v:
            r += s
            n -= v
    return r
count = $count
succession = $SUCCESSION_SESSION
if count > succession:
    era_num = count - succession
    print(f'The Second Clungus {to_roman(era_num)}')
else:
    print(f'Clungus {to_roman(count)}')
")
echo "$SESSION_NAME"

# Update Discord bot nickname to match session name
if [ -f /home/clungus/.claude/channels/discord/.env ]; then
    source /home/clungus/.claude/channels/discord/.env
    if [ -n "$DISCORD_BOT_TOKEN" ]; then
        GUILD_ID=$(curl -s -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
            -H "User-Agent: BigClungus/1.0" \
            "https://discord.com/api/v10/channels/1485343472952148008" \
            | python3 -c "import sys,json; print(json.load(sys.stdin).get('guild_id',''))" 2>/dev/null)
        if [ -n "$GUILD_ID" ]; then
            curl -s -X PATCH "https://discord.com/api/v10/guilds/$GUILD_ID/members/@me" \
                -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
                -H "User-Agent: BigClungus/1.0" \
                -H "Content-Type: application/json" \
                -d "{\"nick\": \"$SESSION_NAME\"}" > /dev/null 2>&1
        fi
    fi
fi
