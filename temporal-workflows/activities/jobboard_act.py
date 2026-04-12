"""
Activities for the job board research workflow.

Fetches existing jobs from SQLite, researches new postings via Claude CLI,
inserts results, and optionally notifies Discord.
"""

import asyncio
import json
import logging
import os
import re
import sqlite3
from pathlib import Path

import httpx
from temporalio import activity

logger = logging.getLogger(__name__)

DB_PATH = "/mnt/data/labs/jobboard/jobs.db"
CLAUDE_CLI = "/home/clungus/.local/bin/claude"
DISCORD_BOT_TOKEN_ENV = "DISCORD_BOT_TOKEN"

RESUME_FALLBACK = (
    "Staff/Principal engineer, 15yr experience, distributed systems, "
    "platform architecture, JS/TS/Go"
)

RESUME_URL = "https://resume.jxh.io"

HN_HIRING_SEARCH_URL = "https://hn.algolia.com/api/v1/search"
HN_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item/{}.json"

# Additional job sources: (name, url)
EXTRA_JOB_SOURCES = [
    ("Levels.fyi Staff/Principal", "https://www.levels.fyi/jobs?title=Staff+Engineer&title=Principal+Engineer&title=Senior+Staff+Engineer"),
    ("Stripe Careers", "https://boards.greenhouse.io/stripe"),
    ("Cloudflare Careers", "https://www.cloudflare.com/careers/jobs/"),
    ("Vercel Careers", "https://jobs.ashbyhq.com/vercel"),
    ("Anthropic Careers (Greenhouse)", "https://job-boards.greenhouse.io/anthropic"),
    ("Anthropic Careers (Ashby)", "https://jobs.ashbyhq.com/anthropic"),
    ("Databricks Careers", "https://www.databricks.com/company/careers"),
    ("Netflix Jobs", "https://jobs.netflix.com/search"),
    ("Meta Careers", "https://www.metacareers.com/jobs"),
    ("Google Careers", "https://www.google.com/about/careers/applications/jobs/results/?q=Staff+Software+Engineer&location=San+Francisco%2C+CA%2C+USA&hl=en"),
    ("YC Work at a Startup", "https://www.workatastartup.com/jobs?role=eng&type=fullTime"),
    ("Built In", "https://builtin.com/jobs?search=principal+engineer"),
    # Frontiers
    ("OpenAI Careers", "https://openai.com/careers/search"),
    ("NVIDIA Careers", "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"),
    ("Intel Careers", "https://jobs.intel.com/en/search-jobs"),
    # SaaS
    ("CrowdStrike Careers", "https://www.crowdstrike.com/careers/"),
    ("Okta Careers", "https://www.okta.com/company/careers/"),
    ("ServiceNow Careers", "https://careers.servicenow.com/"),
    # Neoclouds
    ("Crusoe Energy Careers", "https://boards.greenhouse.io/crusoe"),
    ("CoreWeave Careers", "https://boards.greenhouse.io/coreweave"),
    ("Nebius Careers", "https://boards.greenhouse.io/nebius"),
    ("FluidStack Careers", "https://jobs.ashbyhq.com/fluidstack"),
    ("Lambda Careers", "https://jobs.ashbyhq.com/lambda"),
    ("Together AI Careers", "https://jobs.ashbyhq.com/together-ai"),
    # Chad Corps
    ("Anduril Careers", "https://jobs.lever.co/anduril"),
    ("Palantir Careers", "https://www.palantir.com/careers/"),
    ("Coinbase Careers", "https://www.coinbase.com/careers/positions"),
    # Artisanal
    ("Valve Careers", "https://www.valvesoftware.com/en/jobs"),
    # Normie but good
    ("Dropbox Careers", "https://jobs.dropbox.com/all-jobs"),
    ("Zillow Careers", "https://zillow.wd5.myworkdayjobs.com/Zillow_Group_Careers"),
    ("Reddit Careers", "https://boards.greenhouse.io/reddit"),
    ("Apple Careers", "https://jobs.apple.com/en-us/search?sort=relevance&search=staff%20engineer"),
    # Prediction markets
    ("Kalshi Careers", "https://boards.greenhouse.io/kalshi"),
    ("Polymarket Careers", "https://boards.greenhouse.io/polymarket"),
]

