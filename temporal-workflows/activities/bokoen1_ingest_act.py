"""
Bokoen1 transcript ingestion activity.

Downloads missing Bokoen1 YouTube transcripts via yt-dlp and ingests them
into the bokoen1_transcripts Graphiti graph. Tracks progress in a status
file so interrupted runs can be resumed.
"""
from asyncio import sleep
from json import dumps as json_dumps, loads as json_loads, JSONDecodeError
from logging import getLogger
from re import sub as re_sub
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from temporalio import activity

from .constants import BASE_DIR, FALKORDB_HOST, FALKORDB_PORT, GRAPHITI_ENV
from .utils import get_openai_key

logger = getLogger(__name__)

TRANSCRIPTS_DIR = Path(BASE_DIR) / "data/bokoen1-transcripts"
STATUS_FILE = Path(BASE_DIR) / "data/bokoen1-ingestion-status.json"
DATABASE_NAME = "bokoen1_transcripts"
YT_DLP = str(Path.home() / ".local/bin/yt-dlp")


def _load_status() -> dict:
    try:
        return json_loads(STATUS_FILE.read_text())
    except (FileNotFoundError, JSONDecodeError):
        return {}


def _save_status(data: dict) -> None:
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATUS_FILE.write_text(json_dumps(data, indent=2))


def _get_ingested_episode_names() -> set[str]:
    """Query FalkorDB for already-ingested episode names."""
    result = subprocess.run(
        ["docker", "exec", "docker-falkordb-1", "redis-cli",
         "GRAPH.QUERY", DATABASE_NAME,
         "MATCH (n:Episodic) RETURN n.name"],
        capture_output=True, text=True
    )
    names = set()
    for line in result.stdout.strip().split("\n"):
        line = line.strip()
        if line.startswith("Bokoen1") or line.startswith("Test"):
            names.add(line)
    return names


def _filename_to_episode_name(filename: str) -> str:
    stem = filename.rsplit(".", 1)[0]
    parts = stem.split("_", 1)
    if len(parts) == 2:
        title = parts[1].replace("_", " ")
    else:
        title = stem.replace("_", " ")
    return f"Bokoen1 - {title}"


def _get_video_id_from_filename(filename: str) -> str:
    return filename.split("_", 1)[0]


def _extract_text_from_vtt(vtt_path: Path) -> str:
    lines = vtt_path.read_text().split("\n")
    texts = []
    seen: set[str] = set()
    for line in lines:
        line = line.strip()
        if not line or line.startswith("WEBVTT") or line.startswith("Kind:") or \
           line.startswith("Language:") or "-->" in line or line.isdigit():
            continue
        clean = re_sub(r"<[^>]+>", "", line)
        if clean and clean not in seen:
            seen.add(clean)
            texts.append(clean)
    return " ".join(texts)


def _download_transcripts(video_ids: list[str], limit: int = 100) -> int:
    TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    downloaded = 0
    to_download = video_ids[:limit] if limit else video_ids
    total = len(to_download)

    for i, vid_id in enumerate(to_download):
        url = f"https://www.youtube.com/watch?v={vid_id}"
        logger.info("Downloading transcript %d/%d: %s", i + 1, total, vid_id)

        try:
            subprocess.run(
                [YT_DLP, "--write-auto-sub", "--sub-lang", "en",
                 "--skip-download", "--sub-format", "vtt",
                 "-o", f"{TRANSCRIPTS_DIR}/%(id)s_%(title)s.%(ext)s",
                 url],
                capture_output=True, text=True, timeout=60
            )

            vtt_files = list(TRANSCRIPTS_DIR.glob(f"{vid_id}*.vtt"))
            for vtt_file in vtt_files:
                txt_name = vtt_file.stem.rsplit(".", 1)[0] + ".txt"
                txt_path = TRANSCRIPTS_DIR / txt_name
                if not txt_path.exists():
                    text = _extract_text_from_vtt(vtt_file)
                    if text.strip():
                        txt_path.write_text(text)
                        downloaded += 1
                        logger.info("  Saved: %s", txt_path.name)
                    else:
                        logger.warning("  Empty transcript for %s", vid_id)
                vtt_file.unlink()

            if not vtt_files:
                subprocess.run(
                    [YT_DLP, "--write-auto-sub", "--sub-lang", "en",
                     "--skip-download", "--sub-format", "json3",
                     "-o", f"{TRANSCRIPTS_DIR}/%(id)s_%(title)s.%(ext)s",
                     url],
                    capture_output=True, text=True, timeout=60
                )
                json_files = list(TRANSCRIPTS_DIR.glob(f"{vid_id}*.json3"))
                for jf in json_files:
                    txt_name = jf.stem.rsplit(".", 1)[0] + ".txt"
                    txt_path = TRANSCRIPTS_DIR / txt_name
                    if not txt_path.exists():
                        try:
                            data = json_loads(jf.read_text())
                            events = data.get("events", [])
                            texts = []
                            for event in events:
                                segs = event.get("segs", [])
                                for seg in segs:
                                    seg_text = seg.get("utf8", "").strip()
                                    if seg_text and seg_text != "\n":
                                        texts.append(seg_text)
                            text = " ".join(texts)
                            if text.strip():
                                txt_path.write_text(text)
                                downloaded += 1
                                logger.info("  Saved (json3): %s", txt_path.name)
                        except Exception as exc:
                            logger.warning("  Failed to parse json3 for %s: %s", vid_id, exc)
                    jf.unlink()

        except subprocess.TimeoutExpired:
            logger.warning("  Timeout downloading %s", vid_id)
        except Exception as exc:
            logger.error("  Error downloading %s: %s", vid_id, exc)

    return downloaded


