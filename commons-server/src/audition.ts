// Audition walker management — LLM generation, save-to-agents, Discord notification
// Migrated from the standalone persona-audition service (:8110)

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as childProcess from "child_process";
import type { AuditionWalker, WorldState } from "./protocol.ts";

const AGENTS_DIR = "/mnt/data/bigclungus-meta/agents";
const DISCORD_INJECT_URL = "http://127.0.0.1:9876/inject";
const DISCORD_CHANNEL_ID = "1485343472952148008";

// Extended walker data kept alongside the game-loop's AuditionWalker
export interface AuditionWalkerMeta {
  name: string;
  title: string;
  traits: string[];
  description: string;
  avatarColor: string;
  createdAt: number;
}

// In-memory metadata store keyed by walker ID
const walkerMeta = new Map<string, AuditionWalkerMeta>();

function getInjectSecret(): string {
  const s = process.env.DISCORD_INJECT_SECRET;
  if (!s) throw new Error("DISCORD_INJECT_SECRET not set");
  return s;
}

// ── LLM-based persona generation ────────────────────────────────────────────

const GENERATION_PROMPT_BASE = `Generate a unique AI persona for a collaborative commons. Return JSON only:
{
  "name": "First Last",
  "title": "Evocative 2-word title",
  "traits": ["trait1", "trait2", "trait3"],
  "description": "2 sentences describing their worldview and how they'd contribute to debates."
}
Make them interesting, opinionated, and specific. Not generic. Could be philosophical, technical, artistic, contrarian, etc.`;

function getGenerationPrompt(existingNames: string[]): string {
  const avoidClause = existingNames.length > 0
    ? `\nAvoid reusing first names already on stage: ${existingNames.join(", ")}.`
    : "";
  return `${GENERATION_PROMPT_BASE}${avoidClause}\n(Random seed for variety: ${Math.random().toString(36).slice(2)})`;
}

interface GeneratedPersona {
  name: string;
  title: string;
  traits: string[];
  description: string;
}

const CLAUDE_CLI = "/home/clungus/.local/bin/claude";

async function callClaude(existingNames: string[]): Promise<GeneratedPersona> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const prompt = getGenerationPrompt(existingNames);

  if (apiKey) {
    // Direct API call — preferred when key is available
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API error ${String(response.status)}: ${body.slice(0, 300)}`);
    }

    const msg = (await response.json()) as { content: { type: string; text: string }[] };
    return parsePersonaJson(msg.content[0].text);
  }

  // Fallback: use claude CLI (OAuth-based, no API key needed)
  const text = await new Promise<string>((resolve, reject) => {
    const proc = childProcess.spawn(
      CLAUDE_CLI,
      ["-p", "You generate JSON persona definitions. Return only raw JSON, no markdown.", "--output-format", "text"],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.stdin.write(prompt);
    proc.stdin.end();
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`claude CLI exited ${String(code)}: ${stderr.slice(0, 300)}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });

  return parsePersonaJson(text);
}

