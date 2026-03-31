#!/usr/bin/env python3
"""
Ingest Bokoen1 YouTube transcripts into the bokoen1_transcripts Graphiti graph.

Uses graphiti_core directly with FalkorDB. Skips already-ingested episodes.
Downloads missing transcripts via yt-dlp before ingesting.

Usage:
    # Ingest already-downloaded transcripts
    python3 /mnt/data/scripts/ingest_bokoen1.py

    # Also download missing transcripts first
    python3 /mnt/data/scripts/ingest_bokoen1.py --download

    # Limit number of new ingestions
    python3 /mnt/data/scripts/ingest_bokoen1.py --limit 50

    # Download + ingest with limit
    python3 /mnt/data/scripts/ingest_bokoen1.py --download --limit 100
"""

import asyncio
import argparse
import logging
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from datetime import datetime, timezone

# Add graphiti mcp_server to path for imports
sys.path.insert(0, '/mnt/data/graphiti/repo/mcp_server/src')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger(__name__)

TRANSCRIPTS_DIR = Path('/mnt/data/data/bokoen1-transcripts')
DATABASE_NAME = 'bokoen1_transcripts'
GROUP_ID = 'bokoen1_transcripts'
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
YT_DLP = os.path.expanduser('~/.local/bin/yt-dlp')


def get_ingested_episode_names() -> set[str]:
    """Query FalkorDB directly for already-ingested episode names."""
    import subprocess
    result = subprocess.run(
        ['docker', 'exec', 'docker-falkordb-1', 'redis-cli',
         'GRAPH.QUERY', DATABASE_NAME,
         'MATCH (n:Episodic) RETURN n.name'],
        capture_output=True, text=True
    )
    names = set()
    for line in result.stdout.strip().split('\n'):
        line = line.strip()
        if line.startswith('Bokoen1') or line.startswith('Test'):
            names.add(line)
    return names


def filename_to_episode_name(filename: str) -> str:
    """Convert a transcript filename to an episode name.

    Filename format: {video_id}_{title_with_underscores}.txt
    Episode name format: Bokoen1 - {title with spaces}
    """
    # Strip .txt
    stem = filename.rsplit('.', 1)[0]
    # Remove video ID prefix (11 chars + underscore)
    parts = stem.split('_', 1)
    if len(parts) == 2:
        title = parts[1].replace('_', ' ')
    else:
        title = stem.replace('_', ' ')
    return f'Bokoen1 - {title}'


def get_video_id_from_filename(filename: str) -> str:
    """Extract video ID from filename."""
    return filename.split('_', 1)[0]