MAX_SOURCE_CHARS = 30000
MAX_TOTAL_PROMPT_CHARS = 100000


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


def _strip_html(html: str) -> str:
    """Strip HTML tags and collapse whitespace to plain text."""
    text = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL)
    text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


async def _fetch_extra_source(name: str, url: str) -> tuple[str, str]:
    """Fetch a single job source page. Returns (name, text_content)."""
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(url, headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        })
        resp.raise_for_status()
        text = _strip_html(resp.text)
        return (name, text[:MAX_SOURCE_CHARS])


async def _fetch_all_extra_sources() -> list[tuple[str, str]]:
    """Fetch all extra job sources concurrently. Skip failures."""
    tasks = [_fetch_extra_source(name, url) for name, url in EXTRA_JOB_SOURCES]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    sources = []
    for i, result in enumerate(results):
        name = EXTRA_JOB_SOURCES[i][0]
        if isinstance(result, Exception):
            logger.warning("Failed to fetch %s: %s", name, result)
            continue
        src_name, content = result
        if content and len(content) > 100:  # skip near-empty pages
            sources.append((src_name, content))
            logger.info("Fetched %s: %d chars", src_name, len(content))
        else:
            logger.warning("Skipping %s: too little content (%d chars)", src_name, len(content) if content else 0)
    return sources


async def _fetch_resume() -> str:
    """Fetch resume content from resume.jxh.io, stripping HTML to plain text."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(RESUME_URL)
        resp.raise_for_status()
        return _strip_html(resp.text)


@activity.defn
async def research_and_score_jobs(existing_jobs: list[dict]) -> list[dict]:
    """Research new job postings using Claude CLI and score them for relevance.

    Uses `claude -p` with OAuth session auth (no API key needed).
    Prompt is passed via stdin to avoid argv length limits.
    Do NOT use --bare flag (it disables OAuth and requires ANTHROPIC_API_KEY).
    """
    resume_content = ""
    try:
        resume_content = await _fetch_resume()
        logger.info("Fetched live resume: %d chars", len(resume_content))
    except Exception as e:
        logger.warning("Failed to fetch resume from %s: %s -- using fallback", RESUME_URL, e)

    if not resume_content:
        resume_content = RESUME_FALLBACK

    # Fetch HN and all extra sources concurrently
    hn_task = _fetch_hn_whos_hiring()
    extra_task = _fetch_all_extra_sources()
    hn_result, extra_results = await asyncio.gather(
        hn_task, extra_task, return_exceptions=True
    )

    # Build source sections
    source_sections: list[tuple[str, str]] = []

    # HN first (highest priority)
    if isinstance(hn_result, str) and hn_result:
        source_sections.append(("HN Who's Hiring", hn_result))
        logger.info("Fetched HN content: %d chars", len(hn_result))
    else:
        logger.warning("No HN content available this cycle")

    # Extra sources
    if isinstance(extra_results, Exception):
        logger.warning("Failed to fetch extra sources: %s", extra_results)
    elif isinstance(extra_results, list):
        source_sections.extend(extra_results)

    logger.info("Total sources fetched: %d", len(source_sections))

    existing_summary = "\n".join(
        f"- {j['company']} | {j['title']} | {j['link']}" for j in existing_jobs
    )
    if not existing_summary:
        existing_summary = "(no existing jobs)"

    system_prompt = """You are a job research assistant. Extract job postings from the provided
source content that match the candidate profile. Score each posting 0.0-1.0 for relevance
to the candidate. Only include postings scoring >= 0.5.

LOCATION PREFERENCE: Candidate is based in the San Francisco Bay Area. Prioritize:
1. Remote roles (highest priority)
2. Bay Area / SF / Silicon Valley hybrid or onsite roles
3. Other US locations only if remote-friendly
Do NOT include roles that require onsite presence outside the Bay Area (e.g. Toronto, NYC, Seattle onsite).

