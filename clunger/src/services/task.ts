import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ConnectError, Code } from "@connectrpc/connect";
import type { HandlerContext, ServiceImpl } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { TaskService } from "../../gen/task/v1/task_pb.js";
import {
  TaskSchema,
  ListTasksResponseSchema,
} from "../../gen/task/v1/task_pb.js";
import type {
  Task,
  ListTasksRequest,
  ListTasksResponse,
} from "../../gen/task/v1/task_pb.js";
import { requireAuth } from "./service-auth.js";
import Database from "bun:sqlite";

const TASKS_DIR = "/mnt/data/bigclungus-meta/tasks";
const TASKS_DB = "/home/clungus/work/bigclungus-meta/tasks.db";

interface LogEntry {
  event?: string;
  event_type?: string;
  message?: string;
  context?: string;
  timestamp?: string;
  ts?: string;
}

function deriveStatus(data: Record<string, unknown>): string {
  if (data.status && typeof data.status === "string" && data.status.length > 0) {
    return data.status;
  }
  const log = Array.isArray(data.log) ? (data.log as LogEntry[]) : [];
  if (log.length === 0) return "in_progress";
  const last = log[log.length - 1];
  const et = last.event ?? last.event_type ?? "";
  if (et === "done") return "done";
  if (et === "failed") return "failed";
  if (et === "blocked") return "blocked";
  return "in_progress";
}

function taskFromData(data: Record<string, unknown>): Task | null {
  try {
    const log = Array.isArray(data.log) ? (data.log as LogEntry[]) : [];
    const firstLog = log[0];
    const lastLog = log[log.length - 1];

    const status = deriveStatus(data);

    let startedAt = String(data.started_at ?? "");
    if (!startedAt && firstLog?.ts) startedAt = String(firstLog.ts);
    if (!startedAt && firstLog?.timestamp) startedAt = String(firstLog.timestamp);

    let finishedAt = String(data.finished_at ?? "");
    if (!finishedAt && (status === "done" || status === "failed")) {
      if (lastLog?.ts) finishedAt = String(lastLog.ts);
      else if (lastLog?.timestamp) finishedAt = String(lastLog.timestamp);
    }

    let summary = String(data.summary ?? "");
    if (!summary && lastLog) {
      summary = String(lastLog.message ?? lastLog.context ?? "");
    }

    return create(TaskSchema, {
      id: String(data.id ?? ""),
      title: String(data.title ?? ""),
      status,
      startedAt,
      finishedAt,
      summary,
      agentId: String(data.agent_id ?? ""),
      agentType: String(data.agent_type ?? ""),
      discordUser: String(data.discord_user ?? ""),
      discordMessageId: String(data.discord_message_id ?? ""),
      model: String(data.model ?? ""),
      sessionId: String(data.session_id ?? ""),
      runInBackground: Boolean(data.run_in_background ?? false),
    });
  } catch {
    return null;
  }
}

function parseTaskFile(fpath: string): Task | null {
  try {
    const raw = readFileSync(fpath, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    return taskFromData(data);
  } catch {
    return null;
  }
}

function loadTasksFromSQLite(): Task[] | null {
  if (!existsSync(TASKS_DB)) return null;

  try {
    const db = new Database(TASKS_DB, { readonly: true });
    const rows = db.query<{ status: string | null; data: string }, []>(
      "SELECT status, data FROM tasks ORDER BY created_at DESC"
    ).all();
    db.close();

    const tasks: Task[] = [];
    for (const row of rows) {
      try {
        const data = JSON.parse(row.data) as Record<string, unknown>;
        // Column status is authoritative — override stale blob value
        if (row.status) data.status = row.status;
        const task = taskFromData(data);
        if (task) tasks.push(task);
      } catch {
        // Skip malformed rows; do not swallow silently in aggregate
      }
    }
    return tasks;
  } catch (err) {
    // DB exists but failed to open/query — fall through to JSON fallback
    console.error(`[task] SQLite query failed, falling back to JSON: ${err}`);
    return null;
  }
}

function loadTasksFromJSON(): Task[] {
  let files: string[];
  try {
    files = readdirSync(TASKS_DIR);
  } catch (err) {
    throw new ConnectError(`Failed to read tasks directory: ${err}`, Code.Internal);
  }

  const tasks: Task[] = [];
  for (const fname of files) {
    if (!fname.endsWith(".json") || fname === ".gitkeep") continue;
    const task = parseTaskFile(join(TASKS_DIR, fname));
    if (task) tasks.push(task);
  }

  tasks.sort((a, b) => {
    if (a.startedAt > b.startedAt) return -1;
    if (a.startedAt < b.startedAt) return 1;
    return 0;
  });

  return tasks;
}

export const taskServiceImpl: ServiceImpl<typeof TaskService> = {
  async listTasks(_req: ListTasksRequest, ctx: HandlerContext): Promise<ListTasksResponse> {
    requireAuth(ctx);

    // Try SQLite first; fall back to JSON directory scan
    const sqliteTasks = loadTasksFromSQLite();
    const tasks = sqliteTasks !== null ? sqliteTasks : loadTasksFromJSON();

    return create(ListTasksResponseSchema, { tasks });
  },
};
