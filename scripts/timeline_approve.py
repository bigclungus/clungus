#!/usr/bin/env python3
"""
timeline_approve.py -- Review and approve/reject timeline candidates.

Reads from /mnt/data/hello-world/data/timeline-candidates.json,
posts approved entries to the clunger timeline API,
and removes processed candidates.

Usage:
  python3 /mnt/data/scripts/timeline_approve.py --approve-all  # approve everything
  python3 /mnt/data/scripts/timeline_approve.py --list         # list candidates without acting
  python3 /mnt/data/scripts/timeline_approve.py --approve 0 2  # approve by index
  python3 /mnt/data/scripts/timeline_approve.py --reject 1 3   # reject by index
"""

import argparse
import json
import os
import sys
import urllib.request

CANDIDATES_PATH = "/mnt/data/hello-world/data/timeline-candidates.json"
API_BASE = "http://localhost:8081"


def load_json(path: str) -> list[dict]:
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return json.load(f)


def save_json(path: str, data: list[dict]) -> None:
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Saved {len(data)} entries to {path}")


def load_internal_token() -> str:
    token = os.environ.get("INTERNAL_TOKEN", "")
    if token:
        return token
    env_path = "/mnt/data/clunger/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("INTERNAL_TOKEN="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def post_to_api(entry: dict, token: str) -> dict | None:
    """Post an approved timeline entry to the clunger API."""
    strip_fields = {"repo", "reason", "sha"}
    clean = {k: v for k, v in entry.items() if k not in strip_fields}

    headers = {"Content-Type": "application/json"}
    if token:
        headers["X-Internal-Token"] = token

    data = json.dumps(clean).encode("utf-8")
    req = urllib.request.Request(
        f"{API_BASE}/api/timeline",
        data=data,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  ERROR posting entry: HTTP {e.code}: {body}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  ERROR posting entry: {e}", file=sys.stderr)
        return None


def display_candidates(candidates: list[dict]) -> None:
    if not candidates:
        print("No candidates to review.")
        return
    for i, c in enumerate(candidates):
        date = c.get("date", "?")[:10]
        repo = c.get("repo", "?")
        title = c.get("title", "?")
        reason = c.get("reason", "?")
        cat = c.get("category", "?")
        print(f"  [{i}] {date} | {repo} | {cat} | {title}")
        print(f"       reason: {reason}")
        if c.get("url"):
            print(f"       url: {c['url']}")
        print()


def main():
    parser = argparse.ArgumentParser(description="Approve/reject timeline candidates")
    parser.add_argument("--list", action="store_true", help="List candidates without acting")
    parser.add_argument("--approve-all", action="store_true", help="Approve all candidates")
    parser.add_argument("--approve", nargs="+", type=int, metavar="IDX", help="Approve by index")
    parser.add_argument("--reject", nargs="+", type=int, metavar="IDX", help="Reject by index")
    args = parser.parse_args()

    candidates = load_json(CANDIDATES_PATH)
    if not candidates:
        print("No candidates to review.")
        return

    print(f"\n{len(candidates)} timeline candidates:\n")
    display_candidates(candidates)

    if args.list:
        return

    if args.approve_all:
        approved = candidates
        remaining = []
    elif args.approve is not None or args.reject is not None:
        approve_set = set(args.approve or [])
        reject_set = set(args.reject or [])
        overlap = approve_set & reject_set
        if overlap:
            print(f"ERROR: indices {overlap} appear in both --approve and --reject", file=sys.stderr)
            sys.exit(1)
        approved = [candidates[i] for i in sorted(approve_set) if 0 <= i < len(candidates)]
        remaining = [
            c for i, c in enumerate(candidates)
            if i not in approve_set and i not in reject_set
        ]
    else:
        # Non-interactive: list only
        print("Use --approve-all, --approve <idx>, or --reject <idx>")
        return

    print(f"\nApproved: {len(approved)}, Remaining: {len(remaining)}")

    token = load_internal_token()
    posted = 0
    for entry in approved:
        result = post_to_api(entry, token)
        if result:
            posted += 1
            print(f"  Posted: {entry.get('title', '?')[:60]} (id={result.get('id')})")
        else:
            # On failure, keep it in remaining so it can be retried
            remaining.append(entry)

    print(f"\nPosted {posted}/{len(approved)} entries to API")

    # Write back remaining candidates
    save_json(CANDIDATES_PATH, remaining)


if __name__ == "__main__":
    main()
