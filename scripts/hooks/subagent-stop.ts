#!/usr/bin/env bun
/**
 * Hook: SubagentStop
 * Fires when a subagent finishes.
 * UPDATEs tasks.db status to done + POSTs to clunger /api/agents/:id/complete
 *
 * Input JSON (stdin) fields:
 *   agent_id               — same ID as SubagentStart
 *   agent_type             — agent type
 *   last_assistant_message — final text output of the subagent
 *   hook_event_name        — "SubagentStop"
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
const agentType = (input.agent_type as string | undefined) ?? "unknown";
const lastMsg = (input.last_assistant_message as string | undefined) ?? "";

if (!agentId) process.exit(0);

const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const agentStateFile = `${STATE_DIR}/${agentId}.json`;

if (!existsSync(agentStateFile)) {
  process.stderr.write(`subagent-stop: no state file found for agent ${agentId}, skipping task update\n`);
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

// Truncate context to 500 chars
const context = lastMsg.length > 500 ? lastMsg.slice(0, 500) + "...(truncated)" : lastMsg;

// UPDATE tasks.db — update both the status column AND the data JSON blob
// (clunger reads task status from the data blob, not the column)
try {
  const db = new Database(DEFAULT_DB);
  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA foreign_keys=ON");

  // Read current data blob so we can update its status field
  const row = db.query<{ data: string }, [string]>(
    "SELECT data FROM tasks WHERE id = ?"
  ).get(taskId);
  let updatedData: string | null = null;
  if (row?.data) {
    try {
      const blob = JSON.parse(row.data) as Record<string, unknown>;
      blob.status = "done";
      blob.finished_at = timestamp;
      // Append a done event to the log array if present
      if (Array.isArray(blob.log)) {
        (blob.log as Array<Record<string, unknown>>).push({
          ts: timestamp,
          event: "done",
          context: context || "subagent finished",
        });
      }
      updatedData = JSON.stringify(blob);
    } catch {
      // malformed blob — leave it alone, still update column
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