IMPORTANT: Do NOT include any jobs that appear in the existing jobs list (dedup by company+title or link).

Multiple sources are provided below. Extract relevant postings from ALL of them.
You also have WebSearch and WebFetch tools — use them to search for additional job openings
at the companies listed in the sources, especially if a source page didn't return useful content.
For each posting, set the "source" field to the name of the source it came from.

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
- source (string: which source this came from, e.g. "HN Who's Hiring", "Stripe Careers", etc.)
- relevance (float 0.0-1.0)
- fit_notes (string: 1-2 sentences on why this fits or doesn't)
- tags (string: comma-separated relevant tags)
- employee_count (integer or null: approximate number of employees at the company)
- total_funding (string or null: funding stage only — e.g. "Series A", "Series C", "Public", "Bootstrapped", or null if unknown)
- ticker (string or null: stock ticker symbol if publicly traded, e.g. "GOOG", "NET", null if private)
- founder_led (boolean or null: true if a founder is currently CEO, false if not, null if unknown)
- glassdoor_rating (float or null: Glassdoor overall rating e.g. 4.2, null if unknown)
- glassdoor_recommend_pct (integer or null: Glassdoor "recommend to a friend" percentage e.g. 85, null if unknown)

If no relevant jobs are found, return an empty array: []"""

    # Build user message with all sources, respecting total size limit
    source_blocks = []
    total_chars = 0
    for name, content in source_sections:
        block = f"\n\n## SOURCE: {name}\n{content}"
        if total_chars + len(block) > MAX_TOTAL_PROMPT_CHARS - 5000:  # reserve room for profile/existing
            logger.warning("Truncating sources at %s (total would exceed limit)", name)
            break
        source_blocks.append(block)
        total_chars += len(block)

    user_msg = f"""## Candidate Profile
{resume_content}

## Existing Jobs (DO NOT duplicate these)
{existing_summary}
{"".join(source_blocks)}"""

    # Call Claude via CLI with OAuth session auth.
    # Prompt passed via stdin (too large for argv).
    # Do NOT use --bare (it disables OAuth, requires ANTHROPIC_API_KEY).
    full_prompt = f"{system_prompt}\n\n{user_msg}"
    logger.info("Calling Claude CLI (prompt: %d chars)", len(full_prompt))

    proc = await asyncio.create_subprocess_exec(
        CLAUDE_CLI, "-p", "-",
        "--output-format", "text",
        "--model", "sonnet",
        "--allowedTools", "WebSearch", "WebFetch",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(
        proc.communicate(input=full_prompt.encode("utf-8")), timeout=240
    )

    if proc.returncode != 0:
        err_msg = stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"claude CLI failed (rc={proc.returncode}): {err_msg}")

    text = stdout.decode("utf-8", errors="replace").strip()

    if not text:
        logger.warning("Empty response from Claude CLI")
        return []

    # Parse JSON -- handle potential markdown wrapping
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)

    try:
        jobs = json.loads(text)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse Claude response as JSON: %s\nResponse: %s", e, text[:500])
        return []

    if not isinstance(jobs, list):
        logger.error("Claude response is not a list: %s", type(jobs))
        return []

    logger.info("Claude returned %d job postings", len(jobs))
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
                # Convert founder_led from bool to int for SQLite
                founder_led_val = job.get("founder_led")
                if founder_led_val is True:
                    founder_led_val = 1
                elif founder_led_val is False:
                    founder_led_val = 0
                else:
                    founder_led_val = None

                conn.execute(
                    """INSERT OR IGNORE INTO jobs
                       (company, title, link, salary_min, salary_max, level, industry,
                        location, remote, source, relevance, fit_notes, tags,
                        employee_count, total_funding, ticker, founder_led,
                        glassdoor_rating, glassdoor_recommend_pct, status)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')""",
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
                        job.get("employee_count"),
                        job.get("total_funding"),
                        job.get("ticker"),
                        founder_led_val,
                        job.get("glassdoor_rating"),
                        job.get("glassdoor_recommend_pct"),
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
async def get_unenriched_companies() -> list[str]:
    """Return distinct company names that have NULL employee_count (unenriched)."""
    conn = _ensure_db()
    try:
        rows = conn.execute(
            "SELECT DISTINCT company FROM jobs WHERE employee_count IS NULL"
        ).fetchall()
        return [r["company"] for r in rows]
    finally:
        conn.close()


@activity.defn
async def enrich_companies(unenriched_companies: list[str]) -> list[dict]:
    """Research company data via Claude CLI for companies missing enrichment.

    Returns list of dicts with keys: company, employee_count, total_funding,
    ticker, founder_led, glassdoor_rating, glassdoor_recommend_pct.
    """
    if not unenriched_companies:
        return []

    company_list = "\n".join(f"- {c}" for c in unenriched_companies)
    prompt = f"""You are a company research assistant. For each company below, provide enrichment data.

Return ONLY a JSON array (no markdown, no explanation) where each element has these exact keys:
- company (string: exact company name as given)
- employee_count (integer or null: approximate number of employees)
- total_funding (string or null: funding stage only — e.g. "Series A", "Series C", "Public", "Bootstrapped", or null if unknown)
- ticker (string or null: stock ticker if publicly traded, e.g. "GOOG", "NET", null if private)
- founder_led (boolean or null: true if a founder is currently CEO, false if not, null if unknown)
- glassdoor_rating (float or null: Glassdoor overall rating e.g. 4.2, null if unknown)
- glassdoor_recommend_pct (integer or null: Glassdoor "recommend to a friend" percentage e.g. 85, null if unknown)

Use WebSearch to verify company data — do NOT guess. If you can't find a value, use null.

Companies to research:
{company_list}"""

    logger.info("Enriching %d companies via Claude CLI", len(unenriched_companies))

    proc = await asyncio.create_subprocess_exec(
        CLAUDE_CLI, "-p", "-",
        "--output-format", "text",
        "--model", "sonnet",
        "--allowedTools", "WebSearch", "WebFetch",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(
        proc.communicate(input=prompt.encode("utf-8")), timeout=180
    )

    if proc.returncode != 0:
        err_msg = stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"claude CLI failed (rc={proc.returncode}): {err_msg}")

    text = stdout.decode("utf-8", errors="replace").strip()
    if not text:
        logger.warning("Empty response from Claude CLI for company enrichment")
        return []

    # Strip markdown fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)

    try:
        enrichments = json.loads(text)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse enrichment JSON: %s\nResponse: %s", e, text[:500])
        return []

    if not isinstance(enrichments, list):
        logger.error("Enrichment response is not a list: %s", type(enrichments))
        return []

    logger.info("Enriched %d companies", len(enrichments))
    return enrichments


@activity.defn
async def update_company_data(enrichment: list[dict]) -> int:
    """Update jobs table with company enrichment data. Returns count of updated companies."""
    if not enrichment:
        return 0

    conn = _ensure_db()
    updated = 0
    try:
        for item in enrichment:
            company = item.get("company")
            if not company:
                continue

            founder_led_val = item.get("founder_led")
            if founder_led_val is True:
                founder_led_val = 1
            elif founder_led_val is False:
                founder_led_val = 0
            else:
                founder_led_val = None

            conn.execute(
                """UPDATE jobs SET employee_count=?, total_funding=?, ticker=?,
                   founder_led=?, glassdoor_rating=?, glassdoor_recommend_pct=?
                   WHERE company=?""",
                (
                    item.get("employee_count"),
                    item.get("total_funding"),
                    item.get("ticker"),
                    founder_led_val,
                    item.get("glassdoor_rating"),
                    item.get("glassdoor_recommend_pct"),
                    company,
                ),
            )
            if conn.total_changes > updated:
                updated += 1
        conn.commit()
    finally:
        conn.close()

    logger.info("Updated enrichment data for %d companies", updated)
    return updated


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
