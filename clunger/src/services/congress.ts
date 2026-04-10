import type { ServiceImpl } from "@connectrpc/connect";
import type { ConnectRouter } from "@connectrpc/connect";
// Use the GenService from congress_pb (bufbuild/protobuf v2 API)
import { CongressService } from "../../gen/congress/v1/congress_pb.js";
import type {
  StartSessionRequest,
  StartSessionResponse,
  PostDebateRequest,
  PostDebateResponse,
  StreamDebateRequest,
  DebateToken,
  ListIdentitiesRequest,
  ListIdentitiesResponse,
  ListSessionsRequest,
  ListSessionsResponse,
  GetSessionRequest,
  GetSessionResponse,
  PatchSessionRequest,
  PatchSessionResponse,
  Identity,
  SessionSummary,
} from "../../gen/congress/v1/congress_pb.js";
import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as childProcess from "node:child_process";
import matter from "gray-matter";

// ─── Constants ─────────────────────────────────────────────────────────────

const SESSIONS_DIR = "/mnt/data/hello-world/sessions";
const AGENTS_DIR = "/mnt/data/bigclungus-meta/agents";
const PERSONAS_DB_PATH = "/mnt/data/hello-world/personas.db";
const MODEL_ALIASES: Record<string, string> = {
  gemini: "gemini-2.5-flash",
  grok: "grok-3-mini",
  opus: "opus",
  claude: "haiku",
  haiku: "haiku",
  sonnet: "sonnet",
};

const CLAUDE_SHORT_NAMES = new Set(["haiku", "opus", "sonnet"]);

// ─── Module-level stream state ──────────────────────────────────────────────

export interface StreamState {
  identity: string;
  displayName: string;
  text: string;
  done: boolean;
}

export const activeStreams = new Map<string, StreamState>();

// ─── DB helpers ─────────────────────────────────────────────────────────────

interface PersonaRow {
  name: string;
  display_name: string;
  model: string;
  role: string;
  congress: number;
  evolves: number;
  avatar_url: string;
  status: string;
}