def download_transcripts(video_ids: list[str], limit: int = 0) -> int:
    """Download transcripts for given video IDs using yt-dlp."""
    TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

    downloaded = 0
    to_download = video_ids[:limit] if limit else video_ids
    total = len(to_download)

    for i, vid_id in enumerate(to_download):
        url = f'https://www.youtube.com/watch?v={vid_id}'
        logger.info(f'Downloading transcript {i+1}/{total}: {vid_id}')

        try:
            result = subprocess.run(
                [YT_DLP, '--write-auto-sub', '--sub-lang', 'en',
                 '--skip-download', '--sub-format', 'vtt',
                 '-o', f'{TRANSCRIPTS_DIR}/%(id)s_%(title)s.%(ext)s',
                 url],
                capture_output=True, text=True, timeout=60
            )

            # Now convert VTT to plain text
            vtt_files = list(TRANSCRIPTS_DIR.glob(f'{vid_id}*.vtt'))
            for vtt_file in vtt_files:
                txt_name = vtt_file.stem.rsplit('.', 1)[0] + '.txt'  # Remove .en from stem
                txt_path = TRANSCRIPTS_DIR / txt_name
                if not txt_path.exists():
                    # Simple VTT to text conversion
                    text = extract_text_from_vtt(vtt_file)
                    if text.strip():
                        txt_path.write_text(text)
                        downloaded += 1
                        logger.info(f'  Saved: {txt_path.name}')
                    else:
                        logger.warning(f'  Empty transcript for {vid_id}')
                vtt_file.unlink()  # Clean up VTT

            if not vtt_files:
                # Try getting auto-generated subs differently
                result2 = subprocess.run(
                    [YT_DLP, '--write-auto-sub', '--sub-lang', 'en',
                     '--skip-download', '--sub-format', 'json3',
                     '-o', f'{TRANSCRIPTS_DIR}/%(id)s_%(title)s.%(ext)s',
                     url],
                    capture_output=True, text=True, timeout=60
                )
                json_files = list(TRANSCRIPTS_DIR.glob(f'{vid_id}*.json3'))
                for jf in json_files:
                    txt_name = jf.stem.rsplit('.', 1)[0] + '.txt'
                    txt_path = TRANSCRIPTS_DIR / txt_name
                    if not txt_path.exists():
                        import json
                        try:
                            data = json.loads(jf.read_text())
                            events = data.get('events', [])
                            texts = []
                            for e in events:
                                segs = e.get('segs', [])
                                for s in segs:
                                    t = s.get('utf8', '').strip()
                                    if t and t != '\n':
                                        texts.append(t)
                            text = ' '.join(texts)
                            if text.strip():
                                txt_path.write_text(text)
                                downloaded += 1
                                logger.info(f'  Saved (json3): {txt_path.name}')
                        except Exception as e:
                            logger.warning(f'  Failed to parse json3 for {vid_id}: {e}')
                    jf.unlink()

        except subprocess.TimeoutExpired:
            logger.warning(f'  Timeout downloading {vid_id}')
        except Exception as e:
            logger.error(f'  Error downloading {vid_id}: {e}')

    return downloaded


def extract_text_from_vtt(vtt_path: Path) -> str:
    """Extract plain text from a VTT subtitle file."""
    lines = vtt_path.read_text().split('\n')
    texts = []
    seen = set()
    for line in lines:
        line = line.strip()
        # Skip headers, timestamps, and empty lines
        if not line or line.startswith('WEBVTT') or line.startswith('Kind:') or \
           line.startswith('Language:') or '-->' in line or line.isdigit():
            continue
        # Remove HTML tags
        clean = re.sub(r'<[^>]+>', '', line)
        if clean and clean not in seen:
            seen.add(clean)
            texts.append(clean)
    return ' '.join(texts)


