#!/usr/bin/env python3
"""
Migrate all congress session JSON files to a standardized schema.

Canonical schema:
  session_id, session_number, topic, mode, status, started_at, finished_at,
  discord_user, thread_id, roster, rounds, vote_summary, evolution, verdict,
  failure_reason, task_titles, notes

All fields present in every file (null if unknown). Original data preserved
under _original_keys for any field that was transformed.
"""

import json
import glob
import os
import sys
import copy
import re
from datetime import datetime

SESSIONS_DIR = "/home/clungus/work/hello-world/sessions"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_json_string(val):
    """If val is a JSON string, parse it; otherwise return as-is."""
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, ValueError):
            return val
    return val


def infer_mode(session):
    """Infer session mode from available signals."""
    if "mode" in session and session["mode"]:
        return session["mode"]
    topic = (session.get("topic") or "").lower()
    # meme-congress topics often have meme markers
    if any(kw in topic for kw in ["meme", "shitpost", "coconut tree", "dank"]):
        return "meme"
    return "standard"


def infer_status(session):
    """Normalize status values."""
    raw = session.get("status", "")
    if raw == "done":
        # Check if it was actually an abort
        verdict = session.get("verdict") or ""
        if "ABORTED" in verdict.upper():
            return "completed"  # aborted sessions are still 'completed' workflow-wise
        return "completed"
    elif raw == "failed":
        return "failed"
    elif raw == "cancelled":
        return "cancelled"
    elif raw == "deliberating":
        return "in_progress"
    elif raw == "completed":
        return "completed"
    else:
        # Guess from content
        if session.get("verdict"):
            return "completed"
        if session.get("failure_reason"):
            return "failed"
        return "unknown"


def normalize_evolution(raw_evo):
    """
    Normalize evolution to canonical dict format:
    {
        "evolved": [{"slug": str, "display_name": str, "learned": str}],
        "fired": [{"slug": str, "display_name": str, "reason": str}],
        "retained": [{"slug": str, "display_name": str}],
        "created": [{"slug": str, "display_name": str, "reason": str}]
    }
    """
    if raw_evo is None:
        return None

    evo = parse_json_string(raw_evo)

    # Session 71 style: {persona_slug: "EVOLVE"|"RETAIN"|...}
    if isinstance(evo, dict) and evo and all(isinstance(v, str) for v in evo.values()):
        first_val = next(iter(evo.values()), "")
        if first_val.upper() in ("EVOLVE", "RETAIN", "FIRE", "CREATE"):
            result = {"evolved": [], "fired": [], "retained": [], "created": []}
            for slug, action in evo.items():
                action_upper = action.upper()
                if action_upper == "EVOLVE":
                    result["evolved"].append({"slug": slug, "display_name": slug, "learned": ""})
                elif action_upper == "RETAIN":
                    result["retained"].append({"slug": slug, "display_name": slug})
                elif action_upper == "FIRE":
                    result["fired"].append({"slug": slug, "display_name": slug, "reason": ""})
                elif action_upper == "CREATE":
                    result["created"].append({"slug": slug, "display_name": slug, "reason": ""})
            return result

    # Standard format with evolved/fired/retained/created keys
    if isinstance(evo, dict):
        result = {
            "evolved": [],
            "fired": [],
            "retained": [],
            "created": []
        }
        for item in (evo.get("evolved") or []):
            if isinstance(item, dict):
                result["evolved"].append({
                    "slug": item.get("slug", item.get("name", "")),
                    "display_name": item.get("display_name", ""),
                    "learned": item.get("learned", "")
                })
            elif isinstance(item, str):
                result["evolved"].append({"slug": "", "display_name": item, "learned": ""})

        for item in (evo.get("fired") or []):
            if isinstance(item, dict):
                result["fired"].append({
                    "slug": item.get("slug", item.get("name", "")),
                    "display_name": item.get("display_name", ""),
                    "reason": item.get("reason", "")
                })
            elif isinstance(item, str):
                result["fired"].append({"slug": "", "display_name": item, "reason": ""})

        for item in (evo.get("retained") or []):
            if isinstance(item, dict):
                result["retained"].append({
                    "slug": item.get("slug", item.get("name", "")),
                    "display_name": item.get("display_name", "")
                })
            elif isinstance(item, str):
                result["retained"].append({"slug": "", "display_name": item})

        for item in (evo.get("created") or []):
            if isinstance(item, dict):
                result["created"].append({
                    "slug": item.get("slug", item.get("name", "")),
                    "display_name": item.get("display_name", ""),
                    "reason": item.get("reason", "")
                })
            elif isinstance(item, str):
                result["created"].append({"slug": "", "display_name": item, "reason": ""})

        return result

    return None


