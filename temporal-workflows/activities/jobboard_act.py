"""
Activities for the job board research workflow.

Fetches existing jobs from SQLite, researches new postings via Claude CLI,
inserts results, and optionally notifies Discord.
"""

import asyncio
import json
import logging
import re
import sqlite3
from datetime import datetime, timezone

import httpx
from temporalio import activity

logger = logging.getLogger(__name__)

DB_PATH = "/mnt/data/labs/jobboard/jobs.db"
CLAUDE_CLI = "/home/clungus/.local/bin/claude"

RESUME_FALLBACK = (
    "Staff/Principal engineer, 15yr experience, distributed systems, "
    "platform architecture, JS/TS/Go"
)

RESUME_URL = "https://resume.jxh.io"

HN_HIRING_SEARCH_URL = "https://hn.algolia.com/api/v1/search"
HN_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item/{}.json"

# Additional job sources: (name, url)
EXTRA_JOB_SOURCES = [
    # --- Aggregators / Meta-sources ---
    ("Levels.fyi Staff/Principal", "https://www.levels.fyi/jobs?title=Staff+Engineer&title=Principal+Engineer&title=Senior+Staff+Engineer"),
    ("YC Work at a Startup", "https://www.workatastartup.com/jobs?role=eng&type=fullTime"),
    ("Built In", "https://builtin.com/jobs?search=principal+engineer"),
    ("Wellfound (AngelList)", "https://wellfound.com/jobs?role=Engineering&seniorityLevel=Senior&seniorityLevel=Lead&seniorityLevel=Staff"),
    ("Otta Engineering", "https://app.otta.com/jobs?title=Staff+Engineer&title=Principal+Engineer"),

    # --- Frontier AI / ML ---
    ("Anthropic Careers (Greenhouse)", "https://job-boards.greenhouse.io/anthropic"),
    ("Anthropic Careers (Ashby)", "https://jobs.ashbyhq.com/anthropic"),
    ("OpenAI Careers", "https://openai.com/careers/search"),
    ("xAI Careers", "https://boards.greenhouse.io/xai"),
    ("Cohere Careers", "https://jobs.lever.co/cohere"),
    ("Mistral AI Careers", "https://jobs.lever.co/mistral"),
    ("Databricks Careers", "https://www.databricks.com/company/careers"),
    ("Scale AI Careers", "https://boards.greenhouse.io/scaleai"),
    ("Hugging Face Careers", "https://apply.workable.com/huggingface/"),
    ("Perplexity AI Careers", "https://jobs.ashbyhq.com/perplexity"),
    ("Character AI Careers", "https://boards.greenhouse.io/characterai"),
    ("Midjourney Careers", "https://boards.greenhouse.io/midjourney"),
    ("Stability AI Careers", "https://jobs.lever.co/stability"),
    ("Runway ML Careers", "https://boards.greenhouse.io/runwayml"),
    ("Cursor/Anysphere Careers", "https://jobs.ashbyhq.com/anysphere"),
    ("Replit Careers", "https://jobs.ashbyhq.com/replit"),
    ("DeepMind Careers", "https://deepmind.google/about/careers/"),
    ("Inflection AI Careers", "https://boards.greenhouse.io/inflectionai"),
    ("Adept AI Careers", "https://boards.greenhouse.io/adeptailabs"),
    ("Magic AI Careers", "https://boards.greenhouse.io/magic"),
    ("Reka AI Careers", "https://jobs.ashbyhq.com/reka"),
    ("AI21 Labs Careers", "https://jobs.lever.co/AI21"),
    ("Imbue Careers", "https://boards.greenhouse.io/imbue"),
    ("Weights & Biases Careers", "https://boards.greenhouse.io/wandb"),
    ("Glean Careers", "https://boards.greenhouse.io/glaboratories"),

    # --- GPU Cloud / Neoclouds / Infra ---
    ("CoreWeave Careers", "https://boards.greenhouse.io/coreweave"),
    ("Lambda Careers", "https://jobs.ashbyhq.com/lambda"),
    ("Together AI Careers", "https://jobs.ashbyhq.com/together-ai"),
    ("Modal Careers", "https://jobs.ashbyhq.com/modal"),
    ("Baseten Careers", "https://jobs.ashbyhq.com/baseten"),
    ("Fireworks AI Careers", "https://boards.greenhouse.io/fireworks"),
    ("Groq Careers", "https://boards.greenhouse.io/groq"),
    ("Cerebras Careers", "https://boards.greenhouse.io/cerebrassystems"),
    ("Crusoe Energy Careers", "https://boards.greenhouse.io/crusoe"),
    ("Nebius Careers", "https://boards.greenhouse.io/nebius"),
    ("FluidStack Careers", "https://jobs.ashbyhq.com/fluidstack"),
    ("Vultr Careers", "https://www.vultr.com/company/careers/"),
    ("OctoAI Careers", "https://boards.greenhouse.io/octoml"),

    # --- Big Tech ---
    ("Google Careers", "https://www.google.com/about/careers/applications/jobs/results/?q=Staff+Software+Engineer&location=San+Francisco%2C+CA%2C+USA&hl=en"),
    ("Meta Careers", "https://www.metacareers.com/jobs"),
    ("Apple Careers", "https://jobs.apple.com/en-us/search?sort=relevance&search=staff%20engineer"),
    ("Netflix Jobs", "https://jobs.netflix.com/search"),
    ("NVIDIA Careers", "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"),
    ("Microsoft Careers", "https://careers.microsoft.com/us/en/search-results?keywords=staff%20engineer"),
    ("Amazon Careers", "https://www.amazon.jobs/en/search?base_query=principal+engineer&loc_query=&latitude=&longitude=&loc_group_id=&invalid_location=false&country=USA"),

    # --- SaaS / Cloud ---
    ("Stripe Careers", "https://boards.greenhouse.io/stripe"),
    ("Cloudflare Careers", "https://www.cloudflare.com/careers/jobs/"),
    ("Vercel Careers", "https://jobs.ashbyhq.com/vercel"),
    ("Datadog Careers", "https://careers.datadoghq.com/"),
    ("HashiCorp Careers", "https://www.hashicorp.com/careers"),
    ("Confluent Careers", "https://careers.confluent.io/search/jobs"),
    ("Elastic Careers", "https://jobs.elastic.co/"),
    ("MongoDB Careers", "https://www.mongodb.com/careers"),
    ("Supabase Careers", "https://boards.greenhouse.io/supabase"),
    ("Netlify Careers", "https://boards.greenhouse.io/netlify"),
    ("Neon Careers", "https://jobs.ashbyhq.com/neon"),
    ("Fly.io Careers", "https://fly.io/jobs/"),
    ("Railway Careers", "https://jobs.ashbyhq.com/railway"),
    ("Render Careers", "https://jobs.lever.co/render"),
    ("CrowdStrike Careers", "https://www.crowdstrike.com/careers/"),
    ("Okta Careers", "https://www.okta.com/company/careers/"),
    ("ServiceNow Careers", "https://careers.servicenow.com/"),
    ("PlanetScale Careers", "https://jobs.ashbyhq.com/planetscale"),
    ("Grafana Labs Careers", "https://grafana.com/about/careers/open-positions/"),
    ("Cockroach Labs Careers", "https://www.cockroachlabs.com/careers/open-positions/"),
    ("Aiven Careers", "https://aiven.io/careers"),
    ("Snowflake Careers", "https://careers.snowflake.com/"),

    # --- Developer Tools ---
    ("GitHub Careers", "https://www.github.careers/careers"),
    ("GitLab Careers", "https://about.gitlab.com/jobs/all-jobs/"),
    ("JetBrains Careers", "https://www.jetbrains.com/careers/jobs/"),
    ("Linear Careers", "https://jobs.ashbyhq.com/linear"),
    ("Figma Careers", "https://boards.greenhouse.io/figma"),
    ("Retool Careers", "https://boards.greenhouse.io/retool"),
    ("Temporal Careers", "https://boards.greenhouse.io/temporaltechnologies"),
    ("PostHog Careers", "https://boards.greenhouse.io/posthog"),
    ("Sentry Careers", "https://boards.greenhouse.io/sentry"),
    ("Sourcegraph Careers", "https://boards.greenhouse.io/sourcegraph"),
    ("LaunchDarkly Careers", "https://boards.greenhouse.io/launchdarkly"),
    ("Snyk Careers", "https://boards.greenhouse.io/snyk"),
    ("Cypress Careers", "https://boards.greenhouse.io/cypress"),
    ("Deno Careers", "https://jobs.ashbyhq.com/deno"),

    # --- Fintech ---
    ("Plaid Careers", "https://boards.greenhouse.io/plaid"),
    ("Brex Careers", "https://boards.greenhouse.io/brex"),
    ("Ramp Careers", "https://boards.greenhouse.io/ramp"),
    ("Mercury Careers", "https://boards.greenhouse.io/mercury"),
    ("Affirm Careers", "https://boards.greenhouse.io/affirm"),
    ("Marqeta Careers", "https://boards.greenhouse.io/marqeta"),
    ("Column Careers", "https://boards.greenhouse.io/column"),
    ("Moov Careers", "https://boards.greenhouse.io/moov"),
    ("Coinbase Careers", "https://www.coinbase.com/careers/positions"),
    ("Robinhood Careers", "https://boards.greenhouse.io/robinhood"),
    ("Square/Block Careers", "https://block.xyz/careers?teams=engineering"),
    ("Bolt Careers", "https://boards.greenhouse.io/bolt"),

    # --- Chad Corps ---
    ("Anduril Careers", "https://jobs.lever.co/anduril"),
    ("Palantir Careers", "https://www.palantir.com/careers/"),
    ("SpaceX Careers", "https://boards.greenhouse.io/spacex"),
    ("Discord Careers", "https://discord.com/careers"),
    ("Snap Careers", "https://careers.snap.com/"),
    ("Twitch Careers", "https://www.twitch.tv/jobs/en/"),
    ("Epic Games Careers", "https://www.epicgames.com/site/en-US/careers"),
    ("Valve Careers", "https://www.valvesoftware.com/en/jobs"),
    ("Roblox Careers", "https://careers.roblox.com/"),
    ("Riot Games Careers", "https://www.riotgames.com/en/work-with-us"),
    ("Spotify Careers", "https://www.lifeatspotify.com/jobs?l=category-engineering"),
    ("Notion Careers", "https://boards.greenhouse.io/notion"),
    ("Canva Careers", "https://www.canva.com/careers/"),
    ("Airtable Careers", "https://boards.greenhouse.io/airtable"),

    # --- Normie but good ---
    ("Dropbox Careers", "https://jobs.dropbox.com/all-jobs"),
    ("Intuit Careers", "https://jobs.intuit.com/search-jobs"),
    ("Reddit Careers", "https://boards.greenhouse.io/reddit"),
    ("Pinterest Careers", "https://www.pinterestcareers.com/en/jobs/"),
    ("Lyft Careers", "https://www.lyft.com/careers"),
    ("Instacart Careers", "https://boards.greenhouse.io/instacart"),
    ("Airbnb Careers", "https://careers.airbnb.com/"),
    ("Uber Careers", "https://www.uber.com/us/en/careers/"),
    ("Slack/Salesforce Careers", "https://careers.salesforce.com/en/jobs/?search=staff+engineer&team=Engineering"),
    ("LinkedIn Careers", "https://careers.linkedin.com/"),
    ("Shopify Careers", "https://www.shopify.com/careers"),
    ("Twilio Careers", "https://boards.greenhouse.io/twilio"),
    ("Atlassian Careers", "https://www.atlassian.com/company/careers/all-jobs"),
    ("Asana Careers", "https://boards.greenhouse.io/asana"),

    # --- Intel / Hardware ---
    ("Intel Careers", "https://jobs.intel.com/en/search-jobs"),
    ("AMD Careers", "https://careers.amd.com/careers-home/jobs"),
    ("Qualcomm Careers", "https://careers.qualcomm.com/careers"),

    # --- Prediction markets ---
    ("Kalshi Careers", "https://boards.greenhouse.io/kalshi"),
    ("Polymarket Careers", "https://boards.greenhouse.io/polymarket"),

    # --- Security / Infra ---
    ("Tailscale Careers", "https://tailscale.com/jobs"),
    ("1Password Careers", "https://jobs.lever.co/1password"),
    ("Palo Alto Networks Careers", "https://jobs.paloaltonetworks.com/en/jobs/"),
    ("Wiz Careers", "https://boards.greenhouse.io/waboratory"),

    # --- Data / Analytics ---
    ("Fivetran Careers", "https://boards.greenhouse.io/fivetran"),
]

