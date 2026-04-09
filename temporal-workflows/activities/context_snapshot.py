"""
context_snapshot.py — Activity that generates CONTEXT.md from recent session analysis.

Steps:
1. Scan session JSONL files in /home/clungus/.claude/projects/-mnt-data/*.jsonl
   (last 10 sessions by mtime)
2. Parse each JSONL line, look for tool_use with name="Read" — extract the file_path param
3. Count file read frequency across all sessions
4. Top 15 most-read files → read their contents (skip if >5000 chars, truncate)
5. Also generate repo tree: ls /mnt/data top-level dirs + key subdirs
6. Write output to /mnt/data/context-snapshot/CONTEXT.md
7. Return a summary dict: {files_analyzed, top_files: [(path, count)], snapshot_size_bytes}
"""

import json
import logging
import os
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from temporalio import activity

SESSIONS_DIR = Path("/home/clungus/.claude/projects/-mnt-data")
OUTPUT_DIR = Path("/mnt/data/context-snapshot")
OUTPUT_FILE = OUTPUT_DIR / "CONTEXT.md"
MAX_SESSIONS = 10
MAX_FILE_CHARS = 5000
TOP_N = 15


def _parse_file_reads(jsonl_path: Path) -> list[str]:
    """Parse a JSONL session file and return all file_path values from Read tool_use calls."""
    paths: list[str] = []
    try:
        with open(jsonl_path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue

                # Format 1: {"type": "tool_use", "name": "Read", "input": {"file_path": "..."}}
                if (
                    obj.get("type") == "tool_use"
                    and obj.get("name") == "Read"
                    and isinstance(obj.get("input"), dict)
                ):
                    fp = obj["input"].get("file_path")
                    if fp:
                        paths.append(fp)
                    continue

                # Format 2: {"type": "assistant", "message": {"content": [...]}}
                msg = obj.get("message") or {}
                content = msg.get("content") or []
                if isinstance(content, list):
                    for item in content:
                        if (
                            isinstance(item, dict)
                            and item.get("type") == "tool_use"
                            and item.get("name") == "Read"
                            and isinstance(item.get("input"), dict)
                        ):
                            fp = item["input"].get("file_path")
                            if fp:
                                paths.append(fp)
    except Exception as exc:
        activity.logger.warning("Failed to parse %s: %s", jsonl_path, exc)
    return paths


def _read_file_safe(path: str, max_chars: int = MAX_FILE_CHARS) -> tuple[str, bool]:
    """Read a file, returning (content, truncated). Returns ('', False) on error."""
    try:
        p = Path(path)
        if not p.exists() or not p.is_file():
            return ("", False)
        text = p.read_text(encoding="utf-8", errors="replace")
        if len(text) > max_chars:
            return (text[:max_chars], True)
        return (text, False)
    except Exception as e:
        logging.warning("[context_snapshot] failed to read file %s: %s", p, e)
        return ("", False)


def _repo_tree() -> str:
    """Generate a directory tree of /mnt/data top-level + key subdirs."""
    lines: list[str] = []

    # Top-level dirs
    try:
        result = subprocess.run(
            ["ls", "-1", "/mnt/data"],
            capture_output=True, text=True, timeout=10
        )
        entries = result.stdout.strip().splitlines()
        lines.append("## /mnt/data top-level")
        for e in entries:
            full = Path("/mnt/data") / e
            suffix = "/" if full.is_dir() else ""
            lines.append(f"  {e}{suffix}")
    except Exception as exc:
        lines.append(f"(tree error: {exc})")

    # Key subdirs
    key_subdirs = [
        "/mnt/data/temporal-workflows",
        "/mnt/data/temporal-workflows/activities",
        "/mnt/data/temporal-workflows/workflows",
        "/mnt/data/omni/omnichannel",
        "/mnt/data/scripts",
        "/mnt/data/clunger/src",
    ]
    for subdir in key_subdirs:
        p = Path(subdir)
        if not p.exists():
            continue
        try:
            entries = sorted(os.listdir(subdir))
            lines.append(f"\n## {subdir}")
            for e in entries:
                full = p / e
                suffix = "/" if full.is_dir() else ""
                lines.append(f"  {e}{suffix}")
        except Exception as exc:
            lines.append(f"  (error: {exc})")

    return "\n".join(lines)


@activity.defn
async def generate_context_snapshot() -> dict:
    """Generate CONTEXT.md from recent session analysis."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Find last N sessions by mtime
    all_jsonls = sorted(
        SESSIONS_DIR.glob("*.jsonl"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    recent = all_jsonls[:MAX_SESSIONS]
    activity.logger.info("Analyzing %d session files", len(recent))

    # Count file reads across all sessions
    counter: Counter = Counter()
    files_analyzed = len(recent)
    for jsonl in recent:
        reads = _parse_file_reads(jsonl)
        counter.update(reads)

    top_files: list[tuple[str, int]] = counter.most_common(TOP_N)
    activity.logger.info("Top files: %s", top_files)

    # Build CONTEXT.md
    lines: list[str] = []
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines.append("# BigClungus Context Snapshot")
    lines.append(f"Generated: {now}")
    lines.append(f"Sessions analyzed: {files_analyzed} (of {len(all_jsonls)} total)")
    lines.append("")

    lines.append("## Top 15 Most-Read Files")
    lines.append("")
    if top_files:
        for i, (path, count) in enumerate(top_files, 1):
            lines.append(f"{i:2d}. `{path}` ({count} reads)")
    else:
        lines.append("(no Read tool calls found)")
    lines.append("")

    lines.append("## File Contents")
    lines.append("")
    for path, count in top_files:
        content, truncated = _read_file_safe(path)
        lines.append(f"### `{path}` ({count} reads)")
        if not content:
            lines.append("_(file not found or unreadable)_")
        else:
            lines.append("```")
            lines.append(content)
            lines.append("```")
            if truncated:
                lines.append(f"_(truncated at {MAX_FILE_CHARS} chars)_")
        lines.append("")

    lines.append("## Repository Tree")
    lines.append("")
    lines.append(_repo_tree())
    lines.append("")

    output = "\n".join(lines)
    OUTPUT_FILE.write_text(output, encoding="utf-8")
    snapshot_size = OUTPUT_FILE.stat().st_size

    activity.logger.info("Wrote %d bytes to %s", snapshot_size, OUTPUT_FILE)

    return {
        "files_analyzed": files_analyzed,
        "top_files": top_files,
        "snapshot_size_bytes": snapshot_size,
        "output_path": str(OUTPUT_FILE),
    }
