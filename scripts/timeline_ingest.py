#!/usr/bin/env python3
"""
timeline_ingest.py -- Scan BigClungus repos for notable commits and stage
them as timeline candidates.

Outputs candidates to /mnt/data/hello-world/data/timeline-candidates.json.
Does NOT modify timeline.json directly.

Usage:
  python3 /mnt/data/scripts/timeline_ingest.py
  python3 /mnt/data/scripts/timeline_ingest.py --since 7  # look back N days (default 30)
  python3 /mnt/data/scripts/timeline_ingest.py --dry-run   # print without writing
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone

TIMELINE_API = "http://localhost:8081/api/timeline"
CANDIDATES_PATH = "/mnt/data/hello-world/data/timeline-candidates.json"

# ---------------------------------------------------------------------------
# Ingest criteria — what gets auto-staged vs. skipped
#
# AUTO-INGEST (keep):
#   - New persona creations ("add <name> persona")
#   - New user-facing pages, labs, or sites (initial commit / launch)
#   - First use of a major technology or system (Temporal, Graphiti, Pepe, etc.)
#   - Notable incidents or succession events
#   - Major architectural milestones (rewrites, platform migrations)
#
# SKIP (do not ingest):
#   - Library swaps or dependency upgrades
#   - Internal API / REST endpoint additions with no user-visible effect
#   - DB migration scripts and schema changes
#   - Config file changes and environment variable tweaks
#   - systemd unit additions or modifications
#   - Feature flags and UI checkboxes for existing features
#   - Small visual tweaks or minor UX polish
#   - Internal refactors with no user-visible change
#   - Duplicate commits that cover the same event as an existing entry
# ---------------------------------------------------------------------------

# Keywords that suggest a commit is "major"
MAJOR_KEYWORDS = re.compile(
    r"\b(add|create|implement|launch|initial|introduce|new|ship|deploy|migrate|"
    r"overhaul|rewrite|redesign|replace)\b",
    re.IGNORECASE,
)

# Category inference from commit message keywords
CATEGORY_KEYWORDS = {
    "infrastructure": re.compile(r"\b(infra|deploy|ci|cd|docker|cloudflare|tunnel|proxy|auth|oauth|systemd|service)\b", re.I),
    "congress-system": re.compile(r"\b(congress|persona|chairman|ibrahim|debate|verdict|evolution|trial)\b", re.I),
    "labs": re.compile(r"\b(lab|experiment)\b", re.I),
    "feature": re.compile(r"\b(feature|add|implement|create|new|introduce|ship)\b", re.I),
}

# Patterns that indicate commits that should be SKIPPED even if they match major keywords.
# These are things that are too granular or internal to warrant a timeline entry.
SKIP_PATTERNS = re.compile(
    r"\b(endpoint|endpoints|migration|migrate.*script|sqlite.*store|db.*store|"
    r"systemd|\.service\b|feature.flag|checkbox|fallback|viewport|culling|"
    r"hover.*label|edge.*label|source.link|inject.proxy|inject.service|"
    r"restart.*workflow|restart.*hourly|skipGen|skip.*gen|cached.mob|mob.*fallback|"
    r"mob.*sprite|countdown.screen|mob.*preview|render.*mob|"
    r"PersonaService|AgentService|TaskService|WalletService|auth.middleware|"
    r"replace.*vis-network|vis-network.*replace|sigma\.js|webgl.*graph|"
    r"auto-poll.*create|hook.*create.*directive|"
    r"timeline.*sqlite|timeline.*api.*endpoint|timeline.*json.*file|"
    # Infrastructure / internal tooling patterns
    r"cron\.py|cron-|\.cron\b|cron.*script|"
    r"\.env\b|env.*file|config.*file|config.*fix|"
    r"trigger.*handler|TRIGGERS\.md|triggers\.md|"
    r"ingest.*script|ingest.*system|ingestion.*script|"
    r"routing.*alongside|routing.*fix|routing.*update|"
    r"temporal.*schedule|temporal.*worker|temporal.*activity|"
    r"persistence.*api|persist.*clunger|"
    r"split rewrite|split.*refactor|rewrite.*split|"
    r"stale.*memory|memory.*sweep|memory.*verif|"
    r"watchdog|sweeper|heartbeat.*cron|"
    r"\.gitignore|scrub.*git|git.*history|credentials.*git|"
    r"internal.*tool|internal.*script|admin.*script)\b",
    re.IGNORECASE,
)


def run(cmd: list[str], cwd: str | None = None, timeout: int = 60) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, timeout=timeout)
    return result.stdout.strip()


def get_repos() -> list[dict]:
    """Get all BigClungus-owned repos via gh CLI."""
    raw = run(["gh", "repo", "list", "BigClungus", "--limit", "50", "--json", "name,url,isArchived"])
    if not raw:
        print("ERROR: gh repo list returned nothing", file=sys.stderr)
        sys.exit(1)
    repos = json.loads(raw)
    return [r for r in repos if not r.get("isArchived")]


def get_commits_batch(repo_name: str, since_date: str) -> list[dict]:
    """Fetch commits with full detail in one paginated API call.

    The list endpoint includes commit.message, sha, html_url, and parents.
    We avoid per-commit detail calls by using the list endpoint's data.
    """
    raw = run([
        "gh", "api",
        f"repos/BigClungus/{repo_name}/commits",
        "--paginate",
        "-X", "GET",
        "-f", f"since={since_date}",
        "-f", "per_page=100",
    ], timeout=120)
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # paginated output may be multiple JSON arrays concatenated
        # gh --paginate merges arrays automatically, but just in case:
        return []
    if not isinstance(data, list):
        return []

    commits = []
    for item in data:
        sha = item.get("sha", "")
        commit_obj = item.get("commit", {})
        message = commit_obj.get("message", "")
        date = commit_obj.get("author", {}).get("date", "")
        url = item.get("html_url", "")
        parents = item.get("parents", [])
        commits.append({
            "sha": sha,
            "message": message,
            "date": date,
            "url": url,
            "is_first": len(parents) == 0,
        })
    return commits


def get_tags(repo_name: str) -> set[str]:
    """Get tagged commit SHAs for a repo."""
    raw = run(["gh", "api", f"repos/BigClungus/{repo_name}/tags", "--paginate", "-q", ".[].commit.sha"])
    return set(raw.splitlines()) if raw else set()


def categorize(message: str) -> str:
    for cat, pattern in CATEGORY_KEYWORDS.items():
        if pattern.search(message):
            return cat
    return "milestone"


def load_json(path: str) -> list[dict]:
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return json.load(f)


def is_notable(message: str, is_tagged: bool, is_first: bool) -> tuple[bool, str]:
    """Determine if a commit is notable enough for the timeline.

    Applies the ingest criteria defined in SKIP_PATTERNS above:
    - Persona creations, new user-facing features, major tech introductions pass.
    - Library swaps, API endpoint additions, DB migrations, systemd units,
      config changes, feature flags, and minor tweaks are skipped.
    """
    first_line = message.split("\n")[0].strip()

    # Skip merge commits and trivial stuff
    if first_line.startswith("Merge "):
        return False, ""
    if first_line.lower() in ("", "update", "fix", "wip"):
        return False, ""
    # Skip simplify/heartbeat auto-commits
    if first_line.startswith("simplify:"):
        return False, ""

    # Skip individual congress/trial/session commits (e.g. "add congress session 42 thread")
    # Only system-level changes go on the timeline, not per-session entries.
    if re.search(r"\bcongress-\d+\b|\btrial-\d+\b|\bsession-\d+\b", first_line, re.IGNORECASE):
        return False, ""
    if re.search(r"\bsession\b.*\d+|\d+.*\bsession\b", first_line, re.IGNORECASE):
        return False, ""

    # Skip conventional commit prefixes for non-feature work
    lower = first_line.lower()
    for prefix in ("fix:", "refactor:", "chore:", "docs:", "style:", "test:", "ci:", "build:", "perf:", "cleanup:"):
        if lower.startswith(prefix):
            return False, ""

    # Skip commits that look like infrastructure/tooling even without a prefix
    infra_phrases = (
        "cron script", "cron job", "config fix", "env file", ".env",
        "trigger handler", "ingest script", "ingest system",
        "temporal schedule", "temporal worker",
        "routing fix", "routing update", "routing alongside",
        "persistence migration", "stale memory", "memory sweep",
        "watchdog", "hook handler", "split rewrite",
    )
    for phrase in infra_phrases:
        if phrase in lower:
            return False, ""

    # Skip commits that match granular/internal patterns regardless of other keywords
    if SKIP_PATTERNS.search(first_line):
        return False, ""

    if is_first:
        return True, "first commit in repo"
    if is_tagged:
        return True, "tagged release"

    # Only search for keywords in the first ~50 chars of the message
    search_window = first_line[:50]

    # "add" is too broad -- only match when it's the first word (after optional feat: prefix)
    stripped = re.sub(r"^feat:\s*", "", search_window, flags=re.IGNORECASE).strip()
    if re.match(r"(?i)^add\b", stripped):
        # Extra guard: skip if it looks like an internal endpoint/service/flag addition
        if SKIP_PATTERNS.search(first_line):
            return False, ""
        return True, "keyword match"

    # For all other major keywords, match within the first 50 chars
    # but exclude "add" from the general search since we handled it above
    other_keywords = re.compile(
        r"\b(create|implement|launch|initial|introduce|new|ship|deploy|migrate|"
        r"overhaul|rewrite|redesign|replace)\b",
        re.IGNORECASE,
    )
    if other_keywords.search(search_window):
        return True, "keyword match"

    return False, ""


def main():
    parser = argparse.ArgumentParser(description="Ingest git history into timeline candidates")
    parser.add_argument("--since", type=int, default=30, help="Look back N days (default 30)")
    parser.add_argument("--dry-run", action="store_true", help="Print candidates without writing")
    args = parser.parse_args()

    since_date = (datetime.now(timezone.utc) - timedelta(days=args.since)).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"Scanning commits since {since_date}")

    repos = get_repos()
    print(f"Found {len(repos)} repos: {', '.join(r['name'] for r in repos)}")

    # Build dedup sets from existing data (fetch from API)
    try:
        import urllib.request
        with urllib.request.urlopen(TIMELINE_API, timeout=10) as resp:
            timeline = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"WARNING: could not fetch timeline from API ({e}), using empty list")
        timeline = []
    existing_candidates = load_json(CANDIDATES_PATH)

    existing_urls = set()
    for entry in timeline + existing_candidates:
        if entry.get("url"):
            existing_urls.add(entry["url"])

    # Also dedup by day+title prefix to catch different URLs for the same event
    existing_day_titles = set()
    for entry in timeline + existing_candidates:
        day = entry.get("date", "")[:10]
        title = entry.get("title", "")[:40]
        existing_day_titles.add(f"{day}|{title}")

    new_candidates = []

    for repo in repos:
        repo_name = repo["name"]
        print(f"\n--- {repo_name} ---")

        tags = get_tags(repo_name)
        commits = get_commits_batch(repo_name, since_date)
        print(f"  {len(commits)} commits, {len(tags)} tags")

        # Deduplicate by day within this repo
        seen_days = set()

        for commit in commits:
            sha = commit["sha"]
            message = commit["message"]
            date = commit["date"]
            url = commit["url"]
            is_first = commit["is_first"]
            first_line = message.split("\n")[0].strip()

            if url and url in existing_urls:
                continue

            is_tagged = sha in tags
            notable, reason = is_notable(message, is_tagged, is_first)
            if not notable:
                continue

            # Deduplicate by day/repo
            day_key = f"{date[:10]}|{repo_name}"
            if day_key in seen_days:
                continue
            seen_days.add(day_key)

            candidate = {
                "date": date,
                "title": first_line[:100],
                "description": f"[{repo_name}] {first_line}",
                "category": categorize(message),
                "url": url,
                "source": "git",
                "repo": repo_name,
                "reason": reason,
                "sha": sha[:8],
            }

            # Check day+title dedup
            dt_key = f"{date[:10]}|{first_line[:40]}"
            if dt_key in existing_day_titles:
                continue

            new_candidates.append(candidate)
            print(f"  CANDIDATE: {first_line[:60]} ({reason})")

    print(f"\n{'=' * 40}")
    print(f"Found {len(new_candidates)} new candidates")

    if args.dry_run:
        for c in new_candidates:
            print(f"  [{c['date'][:10]}] [{c['repo']}] {c['title']}")
        return

    if not new_candidates:
        print("No new candidates to write.")
        return

    # Merge with existing candidates (append, don't overwrite)
    all_candidates = existing_candidates + new_candidates
    all_candidates.sort(key=lambda x: x.get("date", ""))

    with open(CANDIDATES_PATH, "w") as f:
        json.dump(all_candidates, f, indent=2)

    print(f"Wrote {len(all_candidates)} total candidates to {CANDIDATES_PATH}")
    print(f"  ({len(new_candidates)} new, {len(existing_candidates)} existing)")


if __name__ == "__main__":
    main()
