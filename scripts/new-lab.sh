#!/bin/bash
# Usage: new-lab.sh <name> [title] [description]
set -euo pipefail

NAME=$1
TITLE=${2:-$NAME}
DESC=${3:-"A labs experiment"}
TEMPLATE=/mnt/data/labs/template
DEST=/mnt/data/labs/$NAME

if [[ -z "$NAME" ]]; then
  echo "Usage: new-lab.sh <name> [title] [description]" >&2
  exit 1
fi

if [[ -d "$DEST" ]]; then
  echo "Error: lab '$NAME' already exists at $DEST" >&2
  exit 1
fi

# Find an available port starting from 8100
PORT=8100
while true; do
  # Check if port is in use by any existing lab.json
  IN_USE=$(grep -rl "\"port\": $PORT" /mnt/data/labs/*/lab.json 2>/dev/null || true)
  if [[ -z "$IN_USE" ]]; then
    break
  fi
  PORT=$((PORT + 1))
done

echo "Creating lab '$NAME' at $DEST (port $PORT)..."

cp -r "$TEMPLATE" "$DEST"

# Update lab.json
cat > "$DEST/lab.json" <<EOF
{
  "name": "$NAME",
  "title": "$TITLE",
  "description": "$DESC",
  "port": $PORT,
  "status": "active"
}
EOF

# Update package.json name
sed -i "s/\"name\": \"template\"/\"name\": \"$NAME\"/" "$DEST/package.json"

# Update src/index.ts LAB_NAME and PORT
sed -i "s/const LAB_NAME = \"template\"/const LAB_NAME = \"$NAME\"/" "$DEST/src/index.ts"
sed -i "s/const PORT = 8100/const PORT = $PORT/" "$DEST/src/index.ts"

echo ""
echo "Lab '$NAME' created at $DEST"
echo ""
echo "Next steps:"
echo "  1. cd $DEST"
echo "  2. Edit src/index.ts to build your experiment"
echo "  3. Start it: bun run src/index.ts"
echo "  4. It will auto-appear at https://labs.clung.us/$NAME/"
echo ""
echo "To run as a service:"
echo "  systemctl --user start labs-router.service  # (already running)"
echo "  # Run your lab however you like — systemd unit, tmux, etc."
