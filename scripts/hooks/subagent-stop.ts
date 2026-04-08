#!/usr/bin/env bun
/**
 * Hook: SubagentStop
 * Fires when a subagent finishes.
 * UPDATEs tasks.db status to done + POSTs to clunger /api/agents/:id/complete
 *
 * Stdin: JSON with agent_id, agent_type, last_assistant_message, hook_event_name
 */

import { Database } from "bun:sqlite";
import { existsSync, readFileSync, unlinkSync } from "fs";

const DEFAULT_DB = "/home/clungus/work/bigclungus-meta/tasks.db";
const STATE_DIR = "/tmp/bc-agents";

const raw = await Bun.stdin.text();
let input: Record<string, unknown>;
try {
  input = JSON.parse(raw);
} catch {
  process.stderr.write("subagent-stop: failed to parse stdin JSON\n");
  process.exit(0);
}

const agentId = (input.agent_id as string | undefined) ?? "";
const lastMsg = (input.last_assistant_message as string | undefined) ?? "";

if (!agentId) process.exit(0);

const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const agentStateFile = `${STATE_DIR}/${agentId}.json`;

if (!existsSync(agentStateFile)) {
  process.stderr.write(`subagent-stop: no state file found for agent ${agentId}, skipping\n`);
  process.exit(0);
}

let taskId: string;
try {
  const state = JSON.parse(readFileSync(agentStateFile, "utf8"));
  taskId = (state.task_id as string) ?? "";
} catch {
  process.stderr.write(`subagent-stop: failed to read state file for agent ${agentId}\n`);
  process.exit(0);
}

if (!taskId) {
  process.stderr.write(`subagent-stop: no task_id in state file for agent ${agentId}, skipping\n`);
  process.exit(0);
}

const context = lastMsg.length > 500 ? lastMsg.slice(0, 500) + "...(truncated)" : lastMsg;

// UPDATE tasks.db — update both status column and data blob
// (clunger reads task status from the blob, not the column)
try {
  const db = new Database(DEFAULT_DB);
  db.run("PRAGMA journal_mode=WAL");

  const row = db.query<{ data: string }, [string]>(
    "SELECT data FROM tasks WHERE id = ?"
  ).get(taskId);

  let updatedData: string | null = null;
  if (row?.data) {
    try {
      const blob = JSON.parse(row.data) as Record<string, unknown>;
      blob.status = "done";
      blob.finished_at = timestamp;
      if (Array.isArray(blob.log)) {
        (blob.log as Array<Record<string, unknown>>).push({ ts: timestamp, event: "done", context: context || "subagent finished" });
      }
      updatedData = JSON.stringify(blob);
    } catch {
      // malformed blob — leave it, still update column
    }
  }

  if (updatedData !== null) {
    db.run(
      "UPDATE tasks SET status = ?, updated_at = ?, data = ? WHERE id = ?",
      ["done", timestamp, updatedData, taskId],
    );
  } else {
    db.run(
      "UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?",
      ["done", timestamp, taskId],
    );
  }

  db.run(
    "INSERT INTO task_events (task_id, event, message, ts) VALUES (?, ?, ?, ?)",
    [taskId, "done", context.slice(0, 500), timestamp],
  );
  db.close();
} catch (err) {
  process.stderr.write(`subagent-stop: db error: ${err}\n`);
}

// Clean up agent state file
try { unlinkSync(agentStateFile); } catch { /* non-fatal */ }

// POST complete to clunger
try {
  const res = await fetch(`http://localhost:8081/api/agents/${agentId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "completed", exit_reason: "completed" }),
  });
  if (!res.ok) {
    process.stderr.write(`subagent-stop: clunger complete returned ${res.status}\n`);
  }
} catch (err) {
  process.stderr.write(`subagent-stop: clunger POST failed: ${err}\n`);
}

process.stderr.write(`subagent-stop: marked task ${taskId} done for agent ${agentId}\n`);

// ── Shadow mode: signal Temporal workflow with final metadata ─────────────
// Enabled only when TEMPORAL_SHADOW=true. Non-blocking, never affects exit code.
if (process.env.TEMPORAL_SHADOW === "true") {
  // Workflow ID was stored alongside task_id in the state file (before it was deleted above)
  // Re-derive it from taskId since state file is already cleaned up
  const workflowId = `agent-task-${taskId}`;
  const metadataPayload = {
    completed_at: timestamp,
    last_message_preview: context.slice(0, 200),
    exit_reason: "completed",
    finished: true,
  };
  try {
    const { execSync } = require("child_process");
    execSync(
      `temporal workflow signal \
--namespace tasks \
--workflow-id "${workflowId}" \
--name mark_complete \
--input '${JSON.stringify(metadataPayload).replace(/'/g, "'\\''")}' \
--address 127.0.0.1:7233`,
      { timeout: 5000, stdio: ["ignore", "ignore", "pipe"] }
    );
    process.stderr.write(`subagent-stop: temporal mark_complete signal sent to ${workflowId}\n`);
  } catch (err) {
    process.stderr.write(`subagent-stop: temporal shadow error (non-fatal): ${err}\n`);
  }
}
