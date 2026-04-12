"""
Activities for the job board research workflow.

Fetches existing jobs from SQLite, researches new postings via LLM API,
inserts results, and optionally notifies Discord.

Backend selection: Anthropic (if key at /mnt/data/secrets/anthropic_api_key),
otherwise xAI/Grok (key at /mnt/data/secrets/xai_api_key).
"""

import json
import logging
import os
import re
import sqlite3
from pathlib import Path
from typing import Any

import httpx
from temporalio import activity

logger = logging.getLogger(__name__)

DB_PATH = "/mnt/data/labs/jobboard/jobs.db"
API_KEY_PATH = "/mnt/data/secrets/anthropic_api_key"
XAI_KEY_PATH = "/mnt/data/secrets/xai_api_key"
XAI_API_BASE = "https://api.x.ai/v1/chat/completions"
DISCORD_BOT_TOKEN_ENV = "DISCORD_BOT_TOKEN"

RESUME_FALLBACK = (
    "Staff/Principal engineer, 15yr experience, distributed systems, "
    "platform architecture, JS/TS/Go"
)

RESUME_URL = "https://resume.jxh.io"

HN_HIRING_SEARCH_URL = "https://hn.algolia.com/api/v1/search"
HN_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item/{}.json"


def _get_anthropic_api_key() -> str | None:
    """Load Anthropic API key from file or environment. Returns None if unavailable."""
    key_path = Path(API_KEY_PATH)
    if key_path.exists():
        return key_path.read_text().strip()
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    return key if key else None


def _get_xai_api_key() -> str | None:
    """Load xAI API key from file or environment."""
    key_path = Path(XAI_KEY_PATH)
    if key_path.exists():
        return key_path.read_text().strip()
    key = os.environ.get("XAI_API_KEY", "")
    return key if key else None


def _get_llm_backend() -> tuple[str, str]:
    """Determine which LLM backend to use. Returns (backend_name, api_key).
    Prefers Anthropic; falls back to xAI/Grok."""
    anthropic_key = _get_anthropic_api_key()
    if anthropic_key:
        return ("anthropic", anthropic_key)
    xai_key = _get_xai_api_key()
    if xai_key:
        return ("xai", xai_key)
    raise RuntimeError(
        "No LLM API key found. Checked: %s, %s, ANTHROPIC_API_KEY env, XAI_API_KEY env"
        % (API_KEY_PATH, XAI_KEY_PATH)
    )


def _get_discord_bot_token() -> str:
    """Load Discord bot token from environment."""
    env_path = Path("/home/clungus/.claude/channels/discord/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("DISCORD_BOT_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    token = os.environ.get(DISCORD_BOT_TOKEN_ENV, "")
    if not token:
        raise RuntimeError("No Discord bot token found")
    return token


def _ensure_db() -> sqlite3.Connection:
    """Open SQLite connection and ensure the jobs table exists."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            company       TEXT NOT NULL,
            title         TEXT NOT NULL,
            link          TEXT NOT NULL UNIQUE,
            salary_min    INTEGER,
            salary_max    INTEGER,
            level         TEXT,
            industry      TEXT,
            location      TEXT,
            remote        TEXT CHECK(remote IN ('remote','hybrid','onsite','unknown')) DEFAULT 'unknown',
            source        TEXT,
            relevance     REAL,
            fit_notes     TEXT,
            tags          TEXT,
            posted_at     TEXT,
            discovered_at TEXT DEFAULT (datetime('now')),
            status        TEXT CHECK(status IN ('new','interested','applied','rejected','stale')) DEFAULT 'new',
            hidden        INTEGER DEFAULT 0
        )
    """)
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_link ON jobs(link)")
    conn.commit()
    return conn


@activity.defn
async def fetch_existing_jobs() -> list[dict]:
    """Read all jobs from the jobboard SQLite DB for dedup context."""
    conn = _ensure_db()
    try:
        rows = conn.execute("SELECT company, title, link FROM jobs").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


