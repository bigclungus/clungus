#!/usr/bin/env python3
"""
Extract concrete operational directives from congress verdicts and
append them to learned-directives.md. Run on each startup.

Idempotent: checks session_id before appending, so re-running is safe.
"""
import glob
import json
import os
import subprocess
from pathlib import Path

SESSIONS_DIR = Path("/home/clungus/work/hello-world/sessions")
DIRECTIVES_FILE = Path("/home/clungus/work/bigclungus-meta/learned-directives.md")
N_SESSIONS = 5


def already_recorded(session_id: str, content: str) -> bool:
    return f"[{session_id}]" in content


def main():
    current = DIRECTIVES_FILE.read_text() if DIRECTIVES_FILE.exists() else ""

    session_files = sorted(glob.glob(str(SESSIONS_DIR / "congress-00*.json")))[-N_SESSIONS:]
    new_entries = []

    for path in session_files:
        try:
            d = json.load(open(path))
        except Exception as e:
            print(f"Skipping {path}: {e}")
            continue

        session_id = d.get("session_id", "")
        verdict = d.get("verdict") or ""
        status = d.get("status", "")

        # Only process completed sessions with substantive verdicts
        if status != "done" or not verdict or len(verdict) < 50:
            continue

        # Skip Ibrahim-aborted sessions (spoof topics, shitposts, etc.)
        if verdict.strip().startswith("ABORTED by Ibrahim:"):
            print(f"Skipping aborted session: {session_id} (Congress #{d.get('session_number', '?')})")
            continue

        # Skip already-recorded sessions (idempotent)
        if already_recorded(session_id, current):
            print(f"Already recorded: {session_id}")
            continue

        topic = d.get("topic", "unknown topic")
        session_num = d.get("session_number", "?")
        date_str = (d.get("started_at") or "")[:10]

        # Collect evolution notes from personas, if any
        evolution = d.get("evolution", {})
        if isinstance(evolution, str):
            import json as _json
            try:
                evolution = _json.loads(evolution)
            except Exception:
                evolution = {}
        evolved = evolution.get("evolved", [])
        evolution_notes = ""
        if evolved:
            lines = []
            for p in evolved:
                name = p.get("display_name", "?")
                learned = p.get("learned", "")
                if learned:
                    lines.append(f"- **{name}:** {learned}")
            if lines:
                evolution_notes = "\n\n**Persona learnings:**\n" + "\n".join(lines)

        entry = f"""
## [{session_id}] Congress #{session_num} — {date_str}
**Topic:** {topic}

**Verdict:**
{verdict[:1000].rstrip()}{evolution_notes}

---
"""
        new_entries.append(entry)
        print(f"Adding directives from {session_id} (Congress #{session_num})")

    if not new_entries:
        print("No new directives to add.")
        return

    updated = current + "\n".join(new_entries)
    DIRECTIVES_FILE.write_text(updated)
    print(f"Wrote {len(new_entries)} new directive(s) to {DIRECTIVES_FILE}")

    # Commit and push
    repo = Path("/home/clungus/work/bigclungus-meta")
    subprocess.run(["git", "add", "learned-directives.md"], cwd=repo, check=True)
    result = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=repo)
    if result.returncode != 0:
        subprocess.run(
            [
                "git",
                "commit",
                "-m",
                f"Update learned-directives from {len(new_entries)} congress session(s)\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>",
            ],
            cwd=repo,
            check=True,
        )
        subprocess.run(["git", "push"], cwd=repo, check=True)
        print(f"Committed and pushed {len(new_entries)} new directive(s).")
    else:
        print("No changes to commit (already up to date).")


if __name__ == "__main__":
    main()