async def ingest_transcripts(limit: int = 0):
    """Ingest non-ingested transcripts into Graphiti."""
    from dotenv import load_dotenv
    load_dotenv('/mnt/data/graphiti/repo/mcp_server/.env')

    from graphiti_core import Graphiti
    from graphiti_core.driver.falkordb_driver import FalkorDriver
    from graphiti_core.llm_client import OpenAIClient
    from graphiti_core.llm_client.config import LLMConfig as GraphitiLLMConfig
    from graphiti_core.embedder import OpenAIEmbedder
    from graphiti_core.embedder.openai import OpenAIEmbedderConfig
    from graphiti_core.nodes import EpisodeType

    # Get already-ingested names
    ingested = get_ingested_episode_names()
    logger.info(f'Already ingested: {len(ingested)} episodes')

    # Find transcripts to ingest
    all_files = sorted(TRANSCRIPTS_DIR.glob('*.txt'))
    to_ingest = []
    for f in all_files:
        name = filename_to_episode_name(f.name)
        if name not in ingested:
            to_ingest.append((f, name))

    if limit:
        to_ingest = to_ingest[:limit]

    if not to_ingest:
        logger.info('No new transcripts to ingest.')
        return 0

    logger.info(f'Will ingest {len(to_ingest)} new transcripts')

    # Initialize Graphiti with FalkorDB
    api_key = os.environ.get('OPENAI_API_KEY', '')

    falkor_driver = FalkorDriver(
        host='localhost',
        port=6379,
        database=DATABASE_NAME,
    )

    llm_config = GraphitiLLMConfig(
        api_key=api_key,
        model='gpt-4o-mini',
    )
    llm_client = OpenAIClient(config=llm_config)
    embedder_config = OpenAIEmbedderConfig(api_key=api_key)
    embedder = OpenAIEmbedder(config=embedder_config)

    client = Graphiti(
        graph_driver=falkor_driver,
        llm_client=llm_client,
        embedder=embedder,
        max_coroutines=5,
    )

    # Build indices
    try:
        await client.build_indices_and_constraints()
    except Exception as e:
        logger.warning(f'Index build warning (may be ok): {e}')

    ingested_count = 0
    failed_count = 0

    for i, (filepath, name) in enumerate(to_ingest):
        logger.info(f'[{i+1}/{len(to_ingest)}] Ingesting: {name}')

        try:
            content = filepath.read_text().strip()
            if not content:
                logger.warning(f'  Skipping empty file: {filepath.name}')
                continue

            # Truncate very long transcripts to ~15000 chars to avoid token limits
            if len(content) > 15000:
                content = content[:15000] + '... [transcript truncated]'

            await client.add_episode(
                name=name,
                episode_body=content,
                source=EpisodeType.text,
                source_description='Bokoen1 YouTube HoI4 MP In A Nutshell transcript',
                group_id=GROUP_ID,
                reference_time=datetime.now(timezone.utc),
            )

            ingested_count += 1
            logger.info(f'  Done ({ingested_count} total)')

            # Small delay to avoid rate limits
            if i > 0 and i % 10 == 0:
                logger.info(f'  Progress: {ingested_count} ingested, {failed_count} failed')
                await asyncio.sleep(2)

        except Exception as e:
            failed_count += 1
            logger.error(f'  FAILED: {e}')
            # On rate limit, wait longer
            if '429' in str(e) or 'rate' in str(e).lower():
                logger.info('  Rate limited, waiting 30s...')
                await asyncio.sleep(30)
            else:
                await asyncio.sleep(1)

    await client.close()

    logger.info(f'\nIngestion complete: {ingested_count} succeeded, {failed_count} failed')
    return ingested_count


async def main():
    parser = argparse.ArgumentParser(description='Ingest Bokoen1 transcripts into Graphiti')
    parser.add_argument('--download', action='store_true', help='Download missing transcripts first')
    parser.add_argument('--download-limit', type=int, default=100, help='Max transcripts to download')
    parser.add_argument('--limit', type=int, default=0, help='Max transcripts to ingest (0=all)')
    args = parser.parse_args()

    if args.download:
        logger.info('=== Phase 1: Downloading missing transcripts ===')
        # Get list of already-downloaded video IDs
        existing_ids = {get_video_id_from_filename(f.name) for f in TRANSCRIPTS_DIR.glob('*.txt')}

        # Get all HoI4 video IDs from channel
        result = subprocess.run(
            [YT_DLP, '--flat-playlist', '--print', 'id',
             'https://www.youtube.com/@Bokoen1/videos'],
            capture_output=True, text=True, timeout=120
        )
        all_ids = result.stdout.strip().split('\n')

        # Filter to just the ones we don't have
        missing_ids = [vid for vid in all_ids if vid not in existing_ids]
        logger.info(f'Missing transcripts: {len(missing_ids)} (have {len(existing_ids)})')

        if missing_ids:
            downloaded = download_transcripts(missing_ids, limit=args.download_limit)
            logger.info(f'Downloaded {downloaded} new transcripts')

    logger.info('=== Ingesting transcripts into Graphiti ===')
    count = await ingest_transcripts(limit=args.limit)
    logger.info(f'Total newly ingested: {count}')


if __name__ == '__main__':
    asyncio.run(main())
