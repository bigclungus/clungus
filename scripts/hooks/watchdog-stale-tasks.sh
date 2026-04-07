#!/bin/bash
# Watchdog: marks in_progress tasks as stale if they've been running for >2 hours.
# Detects open tasks by: no terminal event (done/failed/cancelled/stale) in log AND
# first log entry is >2h old. Backward compat: also handles old-format tasks with
# status: "in_progress". Run on bot restart or periodically to clean up orphaned records.
#
# SQLite check: if tasks.db exists, also marks stale tasks there.

set -euo pipefail

TASKS_DIR="/home/clungus/work/bigclungus-meta/tasks"
TASKS_DB="/home/clungus/work/bigclungus-meta/tasks.db"
NOW_TS=$(date +%s)
STALE_COUNT=0
CHANGED=0

# --- SQLite stale check (runs alongside JSON check during transition) ---
if [ -f "$TASKS_DB" ]; then
  SQLITE_STALE=$(python3 - <<'PYEOF'
import sqlite3, sys, json
from datetime import datetime, timezone, timedelta

DB = "/home/clungus/work/bigclungus-meta/tasks.db"
STALE_TS = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
CUTOFF = datetime.now(timezone.utc) - timedelta(hours=2)
OPEN_STATUSES = ("in_progress", "started", "blocked", "milestone")

try:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, title, created_at, updated_at FROM tasks WHERE status NOT IN ('done','failed','cancelled','stale')"
    ).fetchall()

    stale_ids = []
    for row in rows:
        ts_str = row["updated_at"] or row["created_at"] or ""
        if not ts_str:
            continue
        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            if ts < CUTOFF:
                stale_ids.append(row["id"])
        except ValueError:
            continue

    for task_id in stale_ids:
        conn.execute(
            "UPDATE tasks SET status='stale', updated_at=? WHERE id=?",
            (STALE_TS, task_id)
        )
        conn.execute(
            "INSERT INTO task_events (task_id, event, message, ts) VALUES (?, 'stale', 'Marked stale by watchdog — session likely ended before task completed', ?)",
            (task_id, STALE_TS)
        )
        print(f"sqlite-watchdog: marked {task_id} as stale", flush=True)

    conn.commit()
    conn.close()
    sys.exit(0)
except Exception as e:
    print(f"sqlite-watchdog error: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
  )
  if [ -n "$SQLITE_STALE" ]; then
    echo "$SQLITE_STALE" >&2
  fi
fi