async def _ingest_transcripts(limit: int = 0) -> int:
    from dotenv import load_dotenv
    load_dotenv(GRAPHITI_ENV)

    from graphiti_core import Graphiti
    from graphiti_core.driver.falkordb_driver import FalkorDriver
    from graphiti_core.llm_client import OpenAIClient
    from graphiti_core.llm_client.config import LLMConfig as GraphitiLLMConfig
    from graphiti_core.embedder import OpenAIEmbedder
    from graphiti_core.embedder.openai import OpenAIEmbedderConfig
    from graphiti_core.nodes import EpisodeType

    api_key = get_openai_key()

    ingested_names = _get_ingested_episode_names()
    logger.info("Already ingested: %d episodes", len(ingested_names))

    all_files = sorted(TRANSCRIPTS_DIR.glob("*.txt"))
    to_ingest = []
    for path in all_files:
        name = _filename_to_episode_name(path.name)
        if name not in ingested_names:
            to_ingest.append((path, name))

    if limit:
        to_ingest = to_ingest[:limit]

    if not to_ingest:
        logger.info("No new transcripts to ingest.")
        return 0

    logger.info("Will ingest %d new transcripts", len(to_ingest))

    # Update status file
    status = _load_status()
    status.update({
        "status": "in_progress",
        "ingested": status.get("ingested", 0),
        "transcripts_downloaded": len(all_files),
        "transcript_dir": str(TRANSCRIPTS_DIR),
        "started_at": datetime.now(timezone.utc).isoformat(),
    })
    _save_status(status)

    falkor_driver = FalkorDriver(host=FALKORDB_HOST, port=FALKORDB_PORT, database=DATABASE_NAME)
    llm_config = GraphitiLLMConfig(api_key=api_key, model="gpt-4o-mini")
    llm_client = OpenAIClient(config=llm_config)
    embedder_config = OpenAIEmbedderConfig(api_key=api_key)
    embedder = OpenAIEmbedder(config=embedder_config)

    client = Graphiti(
        graph_driver=falkor_driver,
        llm_client=llm_client,
        embedder=embedder,
        max_coroutines=5,
    )

    try:
        await client.build_indices_and_constraints()
    except Exception as exc:
        logger.warning("Index build warning (may be ok): %s", exc)

    ingested_count = 0
    failed_count = 0

    for i, (filepath, name) in enumerate(to_ingest):
        activity.heartbeat(f"processed {i}/{len(to_ingest)}: {name}")
        logger.info("[%d/%d] Ingesting: %s", i + 1, len(to_ingest), name)

        try:
            content = filepath.read_text().strip()
            if not content:
                logger.warning("  Skipping empty file: %s", filepath.name)
                continue

            if len(content) > 15000:
                content = content[:15000] + "... [transcript truncated]"

            await client.add_episode(
                name=name,
                episode_body=content,
                source=EpisodeType.text,
                source_description="Bokoen1 YouTube HoI4 MP In A Nutshell transcript",
                group_id=DATABASE_NAME,
                reference_time=datetime.now(timezone.utc),
            )

            ingested_count += 1
            logger.info("  Done (%d total)", ingested_count)

        except Exception as exc:
            failed_count += 1
            logger.error("  FAILED: %s", exc)
            if "429" in str(exc) or "rate" in str(exc).lower():
                logger.info("  Rate limited, waiting 30s...")
                await sleep(30)
            else:
                await sleep(1)

    await client.close()

    # Update final status
    status.update({
        "status": "done" if failed_count == 0 else "partial",
        "ingested": ingested_count,
        "failed": failed_count,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    })
    _save_status(status)

    logger.info("Ingestion complete: %d succeeded, %d failed", ingested_count, failed_count)
    return ingested_count


@activity.defn
async def run_bokoen1_ingest(download: bool = False, download_limit: int = 100, ingest_limit: int = 0) -> str:
    """Ingest Bokoen1 YouTube transcripts into Graphiti.

    Args:
        download: If True, download missing transcripts via yt-dlp first.
        download_limit: Maximum number of new transcripts to download.
        ingest_limit: Maximum number of transcripts to ingest (0 = all pending).
    """
    if download:
        logger.info("=== Phase 1: Downloading missing transcripts ===")
        existing_ids = {_get_video_id_from_filename(p.name) for p in TRANSCRIPTS_DIR.glob("*.txt")}

        result = subprocess.run(
            [YT_DLP, "--flat-playlist", "--print", "id",
             "https://www.youtube.com/@Bokoen1/videos"],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode != 0:
            raise RuntimeError(f"yt-dlp playlist fetch failed: {result.stderr.strip()}")

        all_ids = [v for v in result.stdout.strip().split("\n") if v]
        missing_ids = [vid for vid in all_ids if vid not in existing_ids]
        logger.info("Missing transcripts: %d (have %d)", len(missing_ids), len(existing_ids))

        if missing_ids:
            downloaded = _download_transcripts(missing_ids, limit=download_limit)
            logger.info("Downloaded %d new transcripts", downloaded)

    logger.info("=== Ingesting transcripts into Graphiti ===")
    count = await _ingest_transcripts(limit=ingest_limit)
    summary = f"Bokoen1 ingestion complete. Newly ingested: {count} transcripts."
    logger.info(summary)
    return summary