MAX_SOURCE_CHARS = 30000
MAX_TOTAL_PROMPT_CHARS = 100000

# Fields that indicate a job has already been enriched with company data.
# Used both to detect pre-enriched inserts and as the canonical enrichment key set.
ENRICHMENT_KEYS = ("employee_count", "total_funding", "ticker", "founder_led",
                   "glassdoor_rating", "glassdoor_recommend_pct")


def _bool_to_sqlite(val) -> int | None:
    """Convert a Python bool (or truthy/falsy) to SQLite integer, or None."""
    if val is True:
        return 1
    if val is False:
        return 0
    return None


def _ensure_db() -> sqlite3.Connection:
    """Open SQLite connection and ensure the jobs table exists."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            company                 TEXT NOT NULL,
            title                   TEXT NOT NULL,
            link                    TEXT NOT NULL UNIQUE,
            salary_min              INTEGER,
            salary_max              INTEGER,
            level                   TEXT,
            industry                TEXT,
            location                TEXT,
            remote                  TEXT CHECK(remote IN ('remote','hybrid','onsite','unknown')) DEFAULT 'unknown',
            source                  TEXT,
            relevance               REAL,
            fit_notes               TEXT,
            tags                    TEXT,
            posted_at               TEXT,
            discovered_at           TEXT DEFAULT (datetime('now')),
            status                  TEXT CHECK(status IN ('new','applied','referred','interviewing','denied','offer','stale')) DEFAULT 'new',
            hidden                  INTEGER DEFAULT 0,
            employee_count          INTEGER,
            total_funding           TEXT,
            ticker                  TEXT,
            founder_led             INTEGER,
            glassdoor_rating        REAL,
            glassdoor_recommend_pct INTEGER,
            enriched_at             TEXT
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


async def _fetch_resume() -> str:
    """Fetch resume content from resume.jxh.io, stripping HTML to plain text."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(RESUME_URL)
        resp.raise_for_status()
        return _strip_html(resp.text)


