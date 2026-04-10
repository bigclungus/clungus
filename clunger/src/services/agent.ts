import { Database } from "bun:sqlite";
import type { HandlerContext, ServiceImpl } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { AgentService } from "../../gen/agent/v1/agent_pb.js";
import {
  AgentSchema,
  ListAgentsResponseSchema,
} from "../../gen/agent/v1/agent_pb.js";
import type {
  Agent,
  ListAgentsRequest,
  ListAgentsResponse,
} from "../../gen/agent/v1/agent_pb.js";
import * as fs from "node:fs";
import * as path from "node:path";
import matter from "gray-matter";

const PERSONAS_DB = "/mnt/data/hello-world/personas.db";
const SESSIONS_DIR = "/mnt/data/hello-world/sessions";
const AGENTS_DIR = "/mnt/data/bigclungus-meta/agents";

const EMOJI_MAP: Record<string, string> = {
  architect: "🏗️", critic: "🔍", ux: "🎨",
  otto: "🌪️", spengler: "🕰️", chairman: "⚖️",
  wolf: "🐺", hume: "🔬", adelbert: "🗡️",
};

const COLOR_MAP: Record<string, string> = {
  architect: "#f59e0b", critic: "#f87171", ux: "#60a5fa",
  otto: "#a78bfa", spengler: "#94a3b8",
  wolf: "#f97316", hume: "#38bdf8", adelbert: "#e879f9",
};

interface VerdictCounts {
  retained: number;
  evolved: number;
  retired: number;
  lastVerdict: string;
}

function buildVerdictHistory(): Map<string, VerdictCounts> {
  const history = new Map<string, VerdictCounts>();

  function inc(displayName: string, type: "retained" | "evolved" | "retired", verdict: string) {
    if (!displayName) return;
    const entry = history.get(displayName) ?? { retained: 0, evolved: 0, retired: 0, lastVerdict: "" };
    entry[type] += 1;
    entry.lastVerdict = verdict.toUpperCase();
    history.set(displayName, entry);
  }

  try {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => /^congress-\d+\.json$/.test(f));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8");
        const sdata = JSON.parse(raw) as Record<string, unknown>;
        const evo = (sdata.evolution ?? {}) as Record<string, unknown>;
        const retained = (evo.retained as string[] | undefined) ?? [];
        const evolved = (evo.evolved as Array<{ display_name?: string }> | undefined) ?? [];
        const retired = (evo.retired as Array<{ display_name?: string }> | undefined) ?? (evo.fired as Array<{ display_name?: string }> | undefined) ?? [];
        for (const pname of retained) inc(pname, "retained", "RETAINED");
        for (const item of evolved) inc(item.display_name ?? "", "evolved", "EVOLVED");
        for (const item of retired) inc(item.display_name ?? "", "retired", "RETIRED");
      } catch {
        // skip malformed
      }
    }
  } catch {
    // sessions dir missing or unreadable
  }

  return history;
}

function loadMdMeta(name: string): Record<string, unknown> {
  const fpath = path.join(AGENTS_DIR, `${name}.md`);
  if (fs.existsSync(fpath)) {
    try {
      const raw = fs.readFileSync(fpath, "utf-8");
      return matter(raw).data as Record<string, unknown>;
    } catch (e) {
      console.warn(`[agent] loadMdMeta: failed to parse ${fpath}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return {};
}

function openDb(): Database {
  return new Database(PERSONAS_DB, { readonly: true });
}

function rowToAgent(row: Record<string, unknown>, verdictHistory: Map<string, VerdictCounts>): Agent {
  const name = String(row.name ?? "");
  const displayName = String(row.display_name ?? name);
  const meta = loadMdMeta(name);
  const vh = verdictHistory.get(displayName) ?? { retained: 0, evolved: 0, retired: 0, lastVerdict: "" };

  const traitsRaw = meta.traits;
  const traits: string[] = Array.isArray(traitsRaw)
    ? traitsRaw.map(String)
    : typeof traitsRaw === "string"
    ? [traitsRaw]
    : [];

  return create(AgentSchema, {
    id: name,
    name,
    role: String(row.role ?? ""),
    emoji: EMOJI_MAP[name] ?? "🤖",
    color: COLOR_MAP[name] ?? "#888888",
    description: String(row.role ?? ""),
    model: String(row.model ?? ""),
    displayName,
    avatarUrl: String(row.avatar_url ?? ""),
    title: String(row.title ?? ""),
    sex: String(row.sex ?? ""),
    isModerator: name === "chairman",
    statsRetained: vh.retained,
    statsEvolved: vh.evolved,
    statsRetired: vh.retired,
    lastVerdict: vh.lastVerdict || String(row.last_verdict ?? ""),
    traits,
  });
}

export const agentServiceImpl: ServiceImpl<typeof AgentService> = {
  async listAgents(_req: ListAgentsRequest, _ctx: HandlerContext): Promise<ListAgentsResponse> {
    const db = openDb();
    try {
      const rows = db.query("SELECT * FROM personas ORDER BY name").all() as Record<string, unknown>[];
      const verdictHistory = buildVerdictHistory();

      const eligible: Agent[] = [];
      const meme: Agent[] = [];
      let moderator: Agent | undefined;

      for (const row of rows) {
        const name = String(row.name ?? "");
        const status = String(row.status ?? "eligible");
        const agent = rowToAgent(row, verdictHistory);

        if (name === "chairman") {
          moderator = agent;
        } else if (status === "meme") {
          meme.push(agent);
        } else {
          eligible.push(agent);
        }
      }

      return create(ListAgentsResponseSchema, { active: eligible, retired: meme, moderator });
    } finally {
      db.close();
    }
  },
};
