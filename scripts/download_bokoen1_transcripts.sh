#!/bin/bash
# Download missing Bokoen1 HoI4 transcripts
# Reads video IDs from /tmp/hoi4_to_download.txt
# Saves to /mnt/data/data/bokoen1-transcripts/

TRANSCRIPTS_DIR="/mnt/data/data/bokoen1-transcripts"
YT_DLP="$HOME/.local/bin/yt-dlp"
TOTAL=$(wc -l < /tmp/hoi4_to_download.txt)
COUNT=0
DOWNLOADED=0
FAILED=0

echo "Starting download of $TOTAL transcripts..."

while IFS= read -r vid_id; do
    COUNT=$((COUNT + 1))

    # Skip if already exists
    if ls "$TRANSCRIPTS_DIR/${vid_id}_"* 2>/dev/null | grep -q .; then
        echo "[$COUNT/$TOTAL] Already exists: $vid_id"
        continue
    fi

    echo "[$COUNT/$TOTAL] Downloading: $vid_id"

    # Try to get auto-generated subtitles
    $YT_DLP --write-auto-sub --sub-lang en --skip-download \
        --sub-format vtt \
        -o "$TRANSCRIPTS_DIR/%(id)s_%(title)s.%(ext)s" \
        "https://www.youtube.com/watch?v=$vid_id" 2>/dev/null

    # Convert VTT to plain text
    for vtt_file in "$TRANSCRIPTS_DIR/${vid_id}"*.vtt; do
        [ -f "$vtt_file" ] || continue
        # Remove the .en part from the extension
        txt_file="${vtt_file%.en.vtt}.txt"
        if [ ! -f "$txt_file" ]; then
            # Simple VTT to text: strip timestamps, tags, dupes
            python3 -c "
import re, sys
lines = open('$vtt_file').read().split('\n')
seen, texts = set(), []
for line in lines:
    line = line.strip()
    if not line or 'WEBVTT' in line or 'Kind:' in line or 'Language:' in line or '-->' in line or line.isdigit():
        continue
    clean = re.sub(r'<[^>]+>', '', line)
    if clean and clean not in seen:
        seen.add(clean)
        texts.append(clean)
text = ' '.join(texts)
if text.strip():
    open('$txt_file', 'w').write(text)
    print(f'  Saved: $(basename "$txt_file")')
else:
    print('  Empty transcript')
" 2>/dev/null
        fi
        rm -f "$vtt_file"
    done

    # Check if we got a txt file
    if ls "$TRANSCRIPTS_DIR/${vid_id}_"*.txt 2>/dev/null | grep -q .; then
        DOWNLOADED=$((DOWNLOADED + 1))
    else
        FAILED=$((FAILED + 1))
    fi

    # Progress every 50
    if [ $((COUNT % 50)) -eq 0 ]; then
        echo "=== Progress: $COUNT/$TOTAL processed, $DOWNLOADED downloaded, $FAILED failed ==="
    fi

    # Small delay to be nice to YouTube
    sleep 0.5

done < /tmp/hoi4_to_download.txt

echo "=== Download complete: $DOWNLOADED succeeded, $FAILED failed out of $TOTAL ==="