BATCH_SIZE = 30  # Sources per Claude CLI call
BATCH_TIMEOUT = 420  # Timeout per batch in seconds


def _parse_claude_json(text: str) -> list[dict]:
    """Parse JSON array from Claude CLI output, handling markdown fences and prose preamble."""
    text = text.strip()
    if not text:
        return []

    # Strip markdown fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)

    # First try direct parse
    try:
        result = json.loads(text)
        if isinstance(result, list):
            return result
    except json.JSONDecodeError:
        pass

    # Claude sometimes returns prose before/after the JSON array.
    # Extract the JSON array by finding the first '[' and last ']'.
    first_bracket = text.find("[")
    last_bracket = text.rfind("]")
    if first_bracket != -1 and last_bracket != -1 and last_bracket > first_bracket:
        json_str = text[first_bracket : last_bracket + 1]
        try:
            result = json.loads(json_str)
            if isinstance(result, list):
                logger.info("Extracted JSON array from prose-wrapped response (chars %d-%d)", first_bracket, last_bracket)
                return result
        except json.JSONDecodeError as e:
            logger.error("Failed to parse extracted JSON substring: %s\nSubstring: %s", e, json_str[:500])
            return []

    logger.error("No JSON array found in Claude response. Response: %s", text[:500])
    return []


