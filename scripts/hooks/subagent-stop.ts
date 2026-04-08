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

import { existsSync, readFileSync, readdirSync, unlinkSync } from "fs";

const STATE_DIR = "/tmp/bc-agents";
const OUTPUT_BASE = "/tmp/claude-1001";

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
let sessionId: string;
try {
  const state = JSON.parse(readFileSync(agentStateFile, "utf8"));
  taskId = (state.task_id as string) ?? "";
  workflowId = (state.workflow_id as string) ?? "";
  sessionId = (state.session_id as string) ?? "";
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
  workflowId = `agent-task-${agentId}-claude`;
}

// Clean up agent state file
try { unlinkSync(agentStateFile); } catch { /* non-fatal */ }

// --- Parse token usage from output JSONL ---
interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
}

function parseTokenUsage(sessionId: string, agentId: string): UsageTotals | null {
  // Locate output file: /tmp/claude-1001/-mnt-data/<sessionId>/tasks/<agentId>.output
  const projectDirs = existsSync(OUTPUT_BASE)
    ? readdirSync(OUTPUT_BASE).map((d) => `${OUTPUT_BASE}/${d}`)
    : [];

  let outputPath: string | null = null;
  for (const projDir of projectDirs) {
    const candidate = `${projDir}/${sessionId}/tasks/${agentId}.output`;
    if (existsSync(candidate)) {
      outputPath = candidate;
      break;
    }
  }

  if (!outputPath) {
    process.stderr.write(`subagent-stop: no output file found for agent ${agentId} session ${sessionId}\n`);
    return null;
  }

  let raw: string;
  try {
    raw = readFileSync(outputPath, "utf8");
  } catch {
    process.stderr.write(`subagent-stop: failed to read output file ${outputPath}\n`);
    return null;
  }

  // Deduplicate by message.id — take last occurrence per message_id
  const usageByMsgId = new Map<string, { input: number; output: number; cache_read: number }>();

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const msg = entry.message as Record<string, unknown> | undefined;
    if (!msg) continue;
    if (msg.role !== "assistant") continue;

    const usage = msg.usage as Record<string, unknown> | undefined;
    if (!usage) continue;

    const msgId = (msg.id as string | undefined) ?? "";
    if (!msgId) continue;

    usageByMsgId.set(msgId, {
      input: Number(usage.input_tokens ?? 0),
      output: Number(usage.output_tokens ?? 0),
      cache_read: Number(usage.cache_read_input_tokens ?? 0),
    });
  }

  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;

  for (const u of usageByMsgId.values()) {
    totalInput += u.input;
    totalOutput += u.output;
    totalCacheRead += u.cache_read;
  }

  // Pricing: $3/1M input, $15/1M output, $0.30/1M cache_read
  const cost =
    (totalInput * 3) / 1_000_000 +
    (totalOutput * 15) / 1_000_000 +
    (totalCacheRead * 0.30) / 1_000_000;

  return {
    input_tokens: totalInput,
    output_tokens: totalOutput,
    cache_read_tokens: totalCacheRead,
    cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
  };
}

const tokenUsage = parseTokenUsage(sessionId, agentId);
if (tokenUsage) {
  process.stderr.write(
    `subagent-stop: tokens: in=${tokenUsage.input_tokens} out=${tokenUsage.output_tokens} cache_read=${tokenUsage.cache_read_tokens} cost=$${tokenUsage.cost_usd}\n`
  );
}

// Signal Temporal workflow — it owns the DB UPDATE via finalize_task activity
const preview = lastMsg.length > 200 ? lastMsg.slice(0, 200) + "...(truncated)" : lastMsg;
const signalPayload: Record<string, unknown> = {
  finished_at: finishedAt,
  exit_code: 0,
  status: "completed",
  last_message_preview: preview,
  exit_reason: "completed",
  finished: true,
  ...(tokenUsage ?? {}),
};

try {
  const { execSync } = require("child_process");
  execSync(
    `temporal workflow signal \
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
