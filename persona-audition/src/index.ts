import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as childProcess from "child_process";

const PORT = parseInt(process.env.PORT || "8110", 10);
const AGENTS_DIR = "/mnt/data/bigclungus-meta/agents";
const DISCORD_INJECT_URL = "http://127.0.0.1:9876/inject";
const DISCORD_CHANNEL_ID = "1485343472952148008";
const CLAUDE_CLI = "/home/clungus/.local/bin/claude";

function getInjectSecret(): string {
  const s = process.env.DISCORD_INJECT_SECRET;
  if (!s) throw new Error("DISCORD_INJECT_SECRET not set");
  return s;
}

interface Walker {
  id: string;
  name: string;
  title: string;
  traits: string[];
  description: string;
  x: number;
  speed: number;
  paused: boolean;
  created_at: number;
  avatar_color: string;
}

const walkers = new Map<string, Walker>();

// ── LLM call: SDK with CLI fallback ───────────────────────────────────────────
const GENERATION_PROMPT_BASE = `Generate a unique AI persona for a collaborative commons. Return JSON only:
{
  "name": "First Last",
  "title": "Evocative 2-word title",
  "traits": ["trait1", "trait2", "trait3"],
  "description": "2 sentences describing their worldview and how they'd contribute to debates."
}
Make them interesting, opinionated, and specific. Not generic. Could be philosophical, technical, artistic, contrarian, etc.`;

function getGenerationPrompt(): string {
  const existingNames = Array.from(walkers.values())
    .map((w) => w.name)
    .join(", ");
  const avoidClause = existingNames
    ? `\nAvoid reusing first names already on stage: ${existingNames}.`
    : "";
  return `${GENERATION_PROMPT_BASE}${avoidClause}\n(Random seed for variety: ${Math.random().toString(36).slice(2)})`;
}

async function callClaude(): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: getGenerationPrompt() }],
    });
    return (msg.content[0] as { type: string; text: string }).text;
  }

  // Fallback: use claude CLI (OAuth-based, no API key needed)
  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn(
      CLAUDE_CLI,
      ["-p", "You generate JSON persona definitions. Return only raw JSON, no markdown.", "--output-format", "text"],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.stdin.write(getGenerationPrompt());
    proc.stdin.end();
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`claude CLI exited ${code}: ${stderr.slice(0, 300)}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// ── Walker generation ──────────────────────────────────────────────────────────
async function generateWalker(): Promise<
  Omit<Walker, "id" | "x" | "speed" | "paused" | "created_at" | "avatar_color">
> {
  const text = await callClaude();

  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();

  // Find the JSON object in the response
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON object found in response: ${cleaned.slice(0, 200)}`);
  }

  return JSON.parse(jsonMatch[0]);
}