for task_file in "$TASKS_DIR"/*.json; do
  [ -f "$task_file" ] || continue
  [ "$(basename "$task_file")" = ".gitkeep" ] && continue

  LOG_LEN=$(jq '.log | length' "$task_file" 2>/dev/null || echo 0)
  OLD_STATUS=$(jq -r '.status // ""' "$task_file")

  IS_OPEN=0
  STARTED_AT=""

  if [ "$LOG_LEN" -gt 0 ]; then
    # New format: open if log is non-empty AND contains no terminal event
    HAS_TERMINAL=$(jq -r '[.log[].event] | map(select(. == "done" or . == "failed" or . == "cancelled" or . == "stale")) | length' "$task_file")
    if [ "$HAS_TERMINAL" -eq 0 ]; then
      IS_OPEN=1
      # Use the FIRST log entry's ts for age (when the task was actually started)
      STARTED_AT=$(jq -r '.log[0].ts' "$task_file")
    fi
  elif [ "$LOG_LEN" -eq 0 ] && [ "$OLD_STATUS" = "in_progress" ]; then
    # Backward compat: old format with no log array
    IS_OPEN=1
    STARTED_AT=$(jq -r '.started_at // ""' "$task_file")
  fi

  [ "$IS_OPEN" -eq 1 ] || continue
  [ -n "$STARTED_AT" ] || continue

  # Convert ISO8601 to epoch
  STARTED_TS=$(date -d "$STARTED_AT" +%s 2>/dev/null) || continue
  AGE_SECONDS=$(( NOW_TS - STARTED_TS ))

  # 2 hours = 7200 seconds
  if [ "$AGE_SECONDS" -ge 7200 ]; then
    STALE_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    TASK_ID=$(jq -r '.id // "(unknown)"' "$task_file")

    if [ "$LOG_LEN" -gt 0 ]; then
      # New format: append stale log entry
      UPDATED=$(jq \
        --arg ts "$STALE_TS" \
        '.log += [{ts: $ts, event: "stale", context: "Marked stale by watchdog — session likely ended before task completed"}]' \
        "$task_file")
    else
      # Old format backward compat: update status fields
      UPDATED=$(jq \
        --arg status "stale" \
        --arg finished_at "$STALE_TS" \
        --arg summary "Marked stale by watchdog — session likely ended before task completed" \
        '.status = $status | .finished_at = $finished_at | .summary = $summary' \
        "$task_file")
    fi

    echo "$UPDATED" > "$task_file"
    STALE_COUNT=$(( STALE_COUNT + 1 ))
    CHANGED=1
    echo "watchdog: marked $TASK_ID as stale (age: ${AGE_SECONDS}s)" >&2
  fi
done

if [ "$CHANGED" -eq 1 ]; then
  (cd /home/clungus/work/bigclungus-meta && git add tasks/ && git commit -m "task: watchdog marked $STALE_COUNT stale" && git push)
fi

echo "watchdog: $STALE_COUNT task(s) marked stale"

# Heartbeat liveness check: alert if no heartbeat in >20 minutes
HEARTBEAT_FILE="/tmp/last-heartbeat.txt"
HEARTBEAT_MAX_AGE=1200  # 20 minutes
if [ -f "$HEARTBEAT_FILE" ]; then
    LAST_HB=$(cat "$HEARTBEAT_FILE" 2>/dev/null || echo "0")
    HB_AGE=$(python3 -c "import time; print(int(time.time() - $LAST_HB))" 2>/dev/null || echo "9999")
    HB_MIN=$(python3 -c "print(round($HB_AGE / 60, 1))" 2>/dev/null || echo "?")
    if [ "$HB_AGE" -gt "$HEARTBEAT_MAX_AGE" ]; then
        echo "watchdog: ALERT — no heartbeat in ${HB_MIN} minutes (last: ${HB_AGE}s ago)" >&2
        curl -s -X POST http://127.0.0.1:8085/webhooks/bigclungus-main \
          -H "Content-Type: application/json" \
          -d "{\"content\": \"⚠️ heartbeat watchdog: no [heartbeat] inject in ${HB_MIN}min. omni-gateway or heartbeat workflow may be down.\", \"user\": \"watchdog\"}" \
          > /dev/null || true
    else
        echo "watchdog: heartbeat OK (last ${HB_MIN}min ago)"
    fi
else
    echo "watchdog: no heartbeat timestamp file found (first boot or inject_act never ran)" >&2
fi

# Check for stalled congress sessions (running > 2 hours) and terminate them
# Wrapped in timeout to prevent watchdog hangs (GH#150)
timeout 15 python3 - <<'PYEOF'
import json, sys, datetime, subprocess, os

try:
    result = subprocess.run(
        ['temporal', 'workflow', 'list',
         '--query', 'WorkflowType="CongressWorkflow" AND ExecutionStatus="Running"',
         '--address', 'localhost:7233',
         '--output', 'json'],
        capture_output=True, text=True, timeout=10
    )
    if result.returncode != 0:
        sys.exit(0)

    workflows = json.loads(result.stdout) if result.stdout.strip() else []
    now = datetime.datetime.now(datetime.timezone.utc)
    for wf in workflows:
        wf_id = wf.get('workflowId', '')
        start_str = wf.get('startTime', '')
        if not start_str:
            continue
        start = datetime.datetime.fromisoformat(start_str.replace('Z', '+00:00'))
        age_hours = (now - start).total_seconds() / 3600
        if age_hours > 2:
            print(f'Terminating stalled congress {wf_id} (running {age_hours:.1f}h)', flush=True)
            subprocess.run([
                'temporal', 'workflow', 'terminate',
                '--workflow-id', wf_id,
                '--address', 'localhost:7233',
                '--reason', f'Stalled: running {age_hours:.1f}h, terminated by watchdog'
            ], capture_output=True)
except Exception as e:
    print(f'Congress stall check error: {e}', file=sys.stderr)
PYEOF

# Also mark session JSONs for terminated congresses
python3 - <<'PYEOF'
import json, os, glob, datetime

sessions_dir = '/home/clungus/work/hello-world/sessions'
now = datetime.datetime.now(datetime.timezone.utc)

for path in glob.glob(f'{sessions_dir}/congress-*.json'):
    try:
        d = json.load(open(path))
        if d.get('status') != 'deliberating':
            continue
        started = d.get('started_at', '')
        if not started:
            continue
        start = datetime.datetime.fromisoformat(started.replace('Z', '+00:00'))
        age_hours = (now - start).total_seconds() / 3600
        if age_hours > 2:
            d['status'] = 'failed'
            d['failure_reason'] = f'Terminated by watchdog: stalled for {age_hours:.1f}h'
            json.dump(d, open(path, 'w'), indent=2)
            print(f'Marked stale: {os.path.basename(path)}')
    except Exception as e:
        print(f'Warning: could not process {os.path.basename(path)}: {e}', file=sys.stderr)
PYEOF

# Clean up deliberating sessions whose Temporal workflow is no longer running.
# Workflows don't always update session JSON on failure/completion, so sessions
# can get stuck in "deliberating" indefinitely.
python3 - <<'PYEOF'
import asyncio, json, os, glob, datetime, subprocess, sys

async def main():
    sessions_dir = '/home/clungus/work/hello-world/sessions'
    now = datetime.datetime.now(datetime.timezone.utc)

    # Find all sessions currently stuck in "deliberating"
    deliberating = []
    for path in glob.glob(f'{sessions_dir}/congress-*.json'):
        try:
            d = json.load(open(path))
            if d.get('status') == 'deliberating':
                deliberating.append((path, d))
        except Exception as e:
            print(f'Warning: could not read {path}: {e}', file=sys.stderr)

    if not deliberating:
        print('congress orphan check: no deliberating sessions found')
        return

    # Query Temporal for currently RUNNING CongressWorkflows (with 10s timeout)
    try:
        from temporalio.client import Client
        client = await asyncio.wait_for(
            Client.connect('localhost:7233'),
            timeout=10
        )
        running_workflows = []
        async for wf in client.list_workflows(
            query='WorkflowType="CongressWorkflow" AND ExecutionStatus="Running"'
        ):
            running_workflows.append(wf)
    except Exception as e:
        print(f'congress orphan check: could not query Temporal: {e}', file=sys.stderr)
        return

    cleaned = 0
    for path, d in deliberating:
        started = d.get('started_at', '')
        if not started:
            age_minutes = 9999
        else:
            try:
                start = datetime.datetime.fromisoformat(started.replace('Z', '+00:00'))
                age_minutes = (now - start).total_seconds() / 60
            except Exception:
                age_minutes = 9999

        if len(running_workflows) == 0:
            # No running congresses at all — safe to mark all deliberating sessions failed
            d['status'] = 'failed'
            d['failure_reason'] = 'Session marked failed by watchdog: no active workflow found'
            json.dump(d, open(path, 'w'), indent=2)
            cleaned += 1
            print(f'congress orphan check: marked {os.path.basename(path)} failed (no running workflows)')
        elif age_minutes > 10:
            # There are running congresses but this session is >10 min old.
            # The active congress would have updated its session within 10 min,
            # so if this one hasn't it's almost certainly orphaned.
            d['status'] = 'failed'
            d['failure_reason'] = 'Session marked failed by watchdog: no active workflow found'
            json.dump(d, open(path, 'w'), indent=2)
            cleaned += 1
            print(f'congress orphan check: marked {os.path.basename(path)} failed (age {age_minutes:.0f}min, {len(running_workflows)} other workflow(s) running)')
        else:
            print(f'congress orphan check: skipping {os.path.basename(path)} (age {age_minutes:.0f}min, {len(running_workflows)} workflow(s) running — may be active)')

    print(f'congress orphan check: {cleaned} orphaned session(s) cleaned up')

try:
    asyncio.run(asyncio.wait_for(main(), timeout=15))
except asyncio.TimeoutError:
    print('congress orphan check: timed out (15s), skipping', file=sys.stderr)
except Exception as e:
    print(f'congress orphan check: error: {e}', file=sys.stderr)
PYEOF