def normalize_vote_summary(raw_vs, rounds=None, roster=None):
    """
    Normalize vote_summary to canonical dict format:
    {
        "agree": ["Display Name", ...],
        "disagree": ["Display Name", ...],
        "tally": "X-Y"
    }
    """
    if isinstance(raw_vs, dict) and ("agree" in raw_vs or "disagree" in raw_vs):
        # Already structured
        agree = raw_vs.get("agree", [])
        disagree = raw_vs.get("disagree", [])
        tally = raw_vs.get("tally", f"{len(agree)}-{len(disagree)}")
        return {"agree": agree, "disagree": disagree, "tally": tally}

    if isinstance(raw_vs, str) and raw_vs.strip():
        # Try to parse "4 AGREE, 1 DISAGREE (...)" format
        result = {"agree": [], "disagree": [], "tally": ""}
        m = re.match(r"(\d+)\s*AGREE.*?(\d+)\s*DISAGREE", raw_vs, re.IGNORECASE)
        if m:
            result["tally"] = f"{m.group(1)}-{m.group(2)}"
        return result

    # Try to extract from rounds (vote rounds have AGREE/DISAGREE prefix)
    if rounds:
        agree = []
        disagree = []
        # Build display_name lookup from roster
        id_to_name = {}
        if roster:
            for p in roster:
                pid = p.get("id") or p.get("name", "")
                dn = p.get("display_name", pid)
                id_to_name[pid] = dn

        for r in rounds:
            ident = r.get("identity", "")
            resp = (r.get("response") or "").strip()
            if ident and ident != "chairman":
                if re.match(r"^AGREE\b", resp, re.IGNORECASE):
                    agree.append(id_to_name.get(ident, ident))
                elif re.match(r"^DISAGREE\b", resp, re.IGNORECASE):
                    disagree.append(id_to_name.get(ident, ident))

        if agree or disagree:
            return {"agree": agree, "disagree": disagree, "tally": f"{len(agree)}-{len(disagree)}"}

    return None


def normalize_roster(roster):
    """Ensure roster entries have consistent keys."""
    if not roster or not isinstance(roster, list):
        return None

    normalized = []
    for p in roster:
        if not isinstance(p, dict):
            continue
        normalized.append({
            "id": p.get("id") or p.get("name", ""),
            "display_name": p.get("display_name", ""),
            "title": p.get("title", ""),
            "role": p.get("role", ""),
            "model": p.get("model", ""),
            "status": p.get("status", ""),
            "avatar_url": p.get("avatar_url", ""),
        })
    return normalized if normalized else None


def normalize_rounds(rounds):
    """Ensure rounds have consistent keys."""
    if not rounds or not isinstance(rounds, list):
        return []

    normalized = []
    for r in rounds:
        if not isinstance(r, dict):
            continue
        normalized.append({
            "ts": r.get("ts", ""),
            "identity": r.get("identity", ""),
            "response": r.get("response", ""),
            "model": r.get("model", None),
        })
    return normalized


def collect_notes(session):
    """Gather any notes from various fields into a single list."""
    notes = []
    if session.get("note"):
        notes.append(session["note"])
    return notes if notes else None