@activity.defn
async def scrape_career_pages() -> dict[str, str]:
    """Phase 1: Fetch all career page URLs in parallel using plain HTTP.

    Returns a dict mapping company name -> extracted text content.
    Pure HTTP, no LLM. Should complete in under a minute.
    """
    semaphore = asyncio.Semaphore(20)

    async def _fetch_one(name: str, url: str) -> tuple[str, str | None]:
        async with semaphore:
            try:
                async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                    resp = await client.get(url, headers={
                        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
                    })
                    resp.raise_for_status()
                    text = _strip_html(resp.text)
                    if len(text) < 100:
                        logger.warning("Skipping %s: too little content (%d chars)", name, len(text))
                        return (name, None)
                    return (name, text[:MAX_SOURCE_CHARS])
            except Exception as e:
                logger.warning("Failed to fetch %s: %s", name, e)
                return (name, None)

    # Also fetch HN Who's Hiring
    hn_content = None
    try:
        hn_content = await asyncio.wait_for(_fetch_hn_whos_hiring(), timeout=60)
        if hn_content:
            logger.info("Fetched HN content: %d chars", len(hn_content))
    except Exception as e:
        logger.warning("Failed to fetch HN Who's Hiring: %s", e)

    # Fetch all extra sources concurrently
    tasks = [_fetch_one(name, url) for name, url in EXTRA_JOB_SOURCES]
    results = await asyncio.wait_for(
        asyncio.gather(*tasks, return_exceptions=True),
        timeout=120,
    )

    scraped: dict[str, str] = {}
    if hn_content:
        scraped["HN Who's Hiring"] = hn_content

    for i, result in enumerate(results):
        name = EXTRA_JOB_SOURCES[i][0]
        if isinstance(result, Exception):
            logger.warning("Gather exception for %s: %s", name, result)
            continue
        src_name, content = result
        if content:
            scraped[src_name] = content
            logger.info("Fetched %s: %d chars", src_name, len(content))

    logger.info("Scraped %d / %d career pages successfully", len(scraped), len(EXTRA_JOB_SOURCES) + 1)
    return scraped


