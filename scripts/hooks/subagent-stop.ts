#!/usr/bin/env bun
/**
 * Hook: SubagentStop
 * Fires when a subagent finishes.
 *
 * Responsibility: SIGNAL the Temporal workflow mark_complete only.
 * DB writes are owned by the workflow's finalize_task activity.
 *
 * Stdin: JSON with agent_id, agent_type, last_assistant_message, hook_event_name
 */

import { existsSync, readFileSync, unlinkSync } from "fs";

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

const finishedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const agentStateFile = `${STATE_DIR}/${agentId}.json`;

if (!existsSync(agentStateFile)) {
  process.stderr.write(`subagent-stop: no state file found for agent ${agentId}, skipping\n`);
  process.exit(0);
}

let taskId: string;
let workflowId: string;
try {
  const state = JSON.parse(readFileSync(agentStateFile, "utf8"));
  taskId = (state.task_id as string) ?? "";
  workflowId = (state.workflow_id as string) ?? "";
} catch {
  process.stderr.write(`subagent-stop: failed to read state file for agent ${agentId}\n`);
  process.exit(0);
}

if (!taskId) {
  process.stderr.write(`subagent-stop: no task_id in state file for agent ${agentId}, skipping\n`);
  process.exit(0);
}

if (!workflowId) {
  process.stderr.write(`subagent-stop: no workflow_id in state file for agent ${agentId}, falling back\n`);
  workflowId = `agent-task-${agentId}`;
}

// Clean up agent state file
try { unlinkSync(agentStateFile); } catch { /* non-fatal */ }

// Signal Temporal workflow — it owns the DB UPDATE via finalize_task activity
// Token parsing is done by finalize_task activity (reads JSONL directly)
const preview = lastMsg.length > 200 ? lastMsg.slice(0, 200) + "...(truncated)" : lastMsg;
const signalPayload: Record<string, unknown> = {
  finished_at: finishedAt,
  exit_code: 0,
  status: "completed",
  last_message_preview: preview,
  exit_reason: "completed",
  finished: true,
};

try {
  const { execSync } = require("child_process");
  execSync(
    `/home/clungus/.local/bin/temporal workflow signal \
--namespace tasks \
--workflow-id "${workflowId}" \
--name mark_complete \
--input '${JSON.stringify(signalPayload).replace(/'/g, "'\\''")}' \
--address 127.0.0.1:7233`,
    { timeout: 5000, stdio: ["ignore", "ignore", "pipe"] }
  );
  process.stderr.write(`subagent-stop: mark_complete signal sent to ${workflowId} (task ${taskId})\n`);
} catch (err) {
  process.stderr.write(`subagent-stop: temporal error: ${err}\n`);
}