async def _fetch_hn_whos_hiring() -> str:
    """Fetch the latest HN 'Who is hiring?' thread content."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            HN_HIRING_SEARCH_URL,
            params={
                "query": "Ask HN: Who is hiring?",
                "tags": "story",
                "hitsPerPage": 1,
                "restrictSearchableAttributes": "title",
            },
        )
        resp.raise_for_status()
        data = resp.json()

        if not data.get("hits"):
            return ""

        story_id = data["hits"][0]["objectID"]
        story_title = data["hits"][0].get("title", "")
        logger.info("Found HN hiring thread: %s (id=%s)", story_title, story_id)

        item_resp = await client.get(HN_ITEM_URL.format(story_id))
        item_resp.raise_for_status()
        item_data = item_resp.json()

        kids = item_data.get("kids", [])
        if not kids:
            return f"Thread: {story_title}\n(no comments found)"

        comments = []
        for kid_id in kids[:50]:
            try:
                c_resp = await client.get(HN_ITEM_URL.format(kid_id))
                c_resp.raise_for_status()
                c_data = c_resp.json()
                text = c_data.get("text", "")
                if text:
                    comments.append(text)
            except Exception as e:
                logger.warning("Failed to fetch HN comment %s: %s", kid_id, e)
                continue

        return f"Thread: {story_title}\n\n" + "\n\n---\n\n".join(comments)


async def _fetch_resume() -> str:
    """Fetch resume content from resume.jxh.io, stripping HTML to plain text."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(RESUME_URL)
        resp.raise_for_status()
        html = resp.text
        text = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL)
        text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text


@activity.defn
async def research_and_score_jobs(existing_jobs: list[dict]) -> list[dict]:
    """Research new job postings using LLM API and score them for relevance.

    Uses Anthropic Claude if API key available, otherwise falls back to xAI Grok.
    DO NOT replace this with claude CLI subprocess -- it does not work reliably
    in the temporal worker context. The xAI API fallback is intentional.
    """
    resume_content = ""
    try:
        resume_content = await _fetch_resume()
        logger.info("Fetched live resume: %d chars", len(resume_content))
    except Exception as e:
        logger.warning("Failed to fetch resume from %s: %s -- using fallback", RESUME_URL, e)

    if not resume_content:
        resume_content = RESUME_FALLBACK

    hn_content = ""
    try:
        hn_content = await _fetch_hn_whos_hiring()
        if hn_content:
            logger.info("Fetched HN content: %d chars", len(hn_content))
    except Exception as e:
        logger.warning("Failed to fetch HN Who's Hiring: %s", e)

    if not hn_content:
        hn_content = "(No HN content available this cycle)"

    existing_summary = "\n".join(
        f"- {j['company']} | {j['title']} | {j['link']}" for j in existing_jobs
    )
    if not existing_summary:
        existing_summary = "(no existing jobs)"

    system_prompt = """You are a job research assistant. Extract job postings from the provided
source content that match the candidate profile. Score each posting 0.0-1.0 for relevance
to the candidate. Only include postings scoring >= 0.5.

IMPORTANT: Do NOT include any jobs that appear in the existing jobs list (dedup by company+title or link).

Return ONLY a JSON array (no markdown, no explanation) where each element has these exact keys:
- company (string)
- title (string)
- link (string, the URL to apply or the source URL)
- salary_min (integer or null)
- salary_max (integer or null)
- level (string: "Staff", "Principal", "Distinguished", "Senior", "Lead", or null)
- industry (string)
- location (string)
- remote (string: "remote", "hybrid", "onsite", or "unknown")
- source (string: where you found it, e.g. "HN Who's Hiring April 2026")
- relevance (float 0.0-1.0)
- fit_notes (string: 1-2 sentences on why this fits or doesn't)
- tags (string: comma-separated relevant tags)

If no relevant jobs are found, return an empty array: []"""

    user_msg = f"""## Candidate Profile
{resume_content}

## Existing Jobs (DO NOT duplicate these)
{existing_summary}

## Source: Hacker News "Who is Hiring?"
{hn_content[:80000]}"""

    backend, api_key = _get_llm_backend()
    logger.info("Using LLM backend: %s", backend)

    text = ""
    async with httpx.AsyncClient(timeout=120.0) as client:
        if backend == "anthropic":
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-6",
                    "max_tokens": 8192,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_msg}],
                },
            )
            resp.raise_for_status()
            result = resp.json()
            for block in result.get("content", []):
                if block.get("type") == "text":
                    text += block["text"]
        else:
            resp = await client.post(
                XAI_API_BASE,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "grok-3",
                    "max_tokens": 8192,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_msg},
                    ],
                },
            )
            resp.raise_for_status()
            result = resp.json()
            choices = result.get("choices", [])
            if choices:
                text = choices[0].get("message", {}).get("content", "")

    if not text.strip():
        logger.warning("Empty response from %s API", backend)
        return []

    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)

    try:
        jobs = json.loads(text)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse LLM response as JSON: %s\nResponse: %s", e, text[:500])
        return []

    if not isinstance(jobs, list):
        logger.error("LLM response is not a list: %s", type(jobs))
        return []

    logger.info("LLM (%s) returned %d job postings", backend, len(jobs))
    return jobs


