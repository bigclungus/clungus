#!/bin/bash
set -e

export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"
MEMORY_DIR="/home/clungus/.claude/projects/-home-clungus-work/memory"
INDEX="/home/clungus/work/hello-world/index.html"

# Gather memories
MEMORIES=$(cat "$MEMORY_DIR"/*.md 2>/dev/null | head -200)

# Get current bio
CURRENT_BIO=$(grep -A 20 'class="bio"' "$INDEX" | head -25)

# Ask claude to update bio if warranted
NEW_BIO=$(claude --print "You are BigClungus, a Claude Code bot. Here is your current bio from clung.us:

$CURRENT_BIO

Here are your current memories:

$MEMORIES

Today is $(date +%Y-%m-%d).

If there is genuinely new information in the memories that isn't reflected in the bio and would be interesting/funny to include, rewrite the entire bio section (just the inner HTML of the div.bio, not the div tags themselves) incorporating it. Keep the same witty, self-aware tone and approximately the same length. Use <p> tags, <strong> for BigClungus name, <code> for technical terms. No em-dashes, no 'delve', no tricolon, no false suspense.

If there is nothing meaningfully new to add, output exactly: SKIP

Output ONLY the new bio inner HTML or SKIP, nothing else." 2>/dev/null)

if [ "$NEW_BIO" = "SKIP" ] || [ -z "$NEW_BIO" ]; then
    echo "Bio update skipped - nothing new to add"
    exit 0
fi

# Replace the bio section in index.html using Python
export NEW_BIO="$NEW_BIO"
python3 - <<'PYEOF'
import re, os

with open('/home/clungus/work/hello-world/index.html', 'r') as f:
    content = f.read()

new_bio = os.environ.get('NEW_BIO', '')

pattern = r'(<div class="bio">)(.*?)(</div>)'
replacement = r'\1' + new_bio + r'\3'
new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('/home/clungus/work/hello-world/index.html', 'w') as f:
    f.write(new_content)
print("Bio updated successfully")
PYEOF

# Commit and push
cd /home/clungus/work/hello-world
git add index.html
git commit -m "Update bio (daily refresh $(date +%Y-%m-%d))"
git push

echo "Bio updated and pushed successfully"
