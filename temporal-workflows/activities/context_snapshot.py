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

from json import loads, JSONDecodeError
from logging import getLogger
from subprocess import run
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from temporalio import activity

from .constants import BASE_DIR, CLAUDE_SESSIONS_DIR

logger = getLogger(__name__)

OUTPUT_DIR = Path(BASE_DIR) / "context-snapshot"
OUTPUT_FILE = OUTPUT_DIR / "CONTEXT.md"
MAX_SESSIONS = 10
MAX_FILE_CHARS = 5000
TOP_N = 15


def _parse_file_reads(jsonl_path: Path) -> list[str]:
    """Parse a JSONL session file and return all file_path values from Read tool_use calls."""
    paths: list[str] = []
    try:
        for line in jsonl_path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = loads(line)
            except JSONDecodeError:
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
    except Exception as exc:
        logger.warning("[context_snapshot] failed to read file %s: %s", p, exc)
        return ("", False)


def _repo_tree() -> str:
    """Generate a directory tree of /mnt/data top-level + key subdirs."""
    lines: list[str] = []

    # Top-level dirs
    try:
        result = run(
            ["ls", "-1", BASE_DIR],
            capture_output=True, text=True, timeout=10
        )
        entries = result.stdout.strip().splitlines()
        lines.append(f"## {BASE_DIR} top-level")
        for entry in entries:
            full = Path(BASE_DIR) / entry
            suffix = "/" if full.is_dir() else ""
            lines.append(f"  {entry}{suffix}")
    except Exception as exc:
        lines.append(f"(tree error: {exc})")

    # Key subdirs
    key_subdirs = [
        f"{BASE_DIR}/temporal-workflows",
        f"{BASE_DIR}/temporal-workflows/activities",
        f"{BASE_DIR}/temporal-workflows/workflows",
        f"{BASE_DIR}/omni/omnichannel",
        f"{BASE_DIR}/scripts",
        f"{BASE_DIR}/clunger/src",
    ]
    for subdir in key_subdirs:
        p = Path(subdir)
        if not p.exists():
            continue
        try:
            entries = sorted(p.iterdir(), key=lambda x: x.name)
            lines.append(f"\n## {subdir}")
            for entry in entries:
                name = entry.name
                suffix = "/" if entry.is_dir() else ""
                lines.append(f"  {name}{suffix}")
        except Exception as exc:
            lines.append(f"  (error: {exc})")

    return "\n".join(lines)


@activity.defn
async def generate_context_snapshot() -> dict:
    """Generate CONTEXT.md from recent session analysis."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Find last N sessions by mtime
    all_jsonls = sorted(
        CLAUDE_SESSIONS_DIR.glob("*.jsonl"),
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
