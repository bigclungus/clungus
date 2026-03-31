#!/usr/bin/env python3
"""
timeline_add.py -- Add a timeline entry via the clunger API.

Usage:
  python3 /mnt/data/scripts/timeline_add.py "Launched the thing" --category feature --url https://...
  python3 /mnt/data/scripts/timeline_add.py "Something happened" --source discord
"""

import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

API_BASE = "http://localhost:8081"
INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "")

CATEGORY_KEYWORDS = {
    "infrastructure": re.compile(r"\b(infra|deploy|server|service|proxy|auth|migrate|tunnel|docker|systemd)\b", re.I),
    "congress-system": re.compile(r"\b(congress|persona|trial|debate|verdict|chairman)\b", re.I),
    "labs": re.compile(r"\b(lab|experiment)\b", re.I),
    "feature": re.compile(r"\b(add|feature|implement|create|new|ship|launch|build)\b", re.I),
    "succession": re.compile(r"\b(succession|restart|handoff|transfer)\b", re.I),
}


def auto_categorize(text: str) -> str:
    for cat, pattern in CATEGORY_KEYWORDS.items():
        if pattern.search(text):
            return cat
    return "milestone"


def load_internal_token() -> str:
    """Try to load INTERNAL_TOKEN from clunger's .env if not in environment."""
    if INTERNAL_TOKEN:
        return INTERNAL_TOKEN
    env_path = "/mnt/data/clunger/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("INTERNAL_TOKEN="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def main():
    parser = argparse.ArgumentParser(description="Add a timeline entry")
    parser.add_argument("description", help="Event description (becomes title)")
    parser.add_argument("--category", default=None, help="Category (auto-detected if omitted)")
    parser.add_argument("--url", default=None, help="Source URL")
    parser.add_argument("--source", default="manual", choices=["manual", "discord", "git"], help="Provenance")
    parser.add_argument("--date", default=None, help="ISO date (default: now)")
    parser.add_argument("--icon", default=None, help="Lucide icon name")
    args = parser.parse_args()

    category = args.category or auto_categorize(args.description)
    date = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    entry = {
        "date": date,
        "title": args.description,
        "description": args.description,
        "category": category,
        "source": args.source,
    }
    if args.url:
        entry["url"] = args.url
    if args.icon:
        entry["icon"] = args.icon

    token = load_internal_token()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["X-Internal-Token"] = token

    data = json.dumps(entry).encode("utf-8")
    req = urllib.request.Request(
        f"{API_BASE}/api/timeline",
        data=data,
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            print(f"Added timeline entry (id={result.get('id')}): {args.description}")
            print(f"  category: {category}, source: {args.source}, date: {date}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"ERROR: HTTP {e.code}: {body}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
