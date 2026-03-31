#!/usr/bin/env python3
"""Download missing Bokoen1 HoI4 transcripts via yt-dlp."""

import os
import re
import subprocess
import sys
import time
from pathlib import Path

TRANSCRIPTS_DIR = Path('/mnt/data/data/bokoen1-transcripts')
YT_DLP = os.path.expanduser('~/.local/bin/yt-dlp')


def extract_text_from_vtt(vtt_path: Path) -> str:
    """Extract plain text from a VTT subtitle file."""
    lines = vtt_path.read_text(errors='replace').split('\n')
    texts = []
    seen = set()
    for line in lines:
        line = line.strip()
        if not line or line.startswith('WEBVTT') or line.startswith('Kind:') or \
           line.startswith('Language:') or '-->' in line or line.isdigit():
            continue
        clean = re.sub(r'<[^>]+>', '', line)
        if clean and clean not in seen:
            seen.add(clean)
            texts.append(clean)
    return ' '.join(texts)


def main():
    ids_file = Path('/tmp/hoi4_to_download.txt')
    if not ids_file.exists():
        print("ERROR: /tmp/hoi4_to_download.txt not found")
        sys.exit(1)

    video_ids = [line.strip() for line in ids_file.read_text().strip().split('\n') if line.strip()]
    total = len(video_ids)
    downloaded = 0
    failed = 0
    skipped = 0

    print(f"Starting download of {total} transcripts...")

    for i, vid_id in enumerate(video_ids, 1):
        # Check if already exists
        existing = list(TRANSCRIPTS_DIR.glob(f'{vid_id}_*.txt'))
        if existing:
            skipped += 1
            continue

        print(f'[{i}/{total}] Downloading: {vid_id}')

        try:
            subprocess.run(
                [YT_DLP, '--write-auto-sub', '--sub-lang', 'en',
                 '--skip-download', '--sub-format', 'vtt',
                 '-o', str(TRANSCRIPTS_DIR / '%(id)s_%(title)s.%(ext)s'),
                 f'https://www.youtube.com/watch?v={vid_id}'],
                capture_output=True, text=True, timeout=60
            )

            # Find and convert VTT files
            vtt_files = list(TRANSCRIPTS_DIR.glob(f'{vid_id}*.vtt'))
            converted = False

            for vtt_file in vtt_files:
                # Build txt filename: remove .en from the stem
                stem = vtt_file.name
                # Pattern: ID_Title.en.vtt -> ID_Title.txt
                txt_name = re.sub(r'\.en\.vtt$', '.txt', stem)
                if txt_name == stem:  # fallback if pattern didn't match
                    txt_name = stem.rsplit('.', 1)[0] + '.txt'

                txt_path = TRANSCRIPTS_DIR / txt_name

                if not txt_path.exists():
                    text = extract_text_from_vtt(vtt_file)
                    if text.strip():
                        txt_path.write_text(text)
                        print(f'  Saved: {txt_path.name[:80]}')
                        converted = True
                    else:
                        print(f'  Empty transcript for {vid_id}')

                # Clean up VTT
                try:
                    vtt_file.unlink()
                except Exception:
                    pass

            if converted:
                downloaded += 1
            elif not vtt_files:
                failed += 1
                # print(f'  No subtitles available for {vid_id}')

        except subprocess.TimeoutExpired:
            print(f'  Timeout: {vid_id}')
            failed += 1
        except Exception as e:
            print(f'  Error: {vid_id}: {e}')
            failed += 1

        if i % 50 == 0:
            print(f'=== Progress: {i}/{total} processed, {downloaded} downloaded, {failed} failed, {skipped} skipped ===')

        # Longer delay to avoid YouTube rate limiting (429)
        time.sleep(3)

        # Extra backoff after failures (likely rate limited)
        if not list(TRANSCRIPTS_DIR.glob(f'{vid_id}_*.txt')):
            consecutive_fails = consecutive_fails + 1 if 'consecutive_fails' in dir() else 1
            if consecutive_fails >= 5:
                wait = min(consecutive_fails * 30, 300)
                print(f'  {consecutive_fails} consecutive failures, waiting {wait}s...')
                time.sleep(wait)
        else:
            consecutive_fails = 0

    print(f'\n=== Complete: {downloaded} downloaded, {failed} failed, {skipped} skipped out of {total} ===')


if __name__ == '__main__':
    main()