function getPersonaFromDb(name: string): PersonaRow | null {
  try {
    const db = new Database(PERSONAS_DB_PATH, { readonly: true });
    const row = db.query<PersonaRow, [string]>(
      "SELECT name, display_name, model, role, congress, evolves, avatar_url, status FROM personas WHERE name = ?"
    ).get(name);
    db.close();
    return row ?? null;
  } catch (e) {
    console.warn(`[congress] personas.db lookup failed for ${name}, falling back to YAML: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// ─── Persona / MD helpers ────────────────────────────────────────────────────

function loadIdentityMd(name: string): { meta: Record<string, unknown>; content: string } | null {
  const fpath = path.join(AGENTS_DIR, `${name}.md`);
  if (fs.existsSync(fpath)) {
    const raw = fs.readFileSync(fpath, "utf-8");
    const parsed = matter(raw);
    return { meta: parsed.data as Record<string, unknown>, content: raw };
  }
  return null;
}

// ─── LLM routing ────────────────────────────────────────────────────────────

async function callLlm(
  model: string,
  systemPrompt: string,
  userMessage: string,
  onToken?: (chunk: string) => void
): Promise<string> {
  const modelLower = (model || "").toLowerCase().trim();
  const resolved = MODEL_ALIASES[modelLower] ?? modelLower;

  if (resolved.startsWith("together/")) {
    const togetherModel = resolved.slice(9);
    return callTogether(systemPrompt, userMessage, togetherModel, onToken);
  } else if (resolved.startsWith("grok-") || resolved.startsWith("xai/")) {
    const grokModel = resolved.startsWith("xai/") ? resolved.slice(4) : resolved;
    return callClaudeCli(systemPrompt, userMessage, grokModel, onToken, {
      ANTHROPIC_BASE_URL: "http://127.0.0.1:4100",
      ANTHROPIC_API_KEY: "dummy",
    });
  } else if (resolved.startsWith("gemini-") || resolved.startsWith("google/")) {
    const geminiModel = resolved.startsWith("google/") ? resolved.slice(7) : resolved;
    return callGeminiCli(systemPrompt, userMessage, geminiModel, onToken);
  } else if (resolved.startsWith("claude-") || CLAUDE_SHORT_NAMES.has(resolved)) {
    // Normalize full claude model IDs to short names for CLI
    const shortName = resolved.includes("opus") ? "opus"
      : resolved.includes("sonnet") ? "sonnet"
      : resolved.includes("haiku") ? "haiku"
      : resolved;
    return callClaudeCli(systemPrompt, userMessage, shortName, onToken);
  } else {
    throw new Error(`Unknown model: ${JSON.stringify(model)}`);
  }
}

async function callClaudeCli(
  systemPrompt: string,
  userMessage: string,
  model?: string,
  onToken?: (chunk: string) => void,
  extraEnv?: Record<string, string>
): Promise<string> {
  const parsed = matter(systemPrompt);
  const promptBody = parsed.content.trim();
  const args = ["-p", promptBody, "--output-format", "text"];
  if (model) {
    args.push("--model", model);
  }
  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn("/home/clungus/.local/bin/claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: extraEnv ? { ...process.env, ...extraEnv } : undefined,
    });
    let fullText = "";
    let stderr = "";

    // Kill the process if it runs longer than 120 seconds to prevent zombie accumulation
    const killTimer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("claude CLI timed out after 120s"));
    }, 120_000);

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      fullText += text;
      onToken?.(text);
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.stdin.write(userMessage);
    proc.stdin.end();
    proc.on("close", (code) => {
      clearTimeout(killTimer);
      if (code !== 0) {
        reject(new Error(`claude CLI exited with code ${code}: ${stderr.slice(0, 500)}`));
      } else {
        // Extract assistant content from JSON output if needed
        const trimmed = fullText.trim();
        resolve(trimmed);
      }
    });
    proc.on("error", (err) => {
      clearTimeout(killTimer);
      reject(err);
    });
  });
}

async function callTogether(
  systemPrompt: string,
  userMessage: string,
  model: string,
  onToken?: (chunk: string) => void
): Promise<string> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) {
    throw new Error("TOGETHER_API_KEY is not set — add it to /mnt/data/clunger/.env and restart clunger.service");
  }

  // Strip YAML frontmatter before using
  const parsed = matter(systemPrompt);
  const promptBody = parsed.content.trim();

  const payload = {
    model,
    messages: [
      { role: "system", content: promptBody },
      { role: "user", content: userMessage },
    ],
    max_tokens: 2048,
    temperature: 0.7,
  };

  const timeout = 120_000; // 120 seconds
  const startTime = Date.now();

  try {
    const response = await fetch("https://api.together.xyz/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`together.ai API error (HTTP ${response.status}): ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const choices = data.choices ?? [];
    if (!choices.length || !choices[0]?.message?.content) {
      throw new Error(`together.ai API returned invalid response: ${JSON.stringify(data).slice(0, 300)}`);
    }

    const text = choices[0].message.content.trim();
    if (text) {
      onToken?.(text);
    }
    return text;
  } catch (error) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`together.ai request timed out after 120s (model: ${model})`);
    }
    if (error instanceof Error) {
      throw new Error(`together.ai call failed for ${model}: ${error.message}`);
    }
    throw error;
  }
}

async function callGeminiCli(
  systemPrompt: string,
  userMessage: string,
  model: string,
  onToken?: (chunk: string) => void
): Promise<string> {
  const GEMINI_BIN = "/usr/local/bin/gemini";
  if (!fs.existsSync(GEMINI_BIN)) {
    throw new Error(`Gemini CLI not found at ${GEMINI_BIN} — install it or check the path`);
  }
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set — add it to /mnt/data/clunger/.env and restart clunger.service");
  }

  // Strip YAML frontmatter before passing to gemini CLI
  const parsed = matter(systemPrompt);
  const promptBody = parsed.content.trim();
  const fullPrompt = promptBody + "\n\n" + userMessage;

  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const args = ["--yolo", "-p", fullPrompt, "--output-format", "text"];
    if (model) args.push("-m", model);
    const proc = spawn(GEMINI_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: string[] = [];
    const stderrChunks: string[] = [];

    // Kill the process if it runs longer than 120 seconds to prevent zombie accumulation
    const killTimer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`gemini CLI timed out after 120s (model: ${model})`));
    }, 120_000);

    proc.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      chunks.push(text);
      onToken?.(text);
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderrChunks.push(data.toString());
    });
    proc.on("close", (code) => {
      clearTimeout(killTimer);
      if (code !== 0) {
        const stderr = stderrChunks.join("").slice(0, 500);
        reject(new Error(`gemini CLI exited with code ${code}${stderr ? `: ${stderr}` : ""}`));
      } else {
        resolve(chunks.join("").trim());
      }
    });
    proc.on("error", (err) => {
      clearTimeout(killTimer);
      reject(new Error(`gemini CLI spawn error: ${err.message} (binary: ${GEMINI_BIN})`));
    });
  });
}