@activity.defn
async def insert_new_jobs(jobs: list[dict]) -> int:
    """Insert new jobs into SQLite. Returns count of inserted rows."""
    if not jobs:
        return 0

    conn = _ensure_db()
    inserted = 0
    try:
        for job in jobs:
            try:
                conn.execute(
                    """INSERT OR IGNORE INTO jobs
                       (company, title, link, salary_min, salary_max, level, industry,
                        location, remote, source, relevance, fit_notes, tags, status)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')""",
                    (
                        job.get("company", "Unknown"),
                        job.get("title", "Unknown"),
                        job.get("link", ""),
                        job.get("salary_min"),
                        job.get("salary_max"),
                        job.get("level"),
                        job.get("industry"),
                        job.get("location"),
                        job.get("remote", "unknown"),
                        job.get("source"),
                        job.get("relevance"),
                        job.get("fit_notes"),
                        job.get("tags"),
                    ),
                )
                if conn.total_changes > inserted:
                    inserted = conn.total_changes
            except Exception as e:
                logger.warning("Failed to insert job %s at %s: %s", job.get("title"), job.get("company"), e)
                continue
        conn.commit()
    finally:
        conn.close()

    logger.info("Inserted %d new jobs", inserted)
    return inserted


@activity.defn
async def notify_discord_new_jobs(jobs: list[dict], channel_id: str) -> str:
    """Post high-relevance jobs to Discord. Returns status string."""
    high_rel = [j for j in jobs if (j.get("relevance") or 0) > 0.7]
    if not high_rel:
        return "no high-relevance jobs to notify"

    lines = ["**New Job Postings (relevance > 0.7):**\n"]
    for j in sorted(high_rel, key=lambda x: x.get("relevance", 0), reverse=True):
        rel = j.get("relevance", 0)
        company = j.get("company", "?")
        title = j.get("title", "?")
        link = j.get("link", "")
        level = j.get("level") or ""
        remote = j.get("remote") or ""
        extra = " | ".join(filter(None, [level, remote]))
        if extra:
            extra = f" ({extra})"
        lines.append(f"• **{company}** — {title}{extra} — score: {rel:.2f}")
        if link:
            lines.append(f"  {link}")

    lines.append(f"\n*{len(high_rel)} new matches found. View all at labs.clung.us/jobboard*")
    message = "\n".join(lines)

    from .inject_act import _do_inject
    await _do_inject(message, channel_id, user="jobboard-research")

    logger.info("Notified Discord with %d high-relevance jobs", len(high_rel))
    return f"notified {len(high_rel)} jobs"
