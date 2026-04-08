#!/usr/bin/env bun
/**
 * Hook: SubagentStart
 * Fires when a subagent is spawned.
 * INSERTs into tasks.db + POSTs to clunger /api/agents/spawn
 *
 * Stdin: JSON with agent_id, agent_type, session_id, hook_event_name
 */

import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, readFileSync, unlinkSync } from "fs";

const DEFAULT_DB = "/home/clungus/work/bigclungus-meta/tasks.db";
const STATE_DIR = "/tmp/bc-agents";

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
        bestPendingFile = fpath;
      }
    } catch {
      // malformed pending file — skip
    }
  }
} catch {
  // STATE_DIR empty or unreadable — fine
}

if (bestPendingFile) {
  try { unlinkSync(bestPendingFile); } catch { /* non-fatal */ }
}

if (!title) {
  title = `${agentType} — ${agentId.slice(0, 12)}`;
}

const datePart = new Date().toISOString().slice(0, 19).replace(/[-T:]/g, "").replace(/(\d{8})(\d{6})/, "$1-$2");
const taskId = `task-${datePart}-${agentId.slice(0, 8)}`;

// INSERT into tasks.db
try {
  const db = new Database(DEFAULT_DB);
  db.run("PRAGMA journal_mode=WAL");

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
await Bun.write(`${STATE_DIR}/${agentId}.json`, JSON.stringify({ task_id: taskId, agent_id: agentId, session_id: sessionId }));

// POST spawn record to clunger
const outputFile = `/tmp/claude-1001/-mnt-data/${sessionId}/tasks/${agentId}.output`;
try {
  const res = await fetch("http://localhost:8081/api/agents/spawn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: agentId, description: title, output_file: outputFile, task_id: taskId }),
  });
  if (!res.ok) {
    process.stderr.write(`subagent-start: clunger spawn returned ${res.status}\n`);
  }
} catch (err) {
  process.stderr.write(`subagent-start: clunger POST failed: ${err}\n`);
}

process.stderr.write(`subagent-start: created task ${taskId} for agent ${agentId} (${agentType})\n`);

// ── Shadow mode: fire Temporal AgentTaskWorkflow ──────────────────────────
// Enabled only when TEMPORAL_SHADOW=true. All Temporal calls are non-blocking
// and wrapped in try/catch — they MUST NOT affect hook exit code.
if (process.env.TEMPORAL_SHADOW === "true") {
  const workflowId = `agent-task-${taskId}`;
  const temporalInput = {
    task_id: taskId,
    prompt: title,
    agent_type: "claude",
    model: "claude-sonnet-4-6",
    is_foreground: true,
    metadata: {
      agent_id: agentId,
      session_id: sessionId,
      description: title,
    },
  };
  try {
    const temporalRes = await fetch(
      "http://127.0.0.1:8233/api/v1/namespaces/tasks/workflows",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow_id: workflowId,
          workflow_type: { name: "AgentTaskWorkflow" },
          task_queue: { name: "agent-tasks-queue" },
          input: { payloads: [{ metadata: { encoding: Buffer.from("json/plain").toString("base64") }, data: Buffer.from(JSON.stringify(temporalInput)).toString("base64") }] },
        }),
      }
    );
    if (!temporalRes.ok) {
      const body = await temporalRes.text().catch(() => "");
      process.stderr.write(`subagent-start: temporal start returned ${temporalRes.status}: ${body.slice(0, 200)}\n`);
    } else {
      // Save workflow reference alongside existing state
      const stateFile = `${STATE_DIR}/${agentId}.json`;
      try {
        const existing = JSON.parse(await Bun.file(stateFile).text());
        existing.workflow_id = workflowId;
        await Bun.write(stateFile, JSON.stringify(existing));
      } catch {
        // state file write race — non-fatal
      }
      process.stderr.write(`subagent-start: temporal workflow started ${workflowId}\n`);
    }
  } catch (err) {
    process.stderr.write(`subagent-start: temporal shadow error (non-fatal): ${err}\n`);
  }
}
