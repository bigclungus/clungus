#!/usr/bin/env bun
/**
 * Hook: SubagentStart
 * Fires when a subagent is spawned.
 *
 * Responsibility: START the Temporal workflow only.
 * DB writes are owned by the workflow's create_task_record activity.
 *
 * Stdin: JSON with agent_id, agent_type, session_id, hook_event_name
 */

import { mkdirSync, readdirSync, readFileSync, unlinkSync } from "fs";

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
const model = (input.model as string | undefined) ?? "";
const provider = (input.provider as string | undefined) ?? "";

if (!agentId) process.exit(0);

// Determine provider suffix for workflow ID
const providerSuffix =
  model.startsWith("grok-") || provider === "xai" ? "xai" : "claude";

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
const workflowId = `agent-task-${agentId}-${providerSuffix}`;

// Save state for subagent-stop.ts to pick up
await Bun.write(
  `${STATE_DIR}/${agentId}.json`,
  JSON.stringify({ task_id: taskId, agent_id: agentId, session_id: sessionId, workflow_id: workflowId }),
);

// Start Temporal workflow — it owns the DB INSERT via create_task_record activity
const temporalInput = {
  task_id: taskId,
  agent_id: agentId,
  description: title,
  provider: providerSuffix,
  model: model || "",
  prompt: title,
  api_key: "",
};

try {
  const { execSync } = require("child_process");
  execSync(
    `temporal workflow start \
--namespace tasks \
--task-queue agent-tasks-queue \
--type AgentTaskWorkflow \
--workflow-id "${workflowId}" \
--input '${JSON.stringify(temporalInput).replace(/'/g, "'\\''")}' \
--address 127.0.0.1:7233`,
    { timeout: 5000, stdio: ["ignore", "ignore", "pipe"] }
  );
  process.stderr.write(`subagent-start: temporal workflow started ${workflowId} (task ${taskId})\n`);
} catch (err) {
  process.stderr.write(`subagent-start: temporal error: ${err}\n`);
}