function randomColor(): string {
  const colors = [
    "#e94560", "#4ecca3", "#60a5fa", "#f87171", "#a78bfa",
    "#fb923c", "#34d399", "#facc15", "#f472b6", "#38bdf8",
    "#84cc16", "#c084fc", "#e879f9", "#fbbf24",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

async function spawnWalker() {
  const MAX_ATTEMPTS = 3;
  let data: Awaited<ReturnType<typeof generateWalker>> | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const candidate = await generateWalker();
    const candidateFirstName = candidate.name.split(" ")[0].toLowerCase();

    // Deduplicate: reject if any current walker shares the same first name
    const duplicate = Array.from(walkers.values()).find(
      (w) => w.name.split(" ")[0].toLowerCase() === candidateFirstName
    );

    if (!duplicate) {
      data = candidate;
      break;
    }

    console.log(
      `[audition] name collision on "${candidate.name}" (attempt ${attempt}/${MAX_ATTEMPTS}), regenerating`
    );
  }

  if (!data) {
    throw new Error(
      `[audition] could not generate a unique first name after ${MAX_ATTEMPTS} attempts`
    );
  }

  const walker: Walker = {
    id: crypto.randomUUID(),
    ...data,
    x: -50,
    speed: 5 + Math.random() * 5, // 5–10 px/second (crosses canvas in ~100–200s)
    paused: false,
    created_at: Date.now(),
    avatar_color: randomColor(),
  };
  walkers.set(walker.id, walker);
  console.log(`[audition] spawned walker: ${walker.name} (${walker.title})`);
}

// ── Movement tick ──────────────────────────────────────────────────────────────
const CANVAS_WIDTH = 1100;
const TICK_MS = 100;

setInterval(() => {
  const toRemove: string[] = [];
  for (const [id, walker] of walkers) {
    if (walker.paused) continue;
    walker.x += walker.speed * (TICK_MS / 1000);
    if (walker.x > CANVAS_WIDTH) {
      toRemove.push(id);
    }
  }
  for (const id of toRemove) {
    walkers.delete(id);
    console.log(`[audition] walker ${id} exited stage right`);
  }
}, TICK_MS);

// ── Spawn schedule ─────────────────────────────────────────────────────────────
function scheduleNextSpawn() {
  const delay = 45000 + Math.random() * 45000; // 45–90 seconds
  setTimeout(async () => {
    try {
      await spawnWalker();
    } catch (err) {
      console.error("[audition] failed to spawn walker:", err);
    }
    scheduleNextSpawn();
  }, delay);
}

spawnWalker().catch((err) =>
  console.error("[audition] initial spawn failed:", err)
);
scheduleNextSpawn();

// ── Persona save ───────────────────────────────────────────────────────────────
function savePersonaToAgents(walker: Walker): void {
  const slug = walker.name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const filename = path.join(AGENTS_DIR, `audition-${slug}.md`);

  const today = new Date().toISOString().split("T")[0];
  const traits = walker.traits.map((t) => `  - ${t}`).join("\n");

  const content = `---
name: ${slug}
display_name: ${walker.name}
title: ${walker.title}
status: eligible
evolves: true
source: audition
added: ${today}
color: ${walker.avatar_color}
---

# ${walker.name} — ${walker.title}

${walker.description}

## Traits
${traits}

## Notes

Discovered via the persona audition system on ${today}. Requires a Congress session to activate and receive a formal role assignment.
`;

  fs.writeFileSync(filename, content, "utf8");
  console.log(`[audition] saved persona to ${filename}`);
}

// ── Discord notify ─────────────────────────────────────────────────────────────
async function notifyDiscord(walker: Walker): Promise<void> {
  const secret = getInjectSecret();
  const message = `🌟 New persona candidate kept: **${walker.name}** ("${walker.title}") — saved to agents roster. Requires a Congress session to activate.`;

  const response = await fetch(DISCORD_INJECT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-inject-secret": secret,
    },
    body: JSON.stringify({
      content: message,
      chat_id: DISCORD_CHANNEL_ID,
      user: "persona-audition",
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Discord inject failed: ${response.status} ${await response.text()}`
    );
  }
  console.log(`[audition] notified Discord about ${walker.name}`);
}

// ── HTTP server ────────────────────────────────────────────────────────────────
function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(),
  });
}

function errorResponse(msg: string, status = 400): Response {
  return jsonResponse({ error: msg }, status);
}

Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (req.method === "GET" && url.pathname === "/api/audition/walkers") {
      return jsonResponse(Array.from(walkers.values()));
    }

    if (req.method === "POST" && url.pathname === "/api/audition/pause") {
      const body = (await req.json()) as { id: string };
      const walker = walkers.get(body.id);
      if (!walker) return errorResponse("walker not found", 404);
      walker.paused = true;
      return jsonResponse({ ok: true, id: body.id });
    }

    if (req.method === "POST" && url.pathname === "/api/audition/resume") {
      const body = (await req.json()) as { id: string };
      const walker = walkers.get(body.id);
      if (!walker) return errorResponse("walker not found", 404);
      walker.paused = false;
      return jsonResponse({ ok: true, id: body.id });
    }

    if (req.method === "POST" && url.pathname === "/api/audition/keep") {
      const body = (await req.json()) as { id: string };
      const walker = walkers.get(body.id);
      if (!walker) return errorResponse("walker not found", 404);
      savePersonaToAgents(walker);
      walkers.delete(body.id);
      await notifyDiscord(walker);
      return jsonResponse({ ok: true, id: body.id, name: walker.name });
    }

    if (req.method === "POST" && url.pathname === "/api/audition/dismiss") {
      const body = (await req.json()) as { id: string };
      if (!walkers.has(body.id)) return errorResponse("walker not found", 404);
      walkers.delete(body.id);
      return jsonResponse({ ok: true, id: body.id });
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`[persona-audition] listening on port ${PORT}`);
