#!/usr/bin/env bash
# Build clungiverse v2 client bundle with cache-busting hash in clungiverse.html
set -euo pipefail

OUTDIR="/mnt/data/hello-world/static/clungiverse"
HTML="/mnt/data/hello-world/clungiverse.html"
SRCDIR="$(cd "$(dirname "$0")" && pwd)"

cd "$SRCDIR"
bun build src/main.ts --outdir "$OUTDIR" --target browser

HASH=$(md5sum "$OUTDIR/main.js" | cut -c1-8)

# Update the script src in the HTML to include the new hash
sed -i -E "s|/clungiverse/main\.js\?v=[a-f0-9]+|/clungiverse/main.js?v=$HASH|" "$HTML"

echo "Built clungiverse v2 client -> $OUTDIR/main.js (hash: $HASH)"
