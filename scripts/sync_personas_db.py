#!/usr/bin/env python3
"""
sync_personas_db.py — Sync persona metadata from markdown files into SQLite.

Scans agents/*.md, parses YAML frontmatter, computes prose body hashes,
then inserts/updates rows in personas.db. Status values are passed through
directly from frontmatter (eligible/ineligible/moderator) — no translation.
Also scans congress session JSONs to compute runtime stats per persona.

Usage:
    python3 /mnt/data/scripts/sync_personas_db.py
"""

import glob
import hashlib
import json
import os
import re
import sqlite3
from datetime import datetime, timezone

AGENTS_BASE   = "/home/clungus/work/bigclungus-meta/agents"
SESSIONS_DIR  = "/home/clungus/work/hello-world/sessions"
DB_PATH       = "/mnt/data/hello-world/personas.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS personas (
  name              TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  model             TEXT NOT NULL DEFAULT 'claude',
  role              TEXT,
  title             TEXT,
  sex               TEXT,
  congress          INTEGER NOT NULL DEFAULT 1,
  evolves           INTEGER NOT NULL DEFAULT 1,
  special_seat      INTEGER NOT NULL DEFAULT 0,
  stakeholder_only  INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'eligible',
  md_path           TEXT NOT NULL,
  avatar_url        TEXT,
  prompt_hash       TEXT,
  -- runtime stats
  total_congresses  INTEGER NOT NULL DEFAULT 0,
  times_evolved     INTEGER NOT NULL DEFAULT 0,
  times_fired       INTEGER NOT NULL DEFAULT 0,
  times_reinstated  INTEGER NOT NULL DEFAULT 0,
  last_verdict      TEXT,
  last_verdict_date TEXT,
  updated_at        TEXT
);
"""


def _parse_frontmatter(content: str) -> tuple[dict, str]:
    """Parse YAML-style frontmatter. Returns (meta_dict, body_str)."""
    meta: dict = {}
    body = content
    m = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)', content, re.DOTALL)
    if m:
        fm_text = m.group(1)
        body = m.group(2)
        for line in fm_text.splitlines():
            kv = re.match(r'^(\w[\w-]*):\s*(.*)$', line.strip())
            if kv:
                key = kv.group(1)
                val = kv.group(2).strip()
                list_m = re.match(r'^\[(.*)\]$', val)
                if list_m:
                    val = [v.strip() for v in list_m.group(1).split(',') if v.strip()]
                elif val.lower() == 'true':
                    val = True
                elif val.lower() == 'false':
                    val = False
                meta[key] = val
    return meta, body.strip()


def _sha256_body(body: str) -> str:
    return hashlib.sha256(body.encode('utf-8')).hexdigest()


def _bool_int(val) -> int:
    """Coerce a YAML boolean-or-string to 0/1."""
    if isinstance(val, bool):
        return 1 if val else 0
    if isinstance(val, int):
        return 1 if val else 0
    if isinstance(val, str):
        return 1 if val.lower() in ('true', '1', 'yes') else 0
    return 0


def load_personas() -> list[dict]:
    """Scan the unified agents directory, return list of persona dicts.

    Status is derived from the 'status' field in each file's YAML frontmatter.
    The DB speaks the same vocabulary as the MD files: eligible/ineligible/moderator.
    """
    personas = []
    for fpath in sorted(glob.glob(os.path.join(AGENTS_BASE, '*.md'))):
        # Skip non-persona files (e.g. README.md)
        if os.path.basename(fpath).upper() == 'README.MD':
            continue
        with open(fpath, 'r') as f:
            content = f.read()
        meta, body = _parse_frontmatter(content)

        db_status = str(meta.get('status') or 'eligible').strip()

        name = meta.get('name') or os.path.splitext(os.path.basename(fpath))[0]
        display_name = meta.get('display_name') or name
        model = str(meta.get('model') or 'claude').strip()
        role = meta.get('role') or None
        title = meta.get('title') or None
        sex = meta.get('sex') or None
        congress = _bool_int(meta.get('congress', True))
        evolves = _bool_int(meta.get('evolves', True))
        special_seat = _bool_int(meta.get('special_seat', False))
        stakeholder_only = _bool_int(meta.get('stakeholder_only', False))
        avatar_url = meta.get('avatar_url') or None
        prompt_hash = _sha256_body(body)

        # Harvest existing stats from YAML (written back by congress_evolve)
        last_verdict = meta.get('stats_last_verdict') or None
        last_verdict_date = meta.get('stats_last_verdict_date') or None

        # YAML stats_* fields are written back by congress_evolve and are
        # the authoritative cumulative counts for evolved/fired/retained.
        yaml_evolved = int(meta.get('stats_evolved') or 0)
        yaml_fired   = int(meta.get('stats_fired') or 0)

        personas.append({
            'name': name,
            'display_name': display_name,
            'model': model,
            'role': role,
            'title': title,
            'sex': sex,
            'congress': congress,
            'evolves': evolves,
            'special_seat': special_seat,
            'stakeholder_only': stakeholder_only,
            'status': db_status,
            'md_path': fpath,
            'avatar_url': avatar_url,
            'prompt_hash': prompt_hash,
            'last_verdict': last_verdict,
            'last_verdict_date': last_verdict_date,
            'yaml_evolved': yaml_evolved,
            'yaml_fired': yaml_fired,
        })
    return personas


def compute_session_stats() -> dict[str, dict]:
    """
    Scan all congress-*.json session files. Return a dict keyed by
    display_name (lowercased) mapping to:
        {total_congresses, times_evolved, times_fired, times_reinstated}
    Uses rounds to count appearances, evolution field for evolved/fired counts.
    """
    stats: dict[str, dict] = {}

    def _key(display_name: str) -> str:
        return display_name.lower()

    def _ensure(k: str):
        if k not in stats:
            stats[k] = {
                'total_congresses': 0,
                'times_evolved': 0,
                'times_fired': 0,
                'times_reinstated': 0,
            }

    for fpath in sorted(glob.glob(os.path.join(SESSIONS_DIR, 'congress-*.json'))):
        try:
            with open(fpath) as f:
                session = json.load(f)
        except Exception as e:
            print(f"  WARNING: could not parse {fpath}: {e}")
            continue

        # Count appearances in rounds (skip chairman's identity-selection round)
        debater_identities: set[str] = set()
        for round_ in session.get('rounds', []):
            identity = round_.get('identity', '')
            if identity and identity != 'chairman':
                debater_identities.add(identity)

        for identity in debater_identities:
            k = identity.lower()
            _ensure(k)
            stats[k]['total_congresses'] += 1

        # Evolution verdicts — field may be a dict or a JSON-encoded string
        evolution = session.get('evolution') or {}
        if isinstance(evolution, str):
            try:
                evolution = json.loads(evolution)
            except Exception:
                evolution = {}
        for evolved in evolution.get('evolved', []):
            dn = evolved.get('display_name', '')
            k = _key(dn)
            _ensure(k)
            stats[k]['times_evolved'] += 1

        for fired in evolution.get('fired', []):
            dn = fired.get('display_name', '')
            k = _key(dn)
            _ensure(k)
            stats[k]['times_fired'] += 1

        for created in evolution.get('created', []):
            dn = created.get('display_name', '')
            if dn:
                k = _key(dn)
                _ensure(k)

    return stats


def sync():
    """Main entry point — build/update the personas DB."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.executescript(SCHEMA)
    conn.commit()

    personas = load_personas()
    session_stats = compute_session_stats()

    now = datetime.now(timezone.utc).isoformat()

    inserted = 0
    updated = 0

    for p in personas:
        # Try to match session stats by name (identity key used in rounds)
        name_key = p['name'].lower()
        sstats = session_stats.get(name_key, {})

        # YAML stats_* fields are the authoritative cumulative counts (written by
        # congress_evolve after each session). Use them when non-zero; fall back
        # to session-scan counts only when YAML has no record yet.
        # total_congresses and times_reinstated have no YAML fields, so always computed.
        yaml_evolved = p.pop('yaml_evolved', 0)
        yaml_fired   = p.pop('yaml_fired', 0)
        times_evolved = yaml_evolved if yaml_evolved else sstats.get('times_evolved', 0)
        times_fired   = yaml_fired   if yaml_fired   else sstats.get('times_fired', 0)
        total_congresses = sstats.get('total_congresses', 0)
        times_reinstated = sstats.get('times_reinstated', 0)

        existing = cur.execute(
            'SELECT name, total_congresses, times_evolved, times_fired, times_reinstated '
            'FROM personas WHERE name = ?', (p['name'],)
        ).fetchone()

        if existing is None:
            cur.execute("""
                INSERT INTO personas (
                    name, display_name, model, role, title, sex,
                    congress, evolves, special_seat, stakeholder_only,
                    status, md_path, avatar_url, prompt_hash,
                    total_congresses, times_evolved, times_fired, times_reinstated,
                    last_verdict, last_verdict_date, updated_at
                ) VALUES (
                    :name, :display_name, :model, :role, :title, :sex,
                    :congress, :evolves, :special_seat, :stakeholder_only,
                    :status, :md_path, :avatar_url, :prompt_hash,
                    :total_congresses, :times_evolved, :times_fired, :times_reinstated,
                    :last_verdict, :last_verdict_date, :updated_at
                )
            """, {
                **p,
                'total_congresses': total_congresses,
                'times_evolved': times_evolved,
                'times_fired': times_fired,
                'times_reinstated': times_reinstated,
                'updated_at': now,
            })
            inserted += 1
        else:
            cur.execute("""
                UPDATE personas SET
                    display_name      = :display_name,
                    model             = :model,
                    role              = :role,
                    title             = :title,
                    sex               = :sex,
                    congress          = :congress,
                    evolves           = :evolves,
                    special_seat      = :special_seat,
                    stakeholder_only  = :stakeholder_only,
                    status            = :status,
                    md_path           = :md_path,
                    avatar_url        = :avatar_url,
                    prompt_hash       = :prompt_hash,
                    total_congresses  = :total_congresses,
                    times_evolved     = :times_evolved,
                    times_fired       = :times_fired,
                    times_reinstated  = :times_reinstated,
                    last_verdict      = :last_verdict,
                    last_verdict_date = :last_verdict_date,
                    updated_at        = :updated_at
                WHERE name = :name
            """, {
                **p,
                'total_congresses': total_congresses,
                'times_evolved': times_evolved,
                'times_fired': times_fired,
                'times_reinstated': times_reinstated,
                'updated_at': now,
            })
            updated += 1

    conn.commit()
    conn.close()

    print(f"Sync complete: {inserted} inserted, {updated} updated")
    print(f"Database: {DB_PATH}")
    print()
    print(f"{'NAME':<20} {'DISPLAY NAME':<25} {'MODEL':<30} {'STATUS':<8}")
    print("-" * 83)

    # Re-open for display
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    for row in conn.execute(
        "SELECT name, display_name, model, status, total_congresses, times_evolved, times_fired "
        "FROM personas ORDER BY status, name"
    ):
        print(f"{row['name']:<20} {row['display_name']:<25} {row['model']:<30} {row['status']:<8}  "
              f"congresses={row['total_congresses']} evolved={row['times_evolved']} fired={row['times_fired']}")
    conn.close()


if __name__ == '__main__':
    sync()