// ─── Session helpers ─────────────────────────────────────────────────────────

function nextSessionNumber(): number {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const files = fs.readdirSync(SESSIONS_DIR);
  const nums: number[] = [];
  for (const f of files) {
    const m = f.match(/^(?:congress|trial|session)-(\d+)\.json$/);
    if (m) nums.push(parseInt(m[1], 10));
  }
  return Math.max(0, ...nums) + 1;
}

function sessionFilePath(sessionId: string): string {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

function readSession(sessionId: string): Record<string, unknown> {
  const fpath = sessionFilePath(sessionId);
  if (!fs.existsSync(fpath)) {
    throw new Error(`Session '${sessionId}' not found`);
  }
  return JSON.parse(fs.readFileSync(fpath, "utf-8")) as Record<string, unknown>;
}

function writeSession(sessionId: string, data: Record<string, unknown>): void {
  const fpath = sessionFilePath(sessionId);
  fs.writeFileSync(fpath, JSON.stringify(data, null, 2), "utf-8");
}

// ─── Roster builder ──────────────────────────────────────────────────────────

function buildRoster(): unknown[] {
  const roster: unknown[] = [];
  if (!fs.existsSync(AGENTS_DIR)) return roster;
  const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md")).sort();
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(AGENTS_DIR, file), "utf-8");
      const { data: meta } = matter(raw);
      const name = meta.name as string | undefined;
      if (!name || name === "chairman") continue;
      if (meta.congress === false) continue;
      const status = String(meta.status ?? "eligible");
      roster.push({
        id: name,
        name,
        display_name: meta.display_name ?? "",
        title: meta.title ?? "",
        avatar_url: meta.avatar_url ?? "",
        status,
        emoji: EMOJI_MAP[name] ?? "🤖",
        color: COLOR_MAP[name] ?? "#888888",
        description: meta.role ?? "",
        role: meta.role ?? "",
        model: meta.model ?? "",
      });
    } catch (e) {
      console.warn(`[congress] buildRoster: skipping unparseable file ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return roster;
}

// ─── CongressServiceImpl ─────────────────────────────────────────────────────

export const congressServiceImpl: ServiceImpl<typeof CongressService> = {
  async startSession(req: StartSessionRequest): Promise<StartSessionResponse> {
    const topic = req.topic.trim();
    if (!topic) {
      throw new Error("Missing 'topic' field");
    }
    const discordUser = req.discordUser || "";
    const flavor = ((req as Record<string, unknown>).flavor as string) || "normal";
    const num = nextSessionNumber();
    const sessionId = `session-${String(num).padStart(4, "0")}`;
    const roster = buildRoster();
    const session: Record<string, unknown> = {
      session_id: sessionId,
      session_number: num,
      topic,
      flavor,
      discord_user: discordUser || null,
      started_at: new Date().toISOString(),
      status: "deliberating",
      rounds: [],
      verdict: null,
      roster,
    };
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    writeSession(sessionId, session);
    return { sessionId, sessionNumber: num } satisfies StartSessionResponse;
  },

  async postDebate(req: PostDebateRequest): Promise<PostDebateResponse> {
    const { task, identity, sessionId } = req;
    if (!task.trim()) throw new Error("Missing 'task' field");
    if (!identity.trim()) throw new Error("Missing 'identity' field");
    if (!/^[\w-]+$/.test(identity)) throw new Error("Invalid identity name");
    if (sessionId && !/^(?:congress|trial|session)-\d+$/.test(sessionId)) throw new Error("Invalid session_id format");

    const loaded = loadIdentityMd(identity);
    if (!loaded) throw new Error(`Identity '${identity}' not found`);
    const { meta, content: systemPrompt } = loaded;

    const lengthInstruction =
      identity === "chairman"
        ? "Congress is debating the following task/question. Respond in 5-8 sentences maximum. Be direct and authoritative — no preamble, no padding, no lists. Deliver your synthesis or judgment plainly:\n\n"
        : "Congress is debating the following task/question. Be concise — 3-4 sentences maximum. No preamble, no hedging, just your position:\n\n";
    const userMessage = lengthInstruction + task;

    const displayName = (meta.display_name as string | undefined) ?? identity;

    // Determine model: prefer personas.db, fall back to YAML frontmatter
    const dbEntry = getPersonaFromDb(identity);
    const rawModel = (dbEntry?.model ?? (meta.model as string | undefined) ?? "claude").trim();
    const routedModel = MODEL_ALIASES[rawModel.toLowerCase()] ?? rawModel;

    if (sessionId) {
      activeStreams.set(sessionId, { identity, displayName, text: "", done: false });
    }

    let responseText: string;
    try {
      console.log(`[congress] Routing ${identity} to model: ${routedModel}`);
      responseText = await callLlm(routedModel, systemPrompt, userMessage, (chunk) => {
        if (sessionId) {
          const state = activeStreams.get(sessionId);
          if (state) state.text += chunk;
        }
      });
      console.log(`[congress] ${identity} response received from ${routedModel} (${responseText.length} chars)`);
    } catch (e) {
      if (sessionId) {
        const state = activeStreams.get(sessionId);
        if (state) state.done = true;
        setTimeout(() => activeStreams.delete(sessionId), 5_000);
      }
      const errMsg = `[${routedModel}] LLM error for ${identity}: ${e instanceof Error ? e.message : String(e)}`;
      console.error("postDebate LLM error:", errMsg);
      throw new Error(
        errMsg
      );
    }

    if (sessionId) {
      const state = activeStreams.get(sessionId);
      if (state) state.done = true;
      setTimeout(() => activeStreams.delete(sessionId), 5_000);
    }

    // Append round to session file
    if (sessionId) {
      const fpath = sessionFilePath(sessionId);
      if (fs.existsSync(fpath)) {
        try {
          const session = JSON.parse(fs.readFileSync(fpath, "utf-8")) as Record<string, unknown>;
          const rounds = (session.rounds as unknown[]) ?? [];
          rounds.push({
            ts: new Date().toISOString(),
            identity,
            response: responseText,
            model: routedModel,
          });
          session.rounds = rounds;
          fs.writeFileSync(fpath, JSON.stringify(session, null, 2), "utf-8");
        } catch (e) {
          console.warn(`[congress] postDebate: failed to append round to session file ${sessionId}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    // Increment total_congresses in personas.db (non-fatal)
    if (identity && identity !== "chairman") {
      try {
        const db = new Database(PERSONAS_DB_PATH);
        db.run("UPDATE personas SET total_congresses = total_congresses + 1, updated_at = ? WHERE name = ?", [
          new Date().toISOString(),
          identity,
        ]);
        db.close();
      } catch (e) {
        console.warn(`[congress] postDebate: failed to increment total_congresses for ${identity}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { response: responseText, identity } satisfies PostDebateResponse;
  },

  async *streamDebate(req: StreamDebateRequest): AsyncIterable<DebateToken> {
    const { sessionId } = req;
    const maxIterations = 600; // 60 seconds at 100ms intervals
    let lastLen = 0;

    for (let i = 0; i < maxIterations; i++) {
      const state = activeStreams.get(sessionId);

      if (state) {
        const newText = state.text.slice(lastLen);
        if (newText) {
          yield {
            identity: state.identity,
            displayName: state.displayName,
            text: newText,
            done: false,
          } satisfies DebateToken;
          lastLen = state.text.length;
        }
        if (state.done) {
          yield {
            identity: state.identity,
            displayName: state.displayName,
            text: "",
            done: true,
          } satisfies DebateToken;
          return;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Timeout: emit done signal
    const state = activeStreams.get(sessionId);
    yield {
      identity: state?.identity ?? "",
      displayName: state?.displayName ?? "",
      text: "",
      done: true,
    } satisfies DebateToken;
  },

  async listIdentities(_req: ListIdentitiesRequest): Promise<ListIdentitiesResponse> {
    const identities: Identity[] = [];

    if (!fs.existsSync(AGENTS_DIR)) return { identities } satisfies ListIdentitiesResponse;
    const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md")).sort();
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(AGENTS_DIR, file), "utf-8");
        const { data: meta } = matter(raw);
        if (!meta.name) continue;
        if (meta.congress === false) continue;
        const traitsRaw = meta.traits;
        const traits: string[] = Array.isArray(traitsRaw)
          ? traitsRaw.map(String)
          : typeof traitsRaw === "string"
          ? [traitsRaw]
          : [];
        const status = String(meta.status ?? "eligible");
        identities.push({
          name: (meta.name as string) ?? "",
          role: (meta.role as string) ?? "",
          displayName: (meta.display_name as string) ?? "",
          avatarUrl: (meta.avatar_url as string) ?? "",
          model: (meta.model as string) ?? "",
          status,
          congress: meta.congress !== false,
          evolves: (meta.evolves as boolean) ?? false,
          title: (meta.title as string) ?? "",
          sex: (meta.sex as string) ?? "",
          traits,
        } satisfies Identity);
      } catch (e) {
        console.warn(`[congress] listIdentities: skipping unparseable file ${file}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { identities } satisfies ListIdentitiesResponse;
  },

  async listSessions(req: ListSessionsRequest): Promise<ListSessionsResponse> {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    const files = fs.readdirSync(SESSIONS_DIR).filter((f) => /^(?:congress|trial|session)-\d+\.json$/.test(f));
    const sessions: (SessionSummary & { _startedAt?: string })[] = [];

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8");
        const s = JSON.parse(raw) as Record<string, unknown>;
        // Derive flavor: from JSON field, or infer from legacy file prefix
        let flavor = (s.flavor as string) ?? "";
        if (!flavor) {
          if (s.defendant) flavor = "trial";
          else if (s.mode === "meme") flavor = "meme";
          else flavor = "normal";
        }
        const entry = {
          sessionId: (s.session_id as string) ?? "",
          sessionNumber: (s.session_number as number) ?? 0,
          topic: (s.topic as string) ?? "",
          status: (s.status as string) ?? "",
          verdict: (s.verdict as string) ?? "",
          flavor,
          _startedAt: String(s.started_at ?? s.saved_at ?? ""),
        } as SessionSummary & { _startedAt?: string };
        sessions.push(entry);
      } catch (e) {
        console.warn(`[congress] listSessions: skipping malformed session file ${file}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Sort chronologically by timestamp (trials use saved_at), descending (most recent first)
    sessions.sort((a, b) => {
      if (a._startedAt && b._startedAt) {
        const cmp = b._startedAt.localeCompare(a._startedAt);
        if (cmp !== 0) return cmp;
      }
      return b.sessionNumber - a.sessionNumber;
    });
    // Strip internal sort key before returning
    for (const s of sessions) delete s._startedAt;

    const pageSize = req.pageSize ?? 0;
    const limited = pageSize > 0 ? sessions.slice(0, pageSize) : sessions;
    return { sessions: limited } satisfies ListSessionsResponse;
  },

  async getSession(req: GetSessionRequest): Promise<GetSessionResponse> {
    const session = readSession(req.sessionId);
    return { sessionJson: JSON.stringify(session, null, 2) } satisfies GetSessionResponse;
  },

  async patchSession(req: PatchSessionRequest): Promise<PatchSessionResponse> {
    const { sessionId } = req;
    const session = readSession(sessionId);

    // Only keys that the PatchSessionRequest proto actually carries.
    // defendant/charges/flavor are set via the REST PATCH endpoint (trial_act.py),
    // not via RPC — they are not in the proto schema.
    const ALLOWED = ["verdict", "status", "finished_at", "evolution", "thread_id", "task_titles"] as const;
    type AllowedKey = (typeof ALLOWED)[number];
    const reqMap: Record<AllowedKey, string | undefined> = {
      verdict: req.verdict,
      status: req.status,
      finished_at: req.finishedAt,
      evolution: req.evolution,
      thread_id: req.threadId,
      task_titles: req.taskTitles,
    };

    for (const key of ALLOWED) {
      const val = reqMap[key];
      if (val !== undefined && val !== null) {
        session[key] = val;
      }
    }

    writeSession(sessionId, session);
    return { ok: true, sessionId } satisfies PatchSessionResponse;
  },
};

export function registerCongressRoutes(router: ConnectRouter): void {
  router.service(CongressService, congressServiceImpl);
}
