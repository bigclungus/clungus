#!/usr/bin/env bash
# regen-sprites.sh — regenerate A/B/C sprite variants for a persona after a 3-way tie
# Usage: regen-sprites.sh <persona>
# Where <persona> is the poll persona slug, e.g. "critic", "chairman", "the_kid"
# The poll ID is "sprite-<persona>", function names are drawSprite_<persona>_A/B/C

set -euo pipefail

PERSONA="${1:-}"
if [[ -z "$PERSONA" ]]; then
  echo "Usage: regen-sprites.sh <persona>" >&2
  exit 1
fi

SPRITES_DIR="/mnt/data/hello-world"
LOG_PREFIX="[sprite-regen:$PERSONA]"

echo "$LOG_PREFIX starting sprite regeneration"

# Find which batch file contains this persona's sprites
BATCH_FILE=""
for f in "$SPRITES_DIR"/sprites-batch*.js; do
  if grep -q "function drawSprite_${PERSONA}_A" "$f" 2>/dev/null; then
    BATCH_FILE="$f"
    break
  fi
done

if [[ -z "$BATCH_FILE" ]]; then
  echo "$LOG_PREFIX ERROR: no sprites-batch file found for persona '$PERSONA'" >&2
  exit 1
fi

echo "$LOG_PREFIX found sprites in $BATCH_FILE"

# Extract the existing A/B/C functions as context for the LLM
EXISTING=$(grep -n "^function drawSprite_${PERSONA}_\|^// " "$BATCH_FILE" | head -200 || true)

# Build a concise system prompt for sprite regen
SYSTEM_PROMPT="You are a pixel art sprite generator for a browser canvas game. Your job is to write 3 NEW drawSprite functions (variants A, B, C) for the persona '${PERSONA}', replacing the existing ones that tied in a vote.

Rules:
- Functions must be named exactly: drawSprite_${PERSONA}_A, drawSprite_${PERSONA}_B, drawSprite_${PERSONA}_C
- Signature: function drawSprite_${PERSONA}_X(ctx, cx, cy)
- Use only ctx.fillStyle and ctx.fillRect — no other canvas API calls
- cx, cy = center-bottom (feet). Body height ~40px, width ~20px centered on cx
- Each variant must look distinctly different from the others and from the existing tied variants
- Include a short comment above each function describing the visual concept (e.g. // Critic A: Punk — torn jacket, spiky hair)
- Output ONLY the 3 JavaScript functions, no markdown fences, no explanations"

# Extract existing functions to give as context (as user message)
EXISTING_FUNCS=$(awk "/^function drawSprite_${PERSONA}_A/,/^}/" "$BATCH_FILE"; echo; awk "/^function drawSprite_${PERSONA}_B/,/^}/" "$BATCH_FILE"; echo; awk "/^function drawSprite_${PERSONA}_C/,/^}/" "$BATCH_FILE")

USER_MSG="The existing sprites for '${PERSONA}' that tied (A got 1 vote, B got 1 vote, C got 1 vote) are shown below. Generate 3 new, clearly distinct variants that voters haven't seen yet. Avoid copying the visual concepts from these tied versions.

EXISTING TIED FUNCTIONS:
${EXISTING_FUNCS}

Output only the 3 new drawSprite_${PERSONA}_A, drawSprite_${PERSONA}_B, drawSprite_${PERSONA}_C functions."

echo "$LOG_PREFIX calling claude to generate new sprite variants..."

# Run claude and capture output
NEW_SPRITES=$(echo "$USER_MSG" | claude -p "$SYSTEM_PROMPT" --output-format text 2>&1)

if [[ -z "$NEW_SPRITES" ]]; then
  echo "$LOG_PREFIX ERROR: claude returned empty output" >&2
  exit 1
fi

# Validate that all 3 functions are present in the output
for VARIANT in A B C; do
  if ! echo "$NEW_SPRITES" | grep -q "function drawSprite_${PERSONA}_${VARIANT}"; then
    echo "$LOG_PREFIX ERROR: claude output missing drawSprite_${PERSONA}_${VARIANT}" >&2
    echo "Claude output was:" >&2
    echo "$NEW_SPRITES" >&2
    exit 1
  fi
done

echo "$LOG_PREFIX all 3 variants present, replacing in $BATCH_FILE"

# Replace the 3 functions in-place using python (handles multi-line blocks cleanly)
python3 - "$BATCH_FILE" "$PERSONA" <<'PYEOF'
import sys, re

batch_file = sys.argv[1]
persona = sys.argv[2]

with open(batch_file, 'r') as f:
    content = f.read()

# Read new sprites from stdin
new_sprites = sys.stdin.read().strip()

# For each variant A/B/C, replace the function block
# A function block starts at "function drawSprite_<persona>_X(" and ends at the first "}" at column 0
for variant in ['A', 'B', 'C']:
    fn_name = f"drawSprite_{persona}_{variant}"
    # Match from the function declaration (possibly preceded by a comment line) to the closing }
    pattern = re.compile(
        r'(?m)^(//[^\n]*\n)?function ' + re.escape(fn_name) + r'\(ctx, cx, cy\).*?^}',
        re.DOTALL | re.MULTILINE
    )
    if not pattern.search(content):
        print(f"ERROR: could not find {fn_name} in {batch_file}", file=sys.stderr)
        sys.exit(1)

# Extract each new variant from the new_sprites block
for variant in ['A', 'B', 'C']:
    fn_name = f"drawSprite_{persona}_{variant}"
    # Find the block in new_sprites: optional comment + function + closing }
    new_pattern = re.compile(
        r'(?m)(^//[^\n]*\n)?^function ' + re.escape(fn_name) + r'\(ctx, cx, cy\).*?^}',
        re.DOTALL | re.MULTILINE
    )
    new_match = new_pattern.search(new_sprites)
    if not new_match:
        print(f"ERROR: could not find {fn_name} in new sprites output", file=sys.stderr)
        sys.exit(1)
    new_block = new_match.group(0).strip()

    old_pattern = re.compile(
        r'(?m)(^//[^\n]*\n)?^function ' + re.escape(fn_name) + r'\(ctx, cx, cy\).*?^}',
        re.DOTALL | re.MULTILINE
    )
    content = old_pattern.sub(new_block, content, count=1)

with open(batch_file, 'w') as f:
    f.write(content)

print(f"Replaced A/B/C for {persona} in {batch_file}")
PYEOF < <(echo "$NEW_SPRITES")

echo "$LOG_PREFIX committing and pushing..."
cd "$SPRITES_DIR"
git add "$(basename "$BATCH_FILE")"
git commit -m "sprites: regenerate ${PERSONA} A/B/C variants after 3-way tie"
git push

echo "$LOG_PREFIX restarting clunger.service..."
systemctl --user restart clunger.service

echo "$LOG_PREFIX done — new ${PERSONA} sprite variants are live"
