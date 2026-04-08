#!/usr/bin/env bun
/**
 * Hook: SubagentStart
 * Fires when a subagent is spawned.
 * INSERTs into tasks.db + POSTs to clunger /api/agents/spawn
 *
 * Input JSON (stdin) fields:
 *   agent_id        — unique ID for this subagent
 *   agent_type      — agent type name (e.g. "Explore")
 *   session_id      — parent session ID
 *   hook_event_name — "SubagentStart"
 */

import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, readFileSync, unlinkSync } from "fs";

const DEFAULT_DB = "/home/clungus/work/bigclungus-meta/tasks.db";
const STATE_DIR = "/tmp/bc-agents";

function initDb(db: Database): void {
  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA foreign_keys=ON");
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         TEXT PRIMARY KEY,
      title      TEXT,
      status     TEXT,
      created_at TEXT,
      updated_at TEXT,
      data       TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS task_events (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      event   TEXT NOT NULL,
      message TEXT,
      ts      TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_tasks_created  ON tasks(created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_events_task_id ON task_events(task_id)");
}

const raw = await Bun.stdin.text();
let input: Record<string, unknown>;
try {
  input = JSON.parse(raw);
} catch {
  process.stderr.write("subagent-start: failed to parse stdin JSON\n");
  process.exit(0);
}

const agentId = (input.agent_id as string | undefined) ?? "";
const agentType = (input.agent_type as string | undefined) ?? "unknown";
const sessionId = (input.session_id as string | undefined) ?? "unknown";

if (!agentId) process.exit(0);

const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const nowTs = Math.floor(Date.now() / 1000);

mkdirSync(STATE_DIR, { recursive: true });

// Look for a pending prompt context written by pre-agent-spawn.sh
let title = "";
let subagentType = "general-purpose";
let discordMessageId: string | null = null;
let discordUser: string | null = null;
let runInBackground = false;
let isolation: string | null = null;
let model: string | null = null;
let bestPendingFile: string | null = null;

try {
  const files = readdirSync(STATE_DIR);
  for (const fname of files) {
    if (!fname.startsWith(`pending-${sessionId}-`)) continue;
    const fpath = `${STATE_DIR}/${fname}`;
    try {
      const data = JSON.parse(readFileSync(fpath, "utf8"));
      const age = nowTs - (Number(data.ts) || 0);
      if (age <= 30) {
        title = (data.title as string) ?? "";
        subagentType = (data.subagent_type as string) ?? "general-purpose";
        discordMessageId = (data.discord_message_id as string | null) ?? null;
        discordUser = (data.discord_user as string | null) ?? null;
        runInBackground = Boolean(data.run_in_background);
        isolation = (data.isolation as string | null) ?? null;
        model = (data.model as string | null) ?? null;
        bestPendingFile = fpath;
      }
    } catch {
      // malformed pending file — skip
    }
  }
} catch {
  // STATE_DIR might be empty — fine
}

if (bestPendingFile) {
  try { unlinkSync(bestPendingFile); } catch { /* non-fatal */ }
}

if (!title) {
  title = `${agentType} — ${agentId.slice(0, 12)}`;
}

// Generate task ID
const datePart = new Date().toISOString().slice(0, 19).replace(/[-T:]/g, "").replace(/(\d{8})(\d{6})/, "$1-$2");
const taskId = `task-${datePart}-${agentId.slice(0, 8)}`;

// INSERT into tasks.db
try {
  const db = new Database(DEFAULT_DB);
  initDb(db);

  const taskData = JSON.stringify({
    id: taskId,
    title,
    status: "open",
    source: "discord",
    log: [{ ts: timestamp, event: "started", context: title }],
  });

  db.run(
    "INSERT OR IGNORE INTO tasks (id, title, status, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)",
    [taskId, title, "open", timestamp, timestamp, taskData],
  );
  db.run(
    "INSERT INTO task_events (task_id, event, message, ts) VALUES (?, ?, ?, ?)",
    [taskId, "started", title, timestamp],
  );
  db.close();
} catch (err) {
  process.stderr.write(`subagent-start: db error: ${err}\n`);
}

// Store task ID in agent state file for subagent-stop.ts
const statePayload = JSON.stringify({ task_id: taskId, agent_id: agentId, session_id: sessionId });
await Bun.write(`${STATE_DIR}/${agentId}.json`, statePayload);

// POST spawn record to clunger
const outputFile = `/tmp/claude-1001/-mnt-data/${sessionId}/tasks/${agentId}.output`;
const spawnPayload = JSON.stringify({
  id: agentId,
  description: title,
  output_file: outputFile,
  task_id: taskId,
});

try {
  const res = await fetch("http://localhost:8081/api/agents/spawn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: spawnPayload,
  });
  if (!res.ok) {
    process.stderr.write(`subagent-start: clunger spawn returned ${res.status}\n`);
  }
} catch (err) {
  process.stderr.write(`subagent-start: clunger POST failed: ${err}\n`);
}

process.stderr.write(`subagent-start: created task ${taskId} for agent ${agentId} (${agentType})\n`);