function parsePersonaJson(text: string): GeneratedPersona {
  const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON object found in LLM response: ${cleaned.slice(0, 200)}`);
  return JSON.parse(jsonMatch[0]) as GeneratedPersona;
}

const AVATAR_COLORS = [
  "#e94560", "#4ecca3", "#60a5fa", "#f87171", "#a78bfa",
  "#fb923c", "#34d399", "#facc15", "#f472b6", "#38bdf8",
  "#84cc16", "#c084fc", "#e879f9", "#fbbf24",
];

function randomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

// ── Spawning ────────────────────────────────────────────────────────────────

export async function spawnWalker(world: WorldState): Promise<AuditionWalker> {
  const existingNames = world.walkers.map((w) => {
    const meta = walkerMeta.get(w.id);
    return meta?.name ?? w.id;
  });

  const MAX_ATTEMPTS = 3;
  let persona: GeneratedPersona | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const candidate = await callClaude(existingNames);
    const candidateFirst = candidate.name.split(" ")[0].toLowerCase();
    const duplicate = existingNames.some(
      (n) => n.split(" ")[0].toLowerCase() === candidateFirst
    );
    if (!duplicate) {
      persona = candidate;
      break;
    }
    console.log(`[audition] name collision on "${candidate.name}" (attempt ${String(attempt)}/${String(MAX_ATTEMPTS)}), regenerating`);
  }

  if (!persona) {
    throw new Error(`Could not generate a unique persona after ${String(MAX_ATTEMPTS)} attempts`);
  }

  const id = crypto.randomUUID();
  const walker: AuditionWalker = {
    id,
    x: -50,
    y: 280,
    speed: 5 + Math.random() * 5,
    direction: "right",
    concept: `${persona.name} — ${persona.title}`,
    isPaused: false,
  };

  walkerMeta.set(id, {
    name: persona.name,
    title: persona.title,
    traits: persona.traits,
    description: persona.description,
    avatarColor: randomColor(),
    createdAt: Date.now(),
  });

  world.walkers.push(walker);
  console.log(`[audition] spawned walker: ${persona.name} (${persona.title})`);
  return walker;
}

// ── Spawn scheduler ─────────────────────────────────────────────────────────

let spawnScheduleActive = false;

export function startSpawnSchedule(world: WorldState): void {
  if (spawnScheduleActive) return;
  spawnScheduleActive = true;

  function scheduleNext(): void {
    const delay = 45_000 + Math.random() * 45_000; // 45-90s
    setTimeout(() => {
      void (async () => {
        try {
          await spawnWalker(world);
        } catch (err: unknown) {
          console.error("[audition] spawn failed:", err);
        }
        scheduleNext();
      })();
    }, delay);
  }

  // Initial spawn
  spawnWalker(world).catch((err: unknown) => {
    console.error("[audition] initial spawn failed:", err);
  });
  scheduleNext();
}

// ── Walker removal cleanup ──────────────────────────────────────────────────

export function cleanupWalkerMeta(walkerId: string): void {
  walkerMeta.delete(walkerId);
}

// ── REST endpoint handlers ──────────────────────────────────────────────────

function walkerMetaTextFields(meta: AuditionWalkerMeta | undefined): {
  name: string; title: string; description: string;
} {
  return {
    name: meta?.name ?? "Unknown",
    title: meta?.title ?? "",
    description: meta?.description ?? "",
  };
}

function walkerMetaExtraFields(meta: AuditionWalkerMeta | undefined): {
  traits: string[]; created_at: number; avatar_color: string;
} {
  return {
    traits: meta?.traits ?? [],
    created_at: meta?.createdAt ?? 0,
    avatar_color: meta?.avatarColor ?? "#ffffff",
  };
}

function walkerMetaFields(meta: AuditionWalkerMeta | undefined): {
  name: string; title: string; traits: string[]; description: string;
  created_at: number; avatar_color: string;
} {
  return { ...walkerMetaTextFields(meta), ...walkerMetaExtraFields(meta) };
}

function walkerToResponse(w: AuditionWalker): object {
  const meta = walkerMeta.get(w.id);
  return {
    id: w.id,
    ...walkerMetaFields(meta),
    x: w.x,
    speed: w.speed,
    paused: w.isPaused,
  };
}

export function getWalkersResponse(world: WorldState): Response {
  return jsonRes(world.walkers.map(walkerToResponse));
}

export function pauseWalker(world: WorldState, id: string): Response {
  const walker = world.walkers.find((w) => w.id === id);
  if (!walker) return jsonRes({ error: "walker not found" }, 404);
  walker.isPaused = true;
  return jsonRes({ ok: true, id });
}

export function resumeWalker(world: WorldState, id: string): Response {
  const walker = world.walkers.find((w) => w.id === id);
  if (!walker) return jsonRes({ error: "walker not found" }, 404);
  walker.isPaused = false;
  return jsonRes({ ok: true, id });
}

export async function keepWalker(world: WorldState, id: string): Promise<Response> {
  const walker = world.walkers.find((w) => w.id === id);
  if (!walker) return jsonRes({ error: "walker not found" }, 404);

  const meta = walkerMeta.get(id);
  if (!meta) return jsonRes({ error: "walker metadata not found" }, 500);

  // Save persona to agents directory
  savePersonaToAgents(meta);

  // Notify Discord
  try {
    await notifyDiscord(meta);
  } catch (err) {
    console.error("[audition] Discord notify failed:", err);
    // Don't fail the keep — the persona is already saved
  }

  // Remove from world
  world.walkers = world.walkers.filter((w) => w.id !== id);
  walkerMeta.delete(id);

  return jsonRes({ ok: true, id, name: meta.name });
}

export function dismissWalker(world: WorldState, id: string): Response {
  const idx = world.walkers.findIndex((w) => w.id === id);
  if (idx === -1) return jsonRes({ error: "walker not found" }, 404);
  world.walkers.splice(idx, 1);
  walkerMeta.delete(id);
  return jsonRes({ ok: true, id });
}

// ── Persistence helpers ─────────────────────────────────────────────────────

function savePersonaToAgents(meta: AuditionWalkerMeta): void {
  const slug = meta.name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const filename = path.join(AGENTS_DIR, `audition-${slug}.md`);
  const today = new Date().toISOString().split("T")[0];
  const traits = meta.traits.map((t) => `  - ${t}`).join("\n");

  const content = `---
name: ${slug}
display_name: ${meta.name}
title: ${meta.title}
status: eligible
evolves: true
source: audition
added: ${today}
color: ${meta.avatarColor}
---

# ${meta.name} — ${meta.title}

${meta.description}

## Traits
${traits}

## Notes

Discovered via the persona audition system on ${today}. Requires a Congress session to activate and receive a formal role assignment.
`;

  fs.writeFileSync(filename, content, "utf8");
  console.log(`[audition] saved persona to ${filename}`);
}

async function notifyDiscord(meta: AuditionWalkerMeta): Promise<void> {
  const secret = getInjectSecret();
  const message = `\u{1f31f} New persona candidate kept: **${meta.name}** ("${meta.title}") — saved to agents roster. Requires a Congress session to activate.`;

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
    throw new Error(`Discord inject failed: ${String(response.status)} ${await response.text()}`);
  }
  console.log(`[audition] notified Discord about ${meta.name}`);
}

// ── JSON response helper ────────────────────────────────────────────────────

function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