ANALYSIS_SYSTEM_PROMPT = """You are a job research assistant. Extract job postings from the provided
source content that match the candidate profile. Score each posting 0.0-1.0 for relevance
to the candidate. Only include postings scoring >= 0.5.

CRITICAL: Output ONLY a JSON array. No preamble, no explanation, no commentary, no markdown
fences. Your entire response must be valid JSON starting with [ and ending with ].

LOCATION PREFERENCE: Candidate is based in the San Francisco Bay Area. Prioritize:
1. Remote roles (highest priority)
2. Bay Area / SF / Silicon Valley hybrid or onsite roles
3. Other US locations only if remote-friendly
Do NOT include roles that require onsite presence outside the Bay Area (e.g. Toronto, NYC, Seattle onsite).

IMPORTANT: Do NOT include any jobs that appear in the existing jobs list (dedup by company+title or link).

Multiple career page contents are provided below. The HTML has already been stripped — you are
reading the extracted text from each company's careers page. Read carefully and extract ALL
relevant postings. Try to find MULTIPLE relevant roles per company where applicable.

Look for: "staff engineer", "principal engineer", "senior engineer", "distinguished engineer",
"platform engineer", "infrastructure engineer", "distributed systems" roles.

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


async def _run_analysis_batch(
    batch_num: int,
    total_batches: int,
    source_sections: list[tuple[str, str]],
    resume_content: str,
    existing_summary: str,
) -> list[dict]:
    """Run a single batch of pre-scraped sources through Claude CLI for analysis.
    No WebSearch/WebFetch — Claude just reads the provided text."""
    source_names = [name for name, _ in source_sections]
    logger.info(
        "Analysis batch %d/%d: processing %d sources: %s",
        batch_num, total_batches, len(source_sections), source_names,
    )

    # Build source blocks respecting size limit
    source_blocks = []
    total_chars = 0
    for name, content in source_sections:
        block = f"\n\n## SOURCE: {name}\n{content}"
        if total_chars + len(block) > MAX_TOTAL_PROMPT_CHARS - 5000:
            logger.warning("Batch %d: truncating sources at %s (size limit)", batch_num, name)
            break
        source_blocks.append(block)
        total_chars += len(block)

    user_msg = f"""## Candidate Profile
{resume_content}

