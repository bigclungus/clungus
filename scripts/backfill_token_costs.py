#!/usr/bin/env python3
"""
Backfill token counts and costs into agents.db for historical agent sessions.

Source: hex-ID agents with output_file pointing to a JSONL task output file.
Parse usage from assistant message entries, dedup by message_id (take last = streaming final).

Session-JSONL strategy (usage-N agents) is intentionally skipped — those sessions contain
multiple overlapping agents so summing produces inflated per-agent counts with no
accurate attribution boundary.

Cost calculation uses official claude-sonnet-4-6 pricing:
  input:       $3.00 / 1M tokens
  output:     $15.00 / 1M tokens
  cache_read:  $0.30 / 1M tokens
  cache_write: $3.75 / 1M tokens (not stored, but used for cost calc)
"""

import json
import sqlite3
import os
import sys

DB_PATH = "/mnt/data/data/agents.db"

PRICING = {
    "input":       3.00 / 1_000_000,
    "output":     15.00 / 1_000_000,
    "cache_read":  0.30 / 1_000_000,
    "cache_write": 3.75 / 1_000_000,
}


def parse_output_file(path: str) -> dict:
    """
    Parse token usage from a .output JSONL file (hex-ID agent format).

    Each assistant entry has message.usage. The same message_id may appear
    multiple times due to streaming — take the last occurrence, which has
    the final output_tokens count.

    Returns dict with input_tokens, output_tokens, cache_read_tokens,
    cache_write_tokens, model.
    """
    by_msg_id: dict[str, dict] = {}
    model: str | None = None

    try:
        with open(path, "r", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if entry.get("type") != "assistant":
                    continue
                msg = entry.get("message", {})
                if not isinstance(msg, dict):
                    continue

                usage = msg.get("usage")
                if not usage or not isinstance(usage, dict):
                    continue

                mid = msg.get("id", "")
                if not model and msg.get("model"):
                    model = msg["model"]

                # Overwrite each time so we keep the last (final streaming) entry
                by_msg_id[mid] = {
                    "input_tokens":       usage.get("input_tokens", 0) or 0,
                    "output_tokens":      usage.get("output_tokens", 0) or 0,
                    "cache_read_tokens":  usage.get("cache_read_input_tokens", 0) or 0,
                    "cache_write_tokens": usage.get("cache_creation_input_tokens", 0) or 0,
                }
    except OSError as e:
        print(f"  WARN: cannot read {path}: {e}", file=sys.stderr)
        return {}

    if not by_msg_id:
        return {}

    total = {
        "input_tokens":       sum(u["input_tokens"] for u in by_msg_id.values()),
        "output_tokens":      sum(u["output_tokens"] for u in by_msg_id.values()),
        "cache_read_tokens":  sum(u["cache_read_tokens"] for u in by_msg_id.values()),
        "cache_write_tokens": sum(u["cache_write_tokens"] for u in by_msg_id.values()),
        "model":              model,
    }
    return total



def compute_cost(usage: dict) -> float:
    return (
        usage.get("input_tokens", 0)       * PRICING["input"] +
        usage.get("output_tokens", 0)      * PRICING["output"] +
        usage.get("cache_read_tokens", 0)  * PRICING["cache_read"] +
        usage.get("cache_write_tokens", 0) * PRICING["cache_write"]
    )


def main():
    db = sqlite3.connect(DB_PATH)

    # Fetch all agents with zero tokens
    agents = db.execute("""
        SELECT id, session_id, output_file, input_tokens, output_tokens
        FROM agents
        WHERE input_tokens = 0 AND output_tokens = 0
        ORDER BY id
    """).fetchall()

    print(f"Agents with zero tokens: {len(agents)}")

    updated = 0
    skipped_no_source = 0
    skipped_zero_parse = 0

    for agent_id, session_id, output_file, _, _ in agents:
        usage = {}

        # Strategy 1: use output_file if present and exists
        if output_file and output_file != "/tmp/test.out" and os.path.exists(output_file):
            usage = parse_output_file(output_file)
            source = "output_file"
        # Strategy 2: session-JSONL approach is intentionally disabled.
        # Session JSONLs contain all agents sharing a session; summing them
        # produces inflated per-agent counts. Skip these agents — they cannot
        # be accurately attributed without per-agent boundaries in the JSONL.
        else:
            skipped_no_source += 1
            continue

        in_tok  = usage.get("input_tokens", 0)
        out_tok = usage.get("output_tokens", 0)
        cr_tok  = usage.get("cache_read_tokens", 0)
        cw_tok  = usage.get("cache_write_tokens", 0)
        model   = usage.get("model")

        if in_tok == 0 and out_tok == 0:
            skipped_zero_parse += 1
            continue

        cost = compute_cost(usage)

        update_fields = {
            "input_tokens":       in_tok,
            "output_tokens":      out_tok,
            "cache_read_tokens":  cr_tok,
            "cost_usd":           round(cost, 6),
        }
        if model:
            update_fields["model"] = model

        set_clause = ", ".join(f"{k} = ?" for k in update_fields)
        values = list(update_fields.values()) + [agent_id]

        db.execute(f"UPDATE agents SET {set_clause} WHERE id = ?", values)
        updated += 1

        print(
            f"  [{source[:6]}] {agent_id[:20]:20s}  "
            f"in={in_tok:7d}  out={out_tok:6d}  "
            f"cr={cr_tok:7d}  cw={cw_tok:7d}  "
            f"cost=${cost:.4f}"
        )

    db.commit()
    db.close()

    print()
    print("Done.")
    print(f"  Updated:             {updated}")
    print(f"  Skipped (no source): {skipped_no_source}")
    print(f"  Skipped (zero data): {skipped_zero_parse}")


if __name__ == "__main__":
    main()