def migrate_session(filepath):
    """Migrate a single session file. Returns (session_number, changes_made)."""
    with open(filepath) as f:
        original = json.load(f)

    session = copy.deepcopy(original)
    changes = []

    sn = session.get("session_number", 0)

    # Track which original keys existed but aren't in canonical schema
    canonical_keys = {
        "session_id", "session_number", "topic", "mode", "status",
        "started_at", "finished_at", "discord_user", "thread_id",
        "roster", "rounds", "vote_summary", "evolution", "verdict",
        "failure_reason", "task_titles", "notes"
    }
    extra_keys = set(original.keys()) - canonical_keys
    transformed_originals = {}

    # --- session_id ---
    # no change needed, always present

    # --- mode ---
    old_mode = original.get("mode")
    new_mode = infer_mode(original)
    if old_mode != new_mode:
        changes.append(f"mode: {old_mode!r} -> {new_mode!r}")

    # --- status ---
    old_status = original.get("status", "")
    new_status = infer_status(original)
    if old_status != new_status:
        changes.append(f"status: {old_status!r} -> {new_status!r}")

    # --- evolution ---
    raw_evo = original.get("evolution")
    new_evo = normalize_evolution(raw_evo)
    if raw_evo is not None and raw_evo != new_evo:
        if isinstance(raw_evo, str):
            changes.append("evolution: parsed from JSON string to dict")
            transformed_originals["evolution"] = raw_evo
        elif raw_evo != new_evo:
            changes.append("evolution: restructured to canonical format")
            transformed_originals["evolution"] = raw_evo

    # --- vote_summary ---
    raw_vs = original.get("vote_summary")
    new_vs = normalize_vote_summary(
        raw_vs,
        rounds=original.get("rounds"),
        roster=original.get("roster")
    )
    if raw_vs is not None and isinstance(raw_vs, str):
        changes.append("vote_summary: parsed from string to dict")
        transformed_originals["vote_summary"] = raw_vs
    elif raw_vs is None and new_vs is not None:
        changes.append("vote_summary: extracted from round responses")

    # --- roster ---
    raw_roster = original.get("roster")
    new_roster = normalize_roster(raw_roster)
    if raw_roster and new_roster and len(raw_roster) > 0:
        # Check if keys were trimmed
        orig_keys = set(raw_roster[0].keys()) if raw_roster else set()
        new_keys = set(new_roster[0].keys()) if new_roster else set()
        if orig_keys != new_keys:
            changes.append(f"roster: normalized keys ({orig_keys - new_keys} removed)")

    # --- rounds ---
    raw_rounds = original.get("rounds")
    new_rounds = normalize_rounds(raw_rounds)

    # --- verdict ---
    verdict = original.get("verdict")
    if verdict is None:
        verdict = ""
        if original.get("verdict") is None and "verdict" in original:
            changes.append("verdict: null -> empty string")

    # --- notes ---
    notes = collect_notes(original)

    # --- finished_at ---
    finished_at = original.get("finished_at") or original.get("ended_at") or None
    if "ended_at" in original and "finished_at" not in original:
        changes.append("finished_at: migrated from ended_at")

    # --- Build canonical output ---
    canonical = {
        "session_id": original.get("session_id", ""),
        "session_number": sn,
        "topic": original.get("topic", ""),
        "mode": new_mode,
        "status": new_status,
        "started_at": original.get("started_at") or original.get("created_at") or None,
        "finished_at": finished_at,
        "discord_user": original.get("discord_user") or None,
        "thread_id": original.get("thread_id") or None,
        "roster": new_roster,
        "rounds": new_rounds,
        "vote_summary": new_vs,
        "evolution": new_evo,
        "verdict": verdict if verdict else None,
        "failure_reason": original.get("failure_reason") or None,
        "task_titles": original.get("task_titles") or None,
        "notes": notes,
    }

    # Preserve any transformed original values for auditability
    if transformed_originals:
        canonical["_original_transforms"] = transformed_originals

    # Track removed extra keys
    removed_keys = extra_keys - {"note", "ended_at", "created_at", "personas", "create",
                                  "chat_id", "message_id", "session_type"}
    preserved_extras = {}
    for k in extra_keys:
        if k not in canonical and k not in {"note", "ended_at", "created_at"}:
            preserved_extras[k] = original[k]
    if preserved_extras:
        canonical["_extra_fields"] = preserved_extras
        changes.append(f"preserved extra fields: {list(preserved_extras.keys())}")

    if not changes:
        changes.append("(no transforms needed, only schema enforcement)")

    return canonical, changes


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    dry_run = "--dry-run" in sys.argv

    files = sorted(glob.glob(os.path.join(SESSIONS_DIR, "congress-*.json")))
    print(f"Found {len(files)} congress session files")
    if dry_run:
        print("=== DRY RUN — no files will be modified ===\n")

    stats = {
        "total": len(files),
        "migrated": 0,
        "status_changed": 0,
        "evolution_parsed": 0,
        "vote_summary_extracted": 0,
        "mode_inferred": 0,
        "errors": 0,
    }
    all_changes = []

    for filepath in files:
        fname = os.path.basename(filepath)
        try:
            canonical, changes = migrate_session(filepath)
            sn = canonical["session_number"]

            for c in changes:
                if "status:" in c:
                    stats["status_changed"] += 1
                if "evolution:" in c:
                    stats["evolution_parsed"] += 1
                if "vote_summary:" in c:
                    stats["vote_summary_extracted"] += 1
                if "mode:" in c:
                    stats["mode_inferred"] += 1

            print(f"Session {sn:4d} ({canonical['status']:10s}): {', '.join(changes)}")
            all_changes.append({"session": sn, "changes": changes})

            if not dry_run:
                with open(filepath, "w") as f:
                    json.dump(canonical, f, indent=2, ensure_ascii=False)
                    f.write("\n")

            stats["migrated"] += 1

        except Exception as e:
            print(f"ERROR processing {fname}: {e}")
            stats["errors"] += 1

    print(f"\n{'='*60}")
    print(f"MIGRATION {'(DRY RUN) ' if dry_run else ''}COMPLETE")
    print(f"{'='*60}")
    print(f"Total sessions:           {stats['total']}")
    print(f"Successfully migrated:    {stats['migrated']}")
    print(f"Status normalized:        {stats['status_changed']}")
    print(f"Evolution parsed/fixed:   {stats['evolution_parsed']}")
    print(f"Vote summary extracted:   {stats['vote_summary_extracted']}")
    print(f"Mode inferred:            {stats['mode_inferred']}")
    print(f"Errors:                   {stats['errors']}")

    return stats


if __name__ == "__main__":
    main()