## Existing Jobs (DO NOT duplicate these)
{existing_summary}
{"".join(source_blocks)}"""

    full_prompt = f"{ANALYSIS_SYSTEM_PROMPT}\n\n{user_msg}"
    logger.info("Analysis batch %d/%d: calling Claude CLI (%d chars, no web tools)", batch_num, total_batches, len(full_prompt))

    proc = await asyncio.create_subprocess_exec(
        CLAUDE_CLI, "-p", "-",
        "--output-format", "text",
        "--model", "sonnet",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(
        proc.communicate(input=full_prompt.encode("utf-8")), timeout=BATCH_TIMEOUT
    )

    if proc.returncode != 0:
        err_msg = stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"Analysis batch {batch_num}: claude CLI failed (rc={proc.returncode}): {err_msg}")

    text = stdout.decode("utf-8", errors="replace").strip()
    jobs = _parse_claude_json(text)
    logger.info("Analysis batch %d/%d: got %d jobs", batch_num, total_batches, len(jobs))
    return jobs


@activity.defn
async def analyze_scraped_jobs(scraped_content: dict[str, str], existing_jobs: list[dict]) -> list[dict]:
    """Phase 2: Analyze pre-scraped career page content using Claude CLI.

    Claude reads the already-fetched text and extracts/scores relevant job postings.
    No WebSearch/WebFetch needed — all content is pre-loaded.
    Sources are split into batches of ~30 and processed sequentially.
    """
    resume_content = ""
    try:
        resume_content = await _fetch_resume()
        logger.info("Fetched live resume: %d chars", len(resume_content))
    except Exception as e:
        logger.warning("Failed to fetch resume from %s: %s -- using fallback", RESUME_URL, e)

    if not resume_content:
        resume_content = RESUME_FALLBACK

    # Build source sections from scraped content
    source_sections: list[tuple[str, str]] = list(scraped_content.items())
    logger.info("Analyzing %d scraped sources", len(source_sections))

    existing_summary = "\n".join(
        f"- {j['company']} | {j['title']} | {j['link']}" for j in existing_jobs
    )
    if not existing_summary:
        existing_summary = "(no existing jobs)"

    # Split sources into batches of BATCH_SIZE
    batches = []
    for i in range(0, len(source_sections), BATCH_SIZE):
        batches.append(source_sections[i : i + BATCH_SIZE])

    logger.info("Split %d sources into %d batches of ~%d", len(source_sections), len(batches), BATCH_SIZE)

    # Process batches sequentially, collecting results
    all_jobs: list[dict] = []
    failed_batches = 0

    for batch_idx, batch in enumerate(batches, start=1):
        activity.heartbeat(f"Analyzing batch {batch_idx}/{len(batches)}")
        try:
            batch_jobs = await _run_analysis_batch(
                batch_num=batch_idx,
                total_batches=len(batches),
                source_sections=batch,
                resume_content=resume_content,
                existing_summary=existing_summary,
            )
            all_jobs.extend(batch_jobs)
            # Add newly found jobs to existing summary for cross-batch dedup
            for j in batch_jobs:
                existing_summary += f"\n- {j.get('company', '?')} | {j.get('title', '?')} | {j.get('link', '')}"
        except Exception as e:
            failed_batches += 1
            logger.error("Analysis batch %d/%d failed: %s", batch_idx, len(batches), e)
            # Continue with remaining batches

    logger.info(
        "All analysis batches complete: %d jobs from %d batches (%d failed)",
        len(all_jobs), len(batches), failed_batches,
    )
    return all_jobs


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
                changes_before = conn.total_changes
                # If the analysis phase already provided enrichment data, mark enriched_at now
                # so get_unenriched_companies won't re-research these companies.
                has_enrichment = any(job.get(k) is not None for k in ENRICHMENT_KEYS)
                enriched_at = datetime.now(timezone.utc).isoformat() if has_enrichment else None
                conn.execute(
                    """INSERT OR IGNORE INTO jobs
                       (company, title, link, salary_min, salary_max, level, industry,
                        location, remote, source, relevance, fit_notes, tags,
                        employee_count, total_funding, ticker, founder_led,
                        glassdoor_rating, glassdoor_recommend_pct, status, enriched_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)""",
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
                        _bool_to_sqlite(job.get("founder_led")),
                        job.get("glassdoor_rating"),
                        job.get("glassdoor_recommend_pct"),
                        enriched_at,
                    ),
                )
                if conn.total_changes > changes_before:
                    inserted += 1
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
    """Return distinct company names that haven't been enriched yet (enriched_at IS NULL)."""
    conn = _ensure_db()
    try:
        rows = conn.execute(
            "SELECT DISTINCT company FROM jobs WHERE enriched_at IS NULL"
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
        "--allowedTools", "WebSearch,WebFetch",
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

    enrichments = _parse_claude_json(text)
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

            enriched_at = datetime.now(timezone.utc).isoformat()
            changes_before = conn.total_changes
            conn.execute(
                """UPDATE jobs SET employee_count=?, total_funding=?, ticker=?,
                   founder_led=?, glassdoor_rating=?, glassdoor_recommend_pct=?,
                   enriched_at=?
                   WHERE company=?""",
                (
                    item.get("employee_count"),
                    item.get("total_funding"),
                    item.get("ticker"),
                    _bool_to_sqlite(item.get("founder_led")),
                    item.get("glassdoor_rating"),
                    item.get("glassdoor_recommend_pct"),
                    enriched_at,
                    company,
                ),
            )
            if conn.total_changes > changes_before:
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
