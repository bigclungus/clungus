#!/usr/bin/env python3
"""
memory-sweep-cron.py -- Inject a sweep request for stale memory files.

Runs every 4 hours via systemd timer. Sends a [memory-sweep] message for each
file that is:
  - >1 day old (by mtime)
  - not verified in the last 24 hours (by "last verified" tag in content, else mtime)
  - not already checked today (tracked in /tmp/memory-sweep-checked.json)

Caps at MAX_PER_RUN files per run (oldest-first). Exits silently if nothing qualifies.
After dispatching individual sweep messages, sends one [memory-sweep-complete] message
with the full list so BigClungus can post a Discord recap.
"""

import os
import sys
import json
import re
import urllib.error
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from omni_inject import inject as omni_inject

MEMORY_DIR = Path("/home/clungus/.claude/projects/-mnt-data/memory")
CHECKED_FILE = Path("/tmp/memory-sweep-checked.json")

# Thresholds
MIN_AGE_DAYS = 1       # file must be at least this old (by mtime)
MIN_STALE_HOURS = 24   # file must not have been verified within this window
MAX_PER_RUN = 5        # cap: at most this many sweeps dispatched per run


def parse_verified_date(content: str) -> datetime | None:
    """
    Look for a line like:
      > last verified: YYYY-MM-DD -- ...
    Returns a UTC datetime if found, else None.
    """
    match = re.search(r">\s*last verified:\s*(\d{4}-\d{2}-\d{2})", content)
    if not match:
        return None
    try:
        dt = datetime.strptime(match.group(1), "%Y-%m-%d")
        return dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def get_staleness_date(path: Path, content: str) -> datetime:
    """
    Returns the datetime representing when the file was last confirmed fresh.
    Priority: verified date from content > file mtime.
    """
    verified = parse_verified_date(content)
    if verified is not None:
        return verified
    mtime = os.path.getmtime(path)
    return datetime.fromtimestamp(mtime, tz=timezone.utc)


def load_checked_today() -> set:
    """
    Load the set of filenames already injected today.
    Clears the file if it's from a previous UTC day.
    """
    today = datetime.now(tz=timezone.utc).date().isoformat()
    if not CHECKED_FILE.exists():
        return set()
    try:
        data = json.loads(CHECKED_FILE.read_text())
        if data.get("date") != today:
            return set()
        return set(data.get("files", []))
    except (json.JSONDecodeError, KeyError):
        return set()


def save_checked_today(filenames: set) -> None:
    today = datetime.now(tz=timezone.utc).date().isoformat()
    CHECKED_FILE.write_text(json.dumps({"date": today, "files": sorted(filenames)}))


def inject(filename: str, content: str) -> None:
    omni_inject(
        f"[memory-sweep] file={filename}\n\nMEMORY CONTENT:\n{content}",
        user="memory-sweeper",
        timeout=10,
    )


def inject_batch_complete(filenames: list[str]) -> None:
    """Send a single [memory-sweep-complete] message listing all dispatched files."""
    file_list = ", ".join(filenames)
    omni_inject(
        f"[memory-sweep-complete] count={len(filenames)} files: {file_list}",
        user="memory-sweeper",
        timeout=10,
    )


def main() -> None:
    now = datetime.now(tz=timezone.utc)
    checked_today = load_checked_today()

    candidates = []  # list of (staleness_date, filename, content)

    for path in sorted(MEMORY_DIR.glob("*.md")):
        if path.name == "MEMORY.md":
            continue

        # Skip if already injected today
        if path.name in checked_today:
            continue

        content = path.read_text(encoding="utf-8")
        file_age = now - datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)

        # File must exist for at least MIN_AGE_DAYS
        if file_age < timedelta(days=MIN_AGE_DAYS):
            continue

        staleness_date = get_staleness_date(path, content)

        # Must not have been verified within the last 24 hours
        if (now - staleness_date) < timedelta(hours=MIN_STALE_HOURS):
            continue

        candidates.append((staleness_date, path.name, content))

    if not candidates:
        sys.exit(0)

    # Sort oldest-first and cap at MAX_PER_RUN
    candidates.sort(key=lambda x: x[0])
    candidates = candidates[:MAX_PER_RUN]

    newly_checked = set()
    errors = []
    dispatched = []

    for _staleness, filename, content in candidates:
        try:
            inject(filename, content)
            newly_checked.add(filename)
            dispatched.append(filename)
            print(f"Injected memory-sweep for: {filename}")
        except urllib.error.URLError as e:
            errors.append(f"{filename}: failed to reach omni webhook: {e}")
        except Exception as e:
            errors.append(f"{filename}: {e}")

    # Persist the updated checked set (merge with existing)
    save_checked_today(checked_today | newly_checked)

    # Send the batch-complete recap message after all individual sweeps are dispatched
    if dispatched:
        try:
            inject_batch_complete(dispatched)
            print(f"Sent memory-sweep-complete for {len(dispatched)} file(s)")
        except Exception as e:
            errors.append(f"batch-complete message: {e}")

    if errors:
        raise RuntimeError("Some sweeps failed:\n" + "\n".join(errors))


if __name__ == "__main__":
    main()
