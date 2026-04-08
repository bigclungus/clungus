import http from "node:http";
import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync, statSync, openSync, readSync, closeSync, globSync } from "node:fs";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { Database } from "bun:sqlite";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import matter from "gray-matter";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { WebSocketServer, WebSocket } from "ws";
import { runPostMergeReview } from "./services/post-merge-review.js";

// ── Error monitoring: inject alerts to bot on critical failures ────────────
async function injectAlert(message: string): Promise<void> {
  try {
    const resp = await fetch("http://127.0.0.1:8085/webhooks/bigclungus-main", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `⚠️ ${message}`, chat_id: "1485343472952148008", user: "clunger-monitor" }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!resp.ok) console.error("[clunger] injectAlert failed:", resp.status);
  } catch (e) {
    console.error("[clunger] injectAlert error:", e);
  }
}

// Prevent unhandled rejections (e.g. Anthropic API 4xx errors escaping async handlers)
// from crashing the process. Surface them as logs and inject alerts.
process.on("unhandledRejection", (reason: unknown) => {
  console.error("[clunger] unhandledRejection:", reason);
  injectAlert(`clunger unhandledRejection: ${String(reason).slice(0, 300)}`).catch(() => {});
});
process.on("uncaughtException", (err: Error) => {
  console.error("[clunger] uncaughtException:", err.stack ?? err);
  injectAlert(`clunger uncaughtException: ${err.message.slice(0, 300)}`).catch(() => {});
  // Do NOT call process.exit(1) — log and continue so transient errors don't crash the server
});

import { PersonaService } from "../gen/persona/v1/persona_pb.js";
import { AgentService } from "../gen/agent/v1/agent_pb.js";
import { TaskService } from "../gen/task/v1/task_pb.js";
import { WalletService } from "../gen/wallet/v1/wallet_pb.js";
import { CongressService } from "../gen/congress/v1/congress_pb.js";
import { personaServiceImpl } from "./services/persona.js";
import { agentServiceImpl } from "./services/agent.js";
import { taskServiceImpl } from "./services/task.js";
import { walletServiceImpl } from "./services/wallet.js";
import { congressServiceImpl, activeStreams } from "./services/congress.js";
import { PostDebateRequestSchema } from "../gen/congress/v1/congress_pb.js";
import { create } from "@bufbuild/protobuf";
import { isInternalRequest } from "./auth.js";
import { injectDiscord } from "./utils/inject.js";

const PORT = parseInt(process.env.PORT ?? "8081");

// ── GitHub OAuth state store (in-memory; short-lived) ──────────────────────
// Maps state token → next_url. Consumed on first use to prevent replay.
const oauthStates = new Map<string, string>();

// ── NightOwl task status store (in-memory) ─────────────────────────────────
// Maps task_id → { done: boolean, createdAt: number }. Expires after 24h.
const nightowlTasks = new Map<string, { done: boolean; createdAt: number }>();
const NIGHTOWL_TASK_TTL_MS = 24 * 60 * 60 * 1000;

function nightowlCleanup(): void {
  const now = Date.now();
  for (const [id, entry] of nightowlTasks.entries()) {
    if (now - entry.createdAt > NIGHTOWL_TASK_TTL_MS) {
      nightowlTasks.delete(id);
    }
  }
}

function parseCookieValue(header: string, name: string): string {
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(name + "=")) {
      return trimmed.slice(name.length + 1).trim();
    }
  }
  return "";
}

function signCookie(username: string): string {
  const secret = process.env.COOKIE_SECRET ?? "";
  if (!secret) throw new Error("COOKIE_SECRET not set");
  const sig = createHmac("sha256", secret).update(username).digest("hex");
  return `${username}.${sig}`;
}

function isSafeRedirect(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return (
      parsed.protocol === "https:" &&
      (host === "clung.us" || host.endsWith(".clung.us"))
    );
  } catch {
    return false;
  }
}

const MAX_BODY_BYTES = 1 * 1024 * 1024;

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let tooLarge = false;
    req.on("data", (c: Buffer) => {
      total += c.length;
      if (total > MAX_BODY_BYTES) {
        tooLarge = true;
        // Drain remaining data without storing; let the stream finish cleanly
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (tooLarge) {
        const err = new Error(`Request body too large (>${MAX_BODY_BYTES} bytes)`) as NodeJS.ErrnoException;
        err.code = "BODY_TOO_LARGE";
        reject(err);
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

async function handleGithubCallback(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL
): Promise<void> {
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";

  // Validate state — CSRF check via in-memory store with cookie fallback
  let nextUrl: string | undefined = oauthStates.get(state);
  if (nextUrl !== undefined) {
    oauthStates.delete(state);
  } else {
    // Fallback: service may have restarted; check cookie
    const cookieHeader = req.headers["cookie"] ?? "";
    const cookieState = parseCookieValue(cookieHeader, "gh_oauth_state");
    if (cookieState && cookieState === state) {
      nextUrl = "";
      console.log(
        "[auth] OAuth state validated via cookie fallback (in-memory store empty — service may have restarted)"
      );
    } else {
      res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<!DOCTYPE html><html><body><h1>Invalid OAuth state — please try again.</h1></body></html>"
      );
      return;
    }
  }

  if (!code) {
    res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      "<!DOCTYPE html><html><body><h1>Missing OAuth code.</h1></body></html>"
    );
    return;
  }

  const clientId = process.env.GITHUB_CLIENT_ID ?? "";
  const clientSecret = process.env.GITHUB_CLIENT_SECRET ?? "";

  let username: string;
  try {
    // Exchange code for access token
    const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "BigClungus",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: "https://clung.us/auth/callback",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const tokenData = (await tokenResp.json()) as Record<string, string>;
    const accessToken = tokenData["access_token"] ?? "";
    if (!accessToken) {
      res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<!DOCTYPE html><html><body><h1>Failed to obtain GitHub access token.</h1></body></html>"
      );
      return;
    }

    // Fetch GitHub username
    const userResp = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/json",
        "User-Agent": "BigClungus",
      },
      signal: AbortSignal.timeout(10_000),
    });
    const userData = (await userResp.json()) as Record<string, string>;
    username = userData["login"] ?? "";
  } catch (e) {
    console.error("[auth] GitHub OAuth error:", e);
    res.writeHead(502, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!DOCTYPE html><html><body><h1>GitHub OAuth error: ${e}</h1></body></html>`
    );
    return;
  }

  if (!username) {
    res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      "<!DOCTYPE html><html><body><h1>Could not determine GitHub username.</h1></body></html>"
    );
    return;
  }

  // Check allowlist
  const allowedRaw = process.env.GITHUB_ALLOWED_USERS ?? "";
  const allowed = new Set(
    allowedRaw
      .split(",")
      .map((u) => u.trim().toLowerCase())
      .filter(Boolean)
  );
  if (allowed.size > 0 && !allowed.has(username.toLowerCase())) {
    res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!DOCTYPE html><html><body><h1>GitHub user '${username}' is not allowed.</h1></body></html>`
    );
    return;
  }

  // Sign cookie and redirect
  const cookieValue = signCookie(username);
  const redirectTo = isSafeRedirect(nextUrl ?? "") ? (nextUrl as string) : "/";
  const COOKIE_MAX_AGE = 86400; // 24 hours
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>body{background:#0a0a0f;color:#4ecca3;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style>
</head>
<body><div>authenticated — redirecting...</div>
<script>window.location.replace(${JSON.stringify(redirectTo)});</script>
</body>
</html>`;
  const body = Buffer.from(html, "utf-8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length,
    "Set-Cookie": [
      `tauth_github=${cookieValue}; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax; Domain=.clung.us; Path=/`,
      "gh_oauth_state=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/",
    ],
  });
  res.end(body);
}

async function handleGithubWebhook(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  let body: Buffer;
  try {
    body = await readBody(req);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "BODY_TOO_LARGE") {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "request body too large" }));
      return;
    }
    throw e;
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
  const sigHeader = (req.headers["x-hub-signature-256"] as string) ?? "";
  const expected =
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  let sigValid = false;
  try {
    sigValid = timingSafeEqual(
      Buffer.from(sigHeader),
      Buffer.from(expected)
    );
  } catch {
    // Buffer length mismatch — invalid sig
  }
  if (!sigValid) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid signature" }));
    return;
  }

  // 3. Parse event
  const eventType = (req.headers["x-github-event"] as string) ?? "";
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body.toString("utf-8")) as Record<string, unknown>;
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `invalid JSON: ${e}` }));
    return;
  }

  const action = (payload["action"] as string) ?? "";
  const repo =
    ((payload["repository"] as Record<string, unknown>)?.[
      "full_name"
    ] as string) ?? "";

  // 4. Handle ping immediately
  if (eventType === "ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        zen: (payload["zen"] as string) ?? "",
      })
    );
    return;
  }

  // 5. Dispatch to Temporal (fire-and-forget) — always return 200 fast
  res.writeHead(200, { "Content-Type": "application/json" });

  try {
    if (eventType === "issues" && action === "opened") {
      const issue = (payload["issue"] as Record<string, unknown>) ?? {};
      void startGithubWebhookWorkflow({
        event_type: "issues",
        action: "opened",
        repo,
        number: (issue["number"] as number) ?? 0,
        title: (issue["title"] as string) ?? "",
        url: (issue["html_url"] as string) ?? "",
        user: ((issue["user"] as Record<string, string>)?.["login"]) ?? "",
      });
      res.end(JSON.stringify({ ok: true, action: "workflow_started" }));
    } else if (eventType === "issue_comment" && action === "created") {
      const comment = (payload["comment"] as Record<string, unknown>) ?? {};
      const commenter =
        ((comment["user"] as Record<string, string>)?.["login"]) ?? "";
      // Skip ack for our own bot comments to avoid comment loops
      if (commenter.toLowerCase() === "bigclungus") {
        res.end(JSON.stringify({ ok: true, action: "ignored (own comment)" }));
        return;
      }
      const issue = (payload["issue"] as Record<string, unknown>) ?? {};
      void startGithubWebhookWorkflow({
        event_type: "issue_comment",
        action: "created",
        repo,
        number: (issue["number"] as number) ?? 0,
        title: (issue["title"] as string) ?? "",
        url: (comment["html_url"] as string) ?? "",
        user: commenter,
      });
      res.end(JSON.stringify({ ok: true, action: "workflow_started" }));
    } else if (eventType === "pull_request" && action === "opened") {
      const pr = (payload["pull_request"] as Record<string, unknown>) ?? {};
      void startGithubWebhookWorkflow({
        event_type: "pull_request",
        action: "opened",
        repo,
        number: (pr["number"] as number) ?? 0,
        title: (pr["title"] as string) ?? "",
        url: (pr["html_url"] as string) ?? "",
        user: ((pr["user"] as Record<string, string>)?.["login"]) ?? "",
      });
      res.end(JSON.stringify({ ok: true, action: "workflow_started" }));
    } else if (eventType === "push") {
      // Post-merge code review — fire-and-forget, don't block webhook response
      const headCommit = payload["head_commit"] as Record<string, unknown> | null;
      const ref = (payload["ref"] as string) ?? "";
      const repositoryData = payload["repository"] as Record<string, unknown> | null;
      const defaultBranch = (repositoryData?.["default_branch"] as string) ?? "main";
      const sha = (headCommit?.["id"] as string) ?? "";
      const pusher = ((payload["pusher"] as Record<string, string>)?.["name"]) ?? "unknown";

      if (sha && headCommit) {
        void runPostMergeReview({ repo, sha, ref, pusher, defaultBranch }).catch((e) => {
          console.error(`[post-merge-review] uncaught error for ${repo}@${sha}:`, e);
        });
        res.end(JSON.stringify({ ok: true, action: "review_started", sha, ref }));
      } else {
        // push with no head_commit (e.g. branch delete) — ignore
        res.end(JSON.stringify({ ok: true, action: "ignored", event: eventType, reason: "no head_commit" }));
      }
    } else {
      res.end(
        JSON.stringify({
          ok: true,
          action: "ignored",
          event: eventType,
          action_type: action,
        })
      );
    }
  } catch (e) {
    console.error(`[webhook] error handling ${eventType}/${action}:`, e);
    res.end(JSON.stringify({ ok: false, error: String(e) }));
  }
}

async function startGithubWebhookWorkflow(
  params: Record<string, unknown>
): Promise<void> {
  try {
    // Dynamic import to avoid startup failure if temporalio is not installed
    const { Client } = await import("@temporalio/client");
    const temporalHost = process.env.TEMPORAL_HOST ?? "localhost:7233";
    const client = await Client.connect({ address: temporalHost });
    const wfId =
      `github-webhook-${params["event_type"] ?? "unknown"}-` +
      `${String(params["repo"] ?? "").replace("/", "-")}-` +
      `${params["number"] ?? 0}-${Date.now()}`;
    await client.workflow.start("GitHubWebhookWorkflow", {
      args: [params],
      taskQueue: "listings-queue",
      workflowId: wfId,
    });
    console.log(`[webhook] started GitHubWebhookWorkflow id=${wfId}`);
  } catch (e) {
    console.error("[webhook] failed to start GitHubWebhookWorkflow:", e);
    throw e;
  }
}

// ── REST API helpers ───────────────────────────────────────────────────────

const TASKS_DIR_REST = "/mnt/data/bigclungus-meta/tasks";
const TASKS_DB_REST = "/home/clungus/work/bigclungus-meta/tasks.db";
const AGENTS_DB_REST = "/mnt/data/data/agents.db";
const SESSIONS_DIR_REST = "/mnt/data/hello-world/sessions";
const AGENTS_DIR_REST = "/mnt/data/bigclungus-meta/agents";
const WALLET_FILE_REST = "/mnt/data/secrets/eth_wallet";
const WALLET_ADDRESS_FALLBACK = "0x425bC492E43b2a5Eb7E02c9F5dd9c1D2F378f02f";
const BASE_RPC_URL_REST = "https://base-mainnet.public.blastapi.io";

const EMOJI_MAP_REST: Record<string, string> = {
  architect: "🏗️", critic: "🔍", ux: "🎨",
  otto: "🌪️", spengler: "🕰️", chairman: "⚖️",
  wolf: "🐺", hume: "🔬", adelbert: "🗡️",
};
const COLOR_MAP_REST: Record<string, string> = {
  architect: "#f59e0b", critic: "#f87171", ux: "#60a5fa",
  otto: "#a78bfa", spengler: "#94a3b8",
  wolf: "#f97316", hume: "#38bdf8", adelbert: "#e879f9",
};

function getGithubUser(req: http.IncomingMessage): string {
  const cookieSecret = process.env.COOKIE_SECRET ?? "";
  const cookieHeader = req.headers["cookie"] ?? "";
  const raw = parseCookieValue(cookieHeader, "tauth_github");
  if (!raw || !cookieSecret || !raw.includes(".")) return "anonymous";
  const dotIdx = raw.lastIndexOf(".");
  const username = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);
  const expected = createHmac("sha256", cookieSecret).update(username).digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return "anonymous";
  } catch {
    return "anonymous";
  }
  return username || "anonymous";
}

function restIsAuthed(req: http.IncomingMessage): boolean {
  // Allow internal (localhost + token) requests from lab proxies etc.
  if (isInternalRequest(req)) return true;
  const cookieSecret = process.env.COOKIE_SECRET ?? "";
  const allowedRaw = process.env.GITHUB_ALLOWED_USERS ?? "";
  const allowed = new Set(
    allowedRaw.split(",").map((u) => u.trim().toLowerCase()).filter(Boolean)
  );
  const cookieHeader = req.headers["cookie"] ?? "";
  const raw = parseCookieValue(cookieHeader, "tauth_github");
  if (!raw || !cookieSecret || !raw.includes(".")) return false;
  const dotIdx = raw.lastIndexOf(".");
  const username = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);
  const expected = createHmac("sha256", cookieSecret).update(username).digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  } catch {
    return false;
  }
  return allowed.size === 0 || allowed.has(username.toLowerCase());
}

function jsonResponse(res: http.ServerResponse, data: unknown, status = 200): void {
  const body = Buffer.from(JSON.stringify(data, null, 2), "utf-8");
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": body.length,
  });
  res.end(body);
}

// ── Native REST: GET /api/congress/active ──────────────────────────────────

function restServeCongressActive(res: http.ServerResponse): void {
  try {
    const files = readdirSync(SESSIONS_DIR_REST).filter((f) => /^(?:congress|trial|session)-\d+\.json$/.test(f));
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    for (const file of files.sort().reverse()) {
      try {
        const fpath = join(SESSIONS_DIR_REST, file);
        const mtime = statSync(fpath).mtime;
        if (Date.now() - mtime.getTime() > TWO_HOURS_MS) continue; // stale — skip
        const sdata = JSON.parse(readFileSync(fpath, "utf-8")) as Record<string, unknown>;
        if (sdata.status !== "done") {
          const debaters: string[] = [];
          const identities = (sdata.identities as Array<Record<string, unknown>> | undefined) ?? [];
          for (const id of identities) {
            if (id.name) debaters.push(String(id.name));
          }
          jsonResponse(res, { active: true, topic: String(sdata.topic ?? ""), debaters });
          return;
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  jsonResponse(res, { active: false, topic: "", debaters: [] });
}

// ── Native REST: POST /api/discord/persona — persona intercept for BigClungus ─
// Receives [persona: x] Discord messages forwarded by BigClungus, reads the
// persona file, and injects a [persona-invoke] message back to BigClungus via
// the inject endpoint so it has the full persona content pre-loaded.

async function restHandleDiscordPersona(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let data: Record<string, unknown>;
  try {
    const body = await readBody(req);
    data = body.length ? (JSON.parse(body.toString("utf-8")) as Record<string, unknown>) : {};
  } catch (e) {
    const status = (e as NodeJS.ErrnoException).code === "BODY_TOO_LARGE" ? 413 : 400;
    jsonResponse(res, { error: status === 413 ? "request body too large" : `Invalid JSON: ${e}` }, status);
    return;
  }
  const identity = String(data.identity ?? "").trim();
  const question = String(data.question ?? "").trim();
  const chatId = String(data.chat_id ?? "").trim();
  const messageId = String(data.message_id ?? "").trim();

  if (!identity || !question || !chatId) {
    jsonResponse(res, { error: "identity, question, and chat_id are required" }, 400);
    return;
  }

  // Load persona MD file
  const mdPath = join(AGENTS_DIR_REST, `${identity}.md`);
  if (!existsSync(mdPath)) {
    jsonResponse(res, { error: `Persona '${identity}' not found` }, 404);
    return;
  }

  let personaPrompt: string;
  let displayName: string;
  try {
    const content = readFileSync(mdPath, "utf-8");
    // Extract display_name from YAML frontmatter
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    const frontmatterText = frontmatterMatch ? frontmatterMatch[1] : "";
    const displayNameMatch = frontmatterText.match(/^display_name:\s*(.+)$/m);
    displayName = displayNameMatch ? displayNameMatch[1].trim().replace(/^["']|["']$/g, "") : identity;
    // Strip YAML frontmatter — persona prompt is everything after second ---
    const parts = content.split(/^---\s*$/m);
    personaPrompt = parts.slice(2).join("---").trim();
    if (!personaPrompt) personaPrompt = content.trim();
  } catch (e) {
    jsonResponse(res, { error: `Could not read persona '${identity}': ${e}` }, 500);
    return;
  }

  // Inject structured [persona-invoke] message back to BigClungus
  const injectContent = `[persona-invoke] identity=${identity} display_name=${displayName} question=${question}\n\nPERSONA PROMPT:\n${personaPrompt}`;

  try {
    const injectResp = await fetch("http://127.0.0.1:8085/webhooks/bigclungus-main", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: injectContent,
        chat_id: chatId,
        user: "clunger-persona",
        ...(messageId ? { message_id: `persona-${messageId}` } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!injectResp.ok) {
      const errText = await injectResp.text();
      jsonResponse(res, { error: `Inject failed: ${injectResp.status} ${errText}` }, 502);
      return;
    }
  } catch (e) {
    jsonResponse(res, { error: `Inject request failed: ${e}` }, 502);
    return;
  }

  jsonResponse(res, { ok: true, identity, display_name: displayName, injected: true });
}

// ── Native REST: POST /api/invoke-persona ───────────────────────────────────

async function restInvokePersona(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let data: Record<string, unknown>;
  try {
    const body = await readBody(req);
    data = body.length ? (JSON.parse(body.toString("utf-8")) as Record<string, unknown>) : {};
  } catch (e) {
    const status = (e as NodeJS.ErrnoException).code === "BODY_TOO_LARGE" ? 413 : 400;
    jsonResponse(res, { error: status === 413 ? "request body too large" : `Invalid JSON: ${e}` }, status);
    return;
  }
  const name = String(data.name ?? "").trim();
  const prompt = String(data.prompt ?? "").trim();
  if (!name || !prompt) {
    jsonResponse(res, { error: "name and prompt are required" }, 400);
    return;
  }
  const tileX = data.tile_x != null ? parseInt(String(data.tile_x), 10) : null;
  const tileY = data.tile_y != null ? parseInt(String(data.tile_y), 10) : null;
  const location = data.location != null ? String(data.location).slice(0, 100) : null;
  // Load persona MD file
  const mdPath = join(AGENTS_DIR_REST, `${name}.md`);
  if (!existsSync(mdPath)) {
    jsonResponse(res, { error: `Persona '${name}' not found` }, 404);
    return;
  }
  let systemPrompt: string;
  try {
    const content = readFileSync(mdPath, "utf-8");
    // Strip YAML frontmatter — persona prompt is everything after second ---
    const parts = content.split(/^---\s*$/m);
    // parts[0] = empty string before first ---, parts[1] = frontmatter, parts[2+] = body
    systemPrompt = parts.slice(2).join("---").trim();
    if (!systemPrompt) systemPrompt = content.trim();
    // Prepend location context if provided
    if (location) {
      systemPrompt = `[Current location: ${location}]\n\n${systemPrompt}`;
    }
  } catch (e) {
    jsonResponse(res, { error: `Could not read persona: ${e}` }, 500);
    return;
  }
  // Invoke claude CLI with persona system prompt (spawnSync is synchronous — no Promise wrapper needed)
  try {
    const proc = spawnSync(
      "/home/clungus/.local/bin/claude",
      ["-p", systemPrompt, "--output-format", "text"],
      { input: prompt, encoding: "utf-8", timeout: 60000 }
    );
    if (proc.status !== 0) {
      throw new Error(`claude CLI exited with code ${proc.status}: ${String(proc.stderr ?? "").slice(0, 300)}`);
    }
    const result = String(proc.stdout ?? "").trim();
    // Log interaction to commons_chat_log
    const githubUser = getGithubUser(req);
    try {
      const db = getTracesDb();
      try {
        db.run(
          `INSERT INTO commons_chat_log (github_user, persona_name, user_prompt, persona_response, tile_x, tile_y, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [githubUser, name, prompt, result, tileX ?? null, tileY ?? null, Date.now()]
        );
      } finally {
        db.close();
      }
    } catch (logErr) {
      console.error("[restInvokePersona] chat log insert failed:", logErr);
    }
    jsonResponse(res, { response: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[restInvokePersona] error:", msg);
    jsonResponse(res, { error: "Persona failed to respond", reason: msg }, 503);
  }
}

// ── agents.db write helpers ────────────────────────────────────────────────────

/** Ensure agents table has all expected columns (adds description if missing). */
function ensureAgentsSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id                 TEXT PRIMARY KEY,
      task_id            TEXT,
      session_id         TEXT,
      started_at         INTEGER,
      completed_at       INTEGER,
      status             TEXT DEFAULT 'running',
      input_tokens       INTEGER DEFAULT 0,
      output_tokens      INTEGER DEFAULT 0,
      cost_usd           REAL DEFAULT 0.0,
      model              TEXT,
      output_file        TEXT,
      description        TEXT,
      failure_reason     TEXT,
      parent_agent_id    TEXT,
      last_heartbeat_at  INTEGER,
      duration_ms        INTEGER,
      trace_id           TEXT,
      cache_read_tokens  INTEGER DEFAULT 0,
      exit_reason        TEXT,
      error_message      TEXT,
      tool_calls_count   INTEGER DEFAULT 0,
      usage_details      TEXT
    )
  `);
  // Add columns if DB existed before they were added
  const alterColumns = [
    "ALTER TABLE agents ADD COLUMN description TEXT",
    "ALTER TABLE agents ADD COLUMN failure_reason TEXT",
    "ALTER TABLE agents ADD COLUMN parent_agent_id TEXT",
    "ALTER TABLE agents ADD COLUMN last_heartbeat_at INTEGER",
    "ALTER TABLE agents ADD COLUMN duration_ms INTEGER",
    "ALTER TABLE agents ADD COLUMN trace_id TEXT",
    "ALTER TABLE agents ADD COLUMN cache_read_tokens INTEGER DEFAULT 0",
    "ALTER TABLE agents ADD COLUMN exit_reason TEXT",
    "ALTER TABLE agents ADD COLUMN error_message TEXT",
    "ALTER TABLE agents ADD COLUMN tool_calls_count INTEGER DEFAULT 0",
    "ALTER TABLE agents ADD COLUMN usage_details TEXT",
  ];
  for (const stmt of alterColumns) {
    try {
      db.run(stmt);
    } catch {
      // column already exists — ignore
    }
  }

  // agent_events table
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id      TEXT NOT NULL,
      event_type    TEXT NOT NULL,
      payload       TEXT,
      created_at    INTEGER DEFAULT (unixepoch('now')),
      event_version INTEGER DEFAULT 1
    )
  `);
  // Add event_version if table existed before it was added
  try {
    db.run("ALTER TABLE agent_events ADD COLUMN event_version INTEGER DEFAULT 1");
  } catch {
    // column already exists — ignore
  }
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_agent_events_agent ON agent_events(agent_id)
  `);
}

// ── agents.db write helper ────────────────────────────────────────────────────

/** Open agents.db for writing, run WAL + schema, execute fn, close. Throws on error. */
function withAgentsDb<T>(fn: (db: Database) => T): T {
  const db = new Database(AGENTS_DB_REST);
  db.run("PRAGMA journal_mode=WAL");
  ensureAgentsSchema(db);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** Parse JSON body; returns null and sends 400 on failure. */
async function parseJsonBody(req: http.IncomingMessage, res: http.ServerResponse): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readBody(req);
    return JSON.parse(raw.toString()) as Record<string, unknown>;
  } catch {
    jsonResponse(res, { error: "invalid JSON body" }, 400);
    return null;
  }
}

/** Handle POST /api/agents/spawn — insert or replace a new agent row. Internal only. */
async function restHandleAgentSpawn(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (!body) return;
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) { jsonResponse(res, { error: "id required" }, 400); return; }
  const description = typeof body.description === "string" ? body.description : null;
  const output_file = typeof body.output_file === "string" ? body.output_file : null;
  const task_id = typeof body.task_id === "string" ? body.task_id : null;
  const parent_agent_id = typeof body.parent_agent_id === "string" ? body.parent_agent_id : null;
  // Accept caller-provided trace_id (for child agents inheriting parent trace) or generate a new one
  const trace_id = typeof body.trace_id === "string" ? body.trace_id : randomBytes(16).toString("hex");
  try {
    withAgentsDb((db) => {
      const started_at = Math.floor(Date.now() / 1000);
      db.run(
        "INSERT OR REPLACE INTO agents (id, description, started_at, status, output_file, task_id, parent_agent_id, trace_id) VALUES (?, ?, ?, 'running', ?, ?, ?, ?)",
        [id, description, started_at, output_file, task_id, parent_agent_id, trace_id]
      );
    });
    jsonResponse(res, { ok: true, trace_id });
  } catch (err) {
    console.error("[agents] spawn write failed:", err);
    jsonResponse(res, { error: String(err) }, 500);
  }
}

/** Handle POST /api/agents/:id/complete — mark an agent completed/failed/stale. Internal only. */
async function restHandleAgentComplete(req: http.IncomingMessage, res: http.ServerResponse, agentId?: string): Promise<void> {
  let body: Record<string, unknown> = {};
  try {
    const raw = await readBody(req);
    if (raw.length > 0) body = JSON.parse(raw.toString()) as Record<string, unknown>;
  } catch {
    jsonResponse(res, { error: "invalid JSON body" }, 400);
    return;
  }
  // ID from URL path takes precedence; fall back to body for backward compat
  const id = agentId ?? (typeof body.id === "string" ? body.id : null);
  if (!id) { jsonResponse(res, { error: "id required" }, 400); return; }
  const status = typeof body.status === "string" ? body.status : "completed";
  // Valid terminal statuses
  const validStatuses = ["completed", "failed", "cancelled", "timeout", "stale"];
  if (!validStatuses.includes(status)) {
    jsonResponse(res, { error: `status must be one of: ${validStatuses.join(", ")}` }, 400);
    return;
  }
  const failure_reason = typeof body.failure_reason === "string" ? body.failure_reason : null;
  const exit_reason = typeof body.exit_reason === "string" ? body.exit_reason : null;
  const error_message = typeof body.error_message === "string" ? body.error_message : null;
  const tool_calls_count = typeof body.tool_calls_count === "number" ? body.tool_calls_count : null;
  const cache_read_tokens = typeof body.cache_read_tokens === "number" ? body.cache_read_tokens : null;
  const input_tokens = typeof body.input_tokens === "number" ? body.input_tokens : null;
  const output_tokens = typeof body.output_tokens === "number" ? body.output_tokens : null;
  const cost_usd = typeof body.cost_usd === "number" ? body.cost_usd : null;
  const usage_details = typeof body.usage_details === "object" && body.usage_details !== null
    ? JSON.stringify(body.usage_details)
    : (typeof body.usage_details === "string" ? body.usage_details : null);
  // Derive exit_reason from status if not explicitly provided
  const resolvedExitReason = exit_reason ?? (status !== "stale" ? status : null);
  try {
    withAgentsDb((db) => {
      const completed_at = Math.floor(Date.now() / 1000);
      const row = db.query<{ started_at: number | null }, [string]>(
        "SELECT started_at FROM agents WHERE id = ?"
      ).get(id);
      const duration_ms = row?.started_at != null ? (completed_at - row.started_at) * 1000 : null;
      db.run(
        `UPDATE agents SET
          status=?, completed_at=?, failure_reason=?, duration_ms=?,
          exit_reason=?, error_message=?,
          tool_calls_count=COALESCE(?, tool_calls_count),
          cache_read_tokens=COALESCE(?, cache_read_tokens),
          input_tokens=COALESCE(?, input_tokens),
          output_tokens=COALESCE(?, output_tokens),
          cost_usd=COALESCE(?, cost_usd),
          usage_details=COALESCE(?, usage_details)
        WHERE id=?`,
        [status, completed_at, failure_reason, duration_ms,
         resolvedExitReason, error_message,
         tool_calls_count, cache_read_tokens,
         input_tokens, output_tokens, cost_usd, usage_details,
         id]
      );
    });
    jsonResponse(res, { ok: true });
  } catch (err) {
    console.error("[agents] complete write failed:", err);
    jsonResponse(res, { error: String(err) }, 500);
  }
}

/** Handle POST /api/agents/:id/heartbeat — update last_heartbeat_at. Internal only. */
function restHandleAgentHeartbeat(res: http.ServerResponse, agentId: string): void {
  try {
    withAgentsDb((db) => {
      db.run("UPDATE agents SET last_heartbeat_at = unixepoch('now') WHERE id = ?", [agentId]);
    });
    jsonResponse(res, { ok: true });
  } catch (err) {
    console.error("[agents] heartbeat write failed:", err);
    jsonResponse(res, { error: String(err) }, 500);
  }
}

/** Handle POST /api/agents/:id/events — insert an event. Internal only. */
async function restHandleAgentEventPost(req: http.IncomingMessage, res: http.ServerResponse, agentId: string): Promise<void> {
  const body = await parseJsonBody(req, res);
  if (!body) return;
  const event_type = typeof body.event_type === "string" ? body.event_type : null;
  if (!event_type) { jsonResponse(res, { error: "event_type required" }, 400); return; }
  const payload = typeof body.payload === "string" ? body.payload : null;
  try {
    withAgentsDb((db) => {
      db.run(
        "INSERT INTO agent_events (agent_id, event_type, payload) VALUES (?, ?, ?)",
        [agentId, event_type, payload]
      );
    });
    jsonResponse(res, { ok: true });
  } catch (err) {
    console.error("[agents] event insert failed:", err);
    jsonResponse(res, { error: String(err) }, 500);
  }
}

/** Handle GET /api/agents/:id/events — return all events for an agent. */
function restHandleAgentEventGet(res: http.ServerResponse, agentId: string): void {
  try {
    const db = new Database(AGENTS_DB_REST, { readonly: true });
    ensureAgentsSchema(db);
    try {
      const rows = db.query<{ id: number; agent_id: string; event_type: string; payload: string | null; created_at: number }, [string]>(
        "SELECT id, agent_id, event_type, payload, created_at FROM agent_events WHERE agent_id = ? ORDER BY created_at ASC"
      ).all(agentId);
      jsonResponse(res, rows);
    } finally {
      db.close();
    }
  } catch (err) {
    console.error("[agents] events query failed:", err);
    jsonResponse(res, { error: String(err) }, 500);
  }
}

// ── agents.db read helpers ────────────────────────────────────────────────────

interface AgentTaskStats {
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
}

/** Load per-task cost+token totals in a single query. Returns empty map if DB unavailable. */
function loadAgentStatsByTask(): Map<string, AgentTaskStats> {
  const stats = new Map<string, AgentTaskStats>();
  if (!existsSync(AGENTS_DB_REST)) return stats;
  try {
    const db = new Database(AGENTS_DB_REST, { readonly: true });
    try {
      const rows = db.query<{ task_id: string; total_cost: number; total_input: number; total_output: number }, []>(
        `SELECT task_id,
           COALESCE(SUM(cost_usd), 0) as total_cost,
           COALESCE(SUM(input_tokens), 0) as total_input,
           COALESCE(SUM(output_tokens), 0) as total_output
         FROM agents GROUP BY task_id`
      ).all();
      for (const row of rows) {
        if (row.task_id) stats.set(row.task_id, { cost_usd: row.total_cost ?? 0, input_tokens: row.total_input ?? 0, output_tokens: row.total_output ?? 0 });
      }
    } finally {
      db.close();
    }
  } catch (err) {
    console.warn(`[agents.db] Stats query failed: ${err}`);
  }
  return stats;
}

/** Query agents.db with a read-only query. Returns [] if DB unavailable. */
function queryAgentsDb<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  if (!existsSync(AGENTS_DB_REST)) return [];
  try {
    const db = new Database(AGENTS_DB_REST, { readonly: true });
    try {
      return db.query<T, unknown[]>(sql).all(...params);
    } finally {
      db.close();
    }
  } catch (err) {
    console.warn(`[agents.db] Query failed: ${err}`);
    return [];
  }
}

/** Load agent runs for a specific task from agents.db. Returns [] if DB unavailable. */
function loadAgentRunsForTask(taskId: string): unknown[] {
  return queryAgentsDb("SELECT * FROM agents WHERE task_id = ? ORDER BY started_at ASC", [taskId]);
}

/** Load recent agents from agents.db (last 2 hours, all statuses). Returns [] if DB unavailable.
 * Only returns real agent spawns (output_file IS NOT NULL) — migrated task rows have no output_file. */
function loadRecentAgentsFromDb(): unknown[] {
  const twoHoursAgo = Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000);
  return queryAgentsDb(
    "SELECT * FROM agents WHERE output_file IS NOT NULL AND output_file != '' AND (started_at >= ? OR status IN ('running', 'in_progress')) ORDER BY started_at DESC",
    [twoHoursAgo]
  );
}

function restServeTasks(res: http.ServerResponse, query: URLSearchParams): void {
  const pageRaw = parseInt(query.get("page") ?? "1", 10);
  const limitRaw = parseInt(query.get("limit") ?? "50", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw >= 1 && limitRaw <= 500 ? limitRaw : 50;

  // sort: "recent" (default) | "oldest" | "expensive" | "longest"
  const sortParam = query.get("sort") ?? "recent";
  const VALID_SORTS = new Set(["recent", "oldest", "expensive", "longest"]);
  const sort = VALID_SORTS.has(sortParam) ? sortParam : "recent";

  // search: filter by title text (case-insensitive substring match)
  const searchRaw = (query.get("search") ?? "").trim().toLowerCase();

  // Load cost and token totals from agents.db (best-effort; empty map if unavailable)
  const agentStats = loadAgentStatsByTask();

  const tasks: unknown[] = [];

  // Try tasks.db first
  let usedSqlite = false;
  if (existsSync(TASKS_DB_REST)) {
    try {
      const db = new Database(TASKS_DB_REST, { readonly: true });
      try {
        const rows = db.query<{ id: string; status: string | null; created_at: string | null; updated_at: string | null; data: string }, []>(
          "SELECT id, status, created_at, updated_at, data FROM tasks ORDER BY created_at DESC"
        ).all();
        for (const row of rows) {
          try {
            const task = JSON.parse(row.data) as Record<string, unknown>;
            // Column status is authoritative — override stale blob value
            if (row.status) task.status = row.status;
            // Derive started_at / finished_at / summary from log (mirrors JSON fallback logic)
            const log = Array.isArray(task.log) ? task.log as Array<Record<string, string>> : [];
            if (log.length > 0) {
              if (!task.started_at) {
                for (const entry of log) {
                  if (entry.event === "started") { task.started_at = entry.ts ?? ""; break; }
                }
              }
              if (!task.finished_at) {
                for (let i = log.length - 1; i >= 0; i--) {
                  if (log[i].event !== "started") { task.finished_at = log[i].ts ?? ""; break; }
                }
              }
              if (!task.summary) {
                for (let i = log.length - 1; i >= 0; i--) {
                  if (log[i].event !== "started" && log[i].context) {
                    task.summary = log[i].context ?? ""; break;
                  }
                }
              }
            }
            // Fall back to DB row timestamps if log derivation yielded nothing
            if (!task.started_at && row.created_at) task.started_at = row.created_at;
            if (!task.finished_at && row.updated_at) task.finished_at = row.updated_at;
            // Prefer cost/token data already in the blob (written by finalize_task).
            // Fall back to agents.db aggregates only if blob has nothing.
            const taskKey = String(task.id ?? row.id);
            const s = agentStats.get(taskKey);
            if (!task.cost_usd && !task.input_tokens && !task.output_tokens) {
              task.cost_usd = s?.cost_usd ?? 0;
              task.input_tokens = s?.input_tokens ?? 0;
              task.output_tokens = s?.output_tokens ?? 0;
            }
            tasks.push(task);
          } catch { /* skip malformed */ }
        }
        usedSqlite = true;
      } finally {
        db.close();
      }
    } catch (err) {
      console.error(`[restServeTasks] SQLite failed, falling back to JSON: ${err}`);
    }
  }

  // Fall back to JSON files if SQLite unavailable
  if (!usedSqlite) {
    try {
      const files = readdirSync(TASKS_DIR_REST).filter((f) => f.endsWith(".json") && f !== ".gitkeep");
      for (const fname of files) {
        try {
          const raw = readFileSync(join(TASKS_DIR_REST, fname), "utf-8");
          const task = JSON.parse(raw) as Record<string, unknown>;
          // Derive status/started_at/finished_at/summary from log array
          const log = Array.isArray(task.log) ? task.log as Array<Record<string, string>> : [];
          if (log.length > 0) {
            const lastEvent = log[log.length - 1];
            const ev = lastEvent.event ?? "";
            const statusMap: Record<string, string> = {
              started: "in_progress", milestone: "in_progress", user_feedback: "in_progress",
              blocked: "in_progress", done: "done", stale: "stale", failed: "failed",
            };
            task.status = statusMap[ev] ?? ev;
            for (const entry of log) {
              if (entry.event === "started") { task.started_at = entry.ts ?? ""; break; }
            }
            for (let i = log.length - 1; i >= 0; i--) {
              if (log[i].event !== "started") { task.finished_at = log[i].ts ?? ""; break; }
            }
            for (let i = log.length - 1; i >= 0; i--) {
              if (log[i].event !== "started" && log[i].context) {
                task.summary = log[i].context ?? ""; break;
              }
            }
          }
          const taskKey2 = String(task.id ?? "");
          const s2 = agentStats.get(taskKey2);
          task.cost_usd = s2?.cost_usd ?? 0;
          task.input_tokens = s2?.input_tokens ?? 0;
          task.output_tokens = s2?.output_tokens ?? 0;
          tasks.push(task);
        } catch { /* skip malformed file */ }
      }
    } catch { /* directory unreadable */ }
  }

  // Apply search filter (against title and first log context / prompt)
  const filtered = searchRaw
    ? tasks.filter((t) => {
        const task = t as Record<string, unknown>;
        const title = String(task.title ?? "").toLowerCase();
        if (title.includes(searchRaw)) return true;
        // Also search the started log entry's context (the original prompt)
        const log = Array.isArray(task.log) ? task.log as Array<Record<string, string>> : [];
        for (const entry of log) {
          if (entry.event === "started" && String(entry.context ?? "").toLowerCase().includes(searchRaw)) return true;
        }
        return false;
      })
    : tasks;

  // Apply sort
  filtered.sort((a, b) => {
    const ta = a as Record<string, unknown>;
    const tb = b as Record<string, unknown>;
    if (sort === "oldest") {
      const sa = String(ta.started_at ?? "");
      const sb = String(tb.started_at ?? "");
      return sa.localeCompare(sb);
    }
    if (sort === "expensive") {
      const ca = typeof ta.cost_usd === "number" ? ta.cost_usd : 0;
      const cb = typeof tb.cost_usd === "number" ? tb.cost_usd : 0;
      return cb - ca;
    }
    if (sort === "longest") {
      const durationMs = (task: Record<string, unknown>): number => {
        const started = String(task.started_at ?? "");
        const finished = String(task.finished_at ?? "");
        if (!started) return 0;
        const s = new Date(started).getTime();
        const f = finished ? new Date(finished).getTime() : Date.now();
        return isNaN(s) || isNaN(f) ? 0 : Math.max(0, f - s);
      };
      return durationMs(tb) - durationMs(ta);
    }
    // Default: "recent" — status priority (running/in_progress > open/stale > done/failed/closed), then newest first within group
    const statusPriority = (task: Record<string, unknown>): number => {
      const s = String(task.status ?? "");
      if (s === "running" || s === "in_progress") return 0;
      if (s === "open" || s === "stale") return 1;
      return 2; // done, failed, closed, anything else
    };
    const pa = statusPriority(ta);
    const pb = statusPriority(tb);
    if (pa !== pb) return pa - pb;
    const sa = String(ta.created_at ?? ta.started_at ?? "");
    const sb = String(tb.created_at ?? tb.started_at ?? "");
    return sb.localeCompare(sa);
  });

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, pages);
  const offset = (safePage - 1) * limit;
  const paginated = filtered.slice(offset, offset + limit);

  // Compute per-status totals from the filtered dataset (not the paginated slice)
  const totals = { total, in_progress: 0, done: 0, stale: 0, failed: 0, background: 0, foreground: 0, total_cost_usd: 0, total_input_tokens: 0, total_output_tokens: 0 };
  for (const t of filtered) {
    const task = t as Record<string, unknown>;
    const s = String(task.status ?? "stale");
    if (s === "in_progress") totals.in_progress++;
    else if (s === "done") totals.done++;
    else if (s === "failed") totals.failed++;
    else totals.stale++;
    if (task.run_in_background === true) totals.background++;
    else totals.foreground++;
    if (typeof task.cost_usd === "number") totals.total_cost_usd += task.cost_usd;
    if (typeof task.input_tokens === "number") totals.total_input_tokens += task.input_tokens;
    if (typeof task.output_tokens === "number") totals.total_output_tokens += task.output_tokens;
  }

  jsonResponse(res, { tasks: paginated, total, page: safePage, limit, pages, totals });
}

function restServeTaskDetail(res: http.ServerResponse, taskId: string): void {
  if (!taskId || !/^[a-zA-Z0-9_-]+$/.test(taskId)) {
    jsonResponse(res, { error: "Invalid task ID" }, 400);
    return;
  }

  // Load task from SQLite
  let taskData: Record<string, unknown> | null = null;
  if (existsSync(TASKS_DB_REST)) {
    try {
      const db = new Database(TASKS_DB_REST, { readonly: true });
      try {
        const row = db.query<{ id: string; data: string }, [string]>(
          "SELECT id, data FROM tasks WHERE id = ?"
        ).get(taskId);
        if (row) {
          taskData = JSON.parse(row.data) as Record<string, unknown>;
        }
      } finally {
        db.close();
      }
    } catch (err) {
      console.error(`[restServeTaskDetail] SQLite error: ${err}`);
    }
  }

  // Fall back to JSON file
  if (!taskData) {
    const fpath = join(TASKS_DIR_REST, `${taskId}.json`);
    if (existsSync(fpath)) {
      try {
        taskData = JSON.parse(readFileSync(fpath, "utf-8")) as Record<string, unknown>;
      } catch { /* fall through */ }
    }
  }

  if (!taskData) {
    jsonResponse(res, { error: "Task not found" }, 404);
    return;
  }

  // Load events from tasks.db
  let events: unknown[] = [];
  if (existsSync(TASKS_DB_REST)) {
    try {
      const db = new Database(TASKS_DB_REST, { readonly: true });
      try {
        events = db.query<Record<string, unknown>, [string]>(
          "SELECT * FROM task_events WHERE task_id = ? ORDER BY ts ASC"
        ).all(taskId);
      } finally {
        db.close();
      }
    } catch (err) {
      console.warn(`[restServeTaskDetail] Events query failed: ${err}`);
    }
  }

  // Load agent runs from agents.db
  const agentRuns = loadAgentRunsForTask(taskId);

  // Attach cost_usd from agent runs
  const totalCost = (agentRuns as Array<Record<string, unknown>>).reduce(
    (sum, a) => sum + (typeof a.cost_usd === "number" ? a.cost_usd : 0), 0
  );
  taskData.cost_usd = totalCost;

  jsonResponse(res, { task: taskData, events, agent_runs: agentRuns });
}

// ── Task stats: cost by day + aggregate totals ────────────────────────────────
function restServeTaskStats(res: http.ServerResponse): void {
  if (!existsSync(TASKS_DB_REST)) {
    jsonResponse(res, { error: "tasks.db not found" }, 503);
    return;
  }
  try {
    const db = new Database(TASKS_DB_REST, { readonly: true });
    try {
      // Aggregate totals across ALL tasks
      const rows = db.query<{ data: string }, []>("SELECT data FROM tasks").all();

      let total_cost_usd = 0;
      let total_input_tokens = 0;
      let total_output_tokens = 0;
      const task_counts: Record<string, number> = {};
      // cost_by_day accumulator: date string → cost
      const dayMap: Map<string, number> = new Map();

      for (const row of rows) {
        let task: Record<string, unknown>;
        try { task = JSON.parse(row.data) as Record<string, unknown>; } catch { continue; }

        const status = String(task.status ?? "stale");
        task_counts[status] = (task_counts[status] ?? 0) + 1;

        const cost = typeof task.cost_usd === "number" ? task.cost_usd : 0;
        const inTok = typeof task.input_tokens === "number" ? task.input_tokens : 0;
        const outTok = typeof task.output_tokens === "number" ? task.output_tokens : 0;

        total_cost_usd += cost;
        total_input_tokens += inTok;
        total_output_tokens += outTok;

        // Bucket cost by day using started_at or log[0].ts
        if (cost > 0) {
          let ts: string | null = null;
          if (typeof task.started_at === "string" && task.started_at) {
            ts = task.started_at;
          } else {
            const log = Array.isArray(task.log) ? task.log as Array<Record<string, string>> : [];
            for (const entry of log) {
              if (entry.event === "started" && entry.ts) { ts = entry.ts; break; }
            }
          }
          if (ts) {
            const dateStr = ts.slice(0, 10); // "YYYY-MM-DD"
            dayMap.set(dateStr, (dayMap.get(dateStr) ?? 0) + cost);
          }
        }
      }

      // Build cost_by_day for last 7 days
      const cost_by_day: Array<{ date: string; cost: number }> = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        cost_by_day.push({ date: dateStr, cost: dayMap.get(dateStr) ?? 0 });
      }

      jsonResponse(res, {
        total_cost_usd,
        total_input_tokens,
        total_output_tokens,
        task_counts,
        cost_by_day,
      });
    } finally {
      db.close();
    }
  } catch (err) {
    jsonResponse(res, { error: `stats query failed: ${err}` }, 500);
  }
}

// ── Cockpit: known service allowlist ──────────────────────────────────────────
const COCKPIT_SERVICES = [
  "claude-bot.service",
  "clunger.service",
  "cloudflared.service",
  "omni-gateway.service",
  "terminal-server.service",
  "temporal.service",
  "temporal-worker.service",
  "grok-proxy.service",
  "gigaclungus.service",
];

// ── Cockpit: GET /api/cockpit/status ─────────────────────────────────────────
function restCockpitStatus(res: http.ServerResponse): void {
  const results: unknown[] = [];
  for (const fullName of COCKPIT_SERVICES) {
    const r = spawnSync("systemctl", [
      "--user", "show", fullName,
      "--property=ActiveState,SubState,Description,NRestarts,ExecMainStartTimestamp,MemoryCurrent",
    ], { encoding: "utf-8", timeout: 5000 });
    const out = r.stdout ?? "";
    const props: Record<string, string> = {};
    for (const line of out.split("\n")) {
      const eq = line.indexOf("=");
      if (eq !== -1) props[line.slice(0, eq)] = line.slice(eq + 1).trim();
    }
    const state = props["ActiveState"] ?? "unknown";
    const sub = props["SubState"] ?? "unknown";
    const description = props["Description"] ?? "";
    let uptime_sec: number | null = null;
    const tsRaw = props["ExecMainStartTimestamp"] ?? "";
    if (tsRaw && tsRaw !== "0" && !tsRaw.startsWith("n/a")) {
      const started = new Date(tsRaw);
      if (!isNaN(started.getTime())) {
        uptime_sec = Math.floor((Date.now() - started.getTime()) / 1000);
      }
    }
    const restarts = parseInt(props["NRestarts"] ?? "0", 10);
    const memRaw = parseInt(props["MemoryCurrent"] ?? "0", 10);
    const memory_mb = isNaN(memRaw) || memRaw <= 0 ? null : Math.round(memRaw / (1024 * 1024) * 10) / 10;
    results.push({ name: fullName, state, sub, description, uptime_sec, restarts, memory_mb });
  }
  jsonResponse(res, results);
}

// ── Cockpit: GET /api/cockpit/logs/:service ───────────────────────────────────
function restCockpitLogs(res: http.ServerResponse, service: string): void {
  if (!COCKPIT_SERVICES.includes(service)) {
    jsonResponse(res, { error: "service not in allowlist" }, 400);
    return;
  }
  const r = spawnSync("journalctl", [
    "--user", "-u", service, "-n", "50", "--no-pager", "--output=short-iso",
  ], { encoding: "utf-8", timeout: 10000 });
  if (r.error) {
    jsonResponse(res, { error: String(r.error) }, 500);
    return;
  }
  jsonResponse(res, { service, logs: r.stdout ?? "" });
}

// ── Cockpit: POST /api/cockpit/restart ────────────────────────────────────────
async function restCockpitRestart(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body: { service?: string } = {};
  try {
    body = JSON.parse((await readBody(req)).toString("utf-8")) as { service?: string };
  } catch {
    jsonResponse(res, { error: "invalid JSON" }, 400);
    return;
  }
  const service = (body.service ?? "").trim();
  if (!service) {
    jsonResponse(res, { error: "service is required" }, 400);
    return;
  }
  if (!COCKPIT_SERVICES.includes(service)) {
    jsonResponse(res, { error: "service not in allowlist" }, 403);
    return;
  }
  const r = spawnSync("systemctl", ["--user", "restart", service], {
    encoding: "utf-8",
    timeout: 30000,
  });
  if (r.status !== 0) {
    jsonResponse(res, { error: r.stderr || `exit code ${r.status ?? "?"}` }, 500);
    return;
  }
  jsonResponse(res, { ok: true, service });
}

// ── Cockpit: CPU background sampler ──────────────────────────────────────────
// Reads /proc/stat twice 500ms apart without blocking the event loop.
// The handler just reads the cached value.
type CpuStat = { user: number; nice: number; system: number; idle: number; total: number };
function parseCpuStat(): CpuStat | null {
  try {
    const raw = readFileSync("/proc/stat", "utf-8");
    const line = raw.split("\n").find(l => l.startsWith("cpu "));
    if (!line) return null;
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    const [user, nice, system, idle] = parts;
    const total = parts.reduce((a, b) => a + b, 0);
    return { user, nice, system, idle, total };
  } catch {
    return null;
  }
}
let cachedCpuPct = 0;
let lastCpuStat: CpuStat | null = parseCpuStat();
setInterval(() => {
  const t2 = parseCpuStat();
  if (lastCpuStat && t2) {
    const deltaTotal = t2.total - lastCpuStat.total;
    const deltaIdle = t2.idle - lastCpuStat.idle;
    if (deltaTotal > 0) cachedCpuPct = Math.round(((deltaTotal - deltaIdle) / deltaTotal) * 1000) / 10;
  }
  lastCpuStat = t2;
}, 500);

// Mem / disk / net — cached every 5 s (slow enough to not thrash, fast enough for cockpit)
interface CachedSysMetrics {
  ram_total_mb: number;
  ram_used_mb: number;
  ram_free_mb: number;
  disks: { path: string; used: string; total: string; pct: number }[];
  net: { rx_bytes: number; tx_bytes: number };
}
let cachedSysMetrics: CachedSysMetrics = { ram_total_mb: 0, ram_used_mb: 0, ram_free_mb: 0, disks: [], net: { rx_bytes: 0, tx_bytes: 0 } };
function refreshSysMetrics(): void {
  try {
    const memInfo: Record<string, number> = {};
    for (const line of readFileSync("/proc/meminfo", "utf-8").split("\n")) {
      const m = line.match(/^(\w+):\s+(\d+)/);
      if (m) memInfo[m[1]] = parseInt(m[2], 10);
    }
    const ram_total_mb = Math.round((memInfo["MemTotal"] ?? 0) / 1024);
    const ram_available_mb = Math.round((memInfo["MemAvailable"] ?? 0) / 1024);
    const disks: CachedSysMetrics["disks"] = [];
    const dfR = spawnSync("df", ["-h", "/", "/mnt/data"], { encoding: "utf-8", timeout: 5000 });
    for (const line of (dfR.stdout ?? "").split("\n").slice(1)) {
      if (!line.trim()) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) continue;
      const [, total, used, , pctStr, path] = parts;
      disks.push({ path, used, total, pct: parseInt(pctStr, 10) || 0 });
    }
    let rx_bytes = 0, tx_bytes = 0;
    for (const line of readFileSync("/proc/net/dev", "utf-8").split("\n")) {
      const t = line.trim();
      if (t.startsWith("eth0:") || t.startsWith("ens3:") || t.startsWith("ens4:")) {
        const parts = t.split(/\s+/);
        rx_bytes = parseInt(parts[1], 10) || 0;
        tx_bytes = parseInt(parts[9], 10) || 0;
        break;
      }
    }
    cachedSysMetrics = { ram_total_mb, ram_used_mb: ram_total_mb - ram_available_mb, ram_free_mb: Math.round((memInfo["MemFree"] ?? 0) / 1024), disks, net: { rx_bytes, tx_bytes } };
  } catch { /* keep stale cache */ }
}
refreshSysMetrics();
setInterval(refreshSysMetrics, 5000);

// Containers — cached every 60 s (docker ps is slow; containers rarely change)
interface CachedContainer { id: string; name: string; image: string; status: string; state: string }
let cachedContainers: CachedContainer[] | null = null;
let cachedContainersError: string | null = null;
function refreshContainers(): void {
  const r = spawnSync("docker", ["ps", "-a", "--format", "{{json .}}"], { encoding: "utf-8", timeout: 10000 });
  if (r.error) { cachedContainersError = String(r.error); return; }
  cachedContainersError = null;
  const containers: CachedContainer[] = [];
  for (const line of (r.stdout ?? "").split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as Record<string, string>;
      containers.push({ id: obj["ID"] ?? obj["Id"] ?? "", name: obj["Names"] ?? obj["Name"] ?? "", image: obj["Image"] ?? "", status: obj["Status"] ?? "", state: obj["State"] ?? "" });
    } catch { /* skip malformed lines */ }
  }
  cachedContainers = containers;
}
refreshContainers();
setInterval(refreshContainers, 60000);

// ── Cockpit: GET /api/cockpit/metrics ────────────────────────────────────────
function restCockpitMetrics(res: http.ServerResponse): void {
  const { ram_total_mb, ram_used_mb, ram_free_mb, disks, net } = cachedSysMetrics;
  jsonResponse(res, { cpu_pct: cachedCpuPct, ram_total_mb, ram_used_mb, ram_free_mb, disks, net });
}

// ── Cockpit: GET /api/cockpit/containers ──────────────────────────────────────
function restCockpitContainers(res: http.ServerResponse): void {
  if (cachedContainersError !== null) {
    jsonResponse(res, { error: cachedContainersError }, 500);
    return;
  }
  jsonResponse(res, cachedContainers ?? []);
}

// ── Cockpit: GET /api/cockpit/schedules ───────────────────────────────────────
interface CachedSchedule { scheduleId: string; nextRunTime: string | null; state: string | null }
let cachedSchedules: CachedSchedule[] | null = null;
let cachedSchedulesError: string | null = null;
function refreshSchedules(): void {
  const r = spawnSync(
    "temporal",
    ["schedule", "list", "--namespace", "default", "--output", "json"],
    { encoding: "utf-8", timeout: 5000 }
  );
  if (r.error) { cachedSchedulesError = String(r.error); return; }
  if (r.status !== 0) { cachedSchedulesError = r.stderr?.trim() || `exit ${String(r.status)}`; return; }
  cachedSchedulesError = null;
  const schedules: CachedSchedule[] = [];
  try {
    const parsed: unknown = JSON.parse(r.stdout ?? "[]");
    const items = Array.isArray(parsed) ? parsed : [];
    for (const item of items as Record<string, unknown>[]) {
      const id = (item["scheduleId"] as string | undefined) ?? (item["id"] as string | undefined) ?? "";
      const info = (item["info"] as Record<string, unknown> | undefined) ?? {};
      const nextRuns = info["nextActionTimes"] as string[] | undefined;
      const nextRunTime = (nextRuns && nextRuns.length > 0) ? nextRuns[0] : null;
      const state = (info["state"] as Record<string, unknown> | undefined)?.["notes"] as string | null ?? null;
      schedules.push({ scheduleId: id, nextRunTime, state });
    }
  } catch { cachedSchedulesError = "failed to parse temporal schedule list output"; return; }
  cachedSchedules = schedules;
}
refreshSchedules();
setInterval(refreshSchedules, 60000);

function restCockpitSchedules(res: http.ServerResponse): void {
  if (cachedSchedulesError !== null) {
    jsonResponse(res, { error: cachedSchedulesError }, 500);
    return;
  }
  jsonResponse(res, cachedSchedules ?? []);
}

function restServeAgents(res: http.ServerResponse): void {
  interface VerdictCounts { retained: number; evolved: number; retired: number; lastVerdict: string }
  const verdictHistory = new Map<string, VerdictCounts>();
  try {
    const files = readdirSync(SESSIONS_DIR_REST).filter((f) => /^(?:congress|trial|session)-\d+\.json$/.test(f));
    for (const file of files) {
      try {
        const sdata = JSON.parse(readFileSync(join(SESSIONS_DIR_REST, file), "utf-8")) as Record<string, unknown>;
        const evo = (sdata.evolution ?? {}) as Record<string, unknown>;
        const inc = (dn: string, type: "retained" | "evolved" | "retired") => {
          if (!dn) return;
          const e = verdictHistory.get(dn) ?? { retained: 0, evolved: 0, retired: 0, lastVerdict: "" };
          e[type] += 1;
          e.lastVerdict = type.toUpperCase();
          verdictHistory.set(dn, e);
        };
        for (const pname of (evo.retained as string[] | undefined) ?? []) inc(pname, "retained");
        for (const item of (evo.evolved as Array<{display_name?: string}> | undefined) ?? []) inc(item.display_name ?? "", "evolved");
        for (const item of (evo.retired as Array<{display_name?: string}> | undefined) ?? (evo.fired as Array<{display_name?: string}> | undefined) ?? []) inc(item.display_name ?? "", "retired");
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  const loadDir = (dirpath: string) => {
    const agents: unknown[] = [];
    try {
      const files = readdirSync(dirpath).filter((f) => f.endsWith(".md")).sort();
      for (const fname of files) {
        try {
          const content = readFileSync(join(dirpath, fname), "utf-8");
          const { data: meta } = matter(content);
          const name = String(meta.name ?? "");
          if (!name) continue;
          const dname = String(meta.display_name ?? name);
          const vh = verdictHistory.get(dname) ?? { retained: 0, evolved: 0, retired: 0, lastVerdict: "" };
          agents.push({
            id: name, name, role: meta.role ?? "", emoji: EMOJI_MAP_REST[name] ?? "🤖",
            color: COLOR_MAP_REST[name] ?? "#888888", description: meta.role ?? "",
            traits: meta.traits ?? [], is_moderator: name === "chairman",
            model: meta.model ?? "claude", display_name: dname,
            avatar_url: meta.avatar_url ?? "", title: meta.title ?? "",
            sex: meta.sex ?? "", stats_retained: vh.retained, stats_evolved: vh.evolved,
            stats_retired: vh.retired, last_verdict: vh.lastVerdict,
            status: String(meta.status ?? "eligible"),
            hidden: Boolean(meta.hidden),
          });
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    return agents;
  };

  const all = loadDir(AGENTS_DIR_REST);
  const visible = all.filter((a) => !(a as Record<string, unknown>).hidden);
  const eligible = visible.filter((a) => {
    const r = a as Record<string, unknown>;
    return !r.is_moderator && r.status === "eligible";
  });
  const meme = visible.filter((a) => {
    const r = a as Record<string, unknown>;
    return !r.is_moderator && r.status === "meme";
  });
  const moderator = visible.find((a) => (a as Record<string, unknown>).is_moderator) ?? null;
  jsonResponse(res, { eligible, meme, moderator });
}

// ── Native REST: GET /api/subagents — list agents from tasks.db ──

interface SubagentInfo {
  id: string;
  name: string;
  status: "running" | "complete" | "stale";
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;
  toolUses: number;
  outputPath: string;
  startedAt: string | null;
  lastModified: string;
  traceId: string | null;
  exitReason: string | null;
}

/** Parse a DB timestamp — handles both Unix seconds (number) and date strings. */
function parseAgentTs(v: unknown): string | null {
  if (!v) return null;
  const n = Number(v);
  const d = isNaN(n) ? new Date(String(v)) : new Date(n * 1000);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Given an agentId and optional sessionId from tasks.db, find the .output file
 * at /tmp/claude-1001/-mnt-data/{sessionId}/tasks/{agentId}.output.
 * Falls back to globbing all sessions if sessionId is missing or path not found.
 */
function resolveAgentOutputPath(agentId: string, sessionId?: string): string {
  if (!agentId) return "";
  // Try direct path first (fast path using known sessionId)
  if (sessionId && sessionId !== "unknown") {
    const direct = `/tmp/claude-1001/-mnt-data/${sessionId}/tasks/${agentId}.output`;
    if (existsSync(direct)) return direct;
  }
  // Fallback: glob across all sessions
  try {
    const matches = globSync(`/tmp/claude-1001/-mnt-data/*/tasks/${agentId}.output`);
    if (matches.length > 0) return matches[0];
  } catch { /* ignore */ }
  return "";
}

function restServeSubagents(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Read from tasks.db — the canonical agent tracking store
  const result: SubagentInfo[] = [];
  try {
    const db = new Database(TASKS_DB_REST, { readonly: true });
    db.run("PRAGMA journal_mode=WAL");
    // Show tasks from the last 2 hours plus any still open/running
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const rows = db.query<Record<string, unknown>, [string]>(
      "SELECT * FROM tasks WHERE created_at >= ? OR status NOT IN ('done', 'failed') ORDER BY created_at DESC LIMIT 100",
    ).all(cutoff);
    db.close();

    for (const row of rows) {
      const taskId = String(row.id ?? "");
      if (!taskId) continue;
      const rowStatus = String(row.status ?? "done");
      // tasks.db uses: open/running → running, done/failed → complete
      const status: "running" | "complete" | "stale" =
        (rowStatus === "open" || rowStatus === "running" || rowStatus === "in_progress") ? "running" : "complete";

      // Parse optional JSON blob for extra fields
      let blobData: Record<string, unknown> = {};
      try {
        if (row.data) blobData = JSON.parse(String(row.data)) as Record<string, unknown>;
      } catch { /* ignore malformed blob */ }

      const startedAt = parseAgentTs(row.created_at);
      const finishedAt = parseAgentTs(blobData.finished_at ?? row.updated_at);
      const lastModified = (rowStatus === "done" || rowStatus === "failed") ? (finishedAt ?? startedAt ?? new Date().toISOString()) : (startedAt ?? new Date().toISOString());

      const agentId = String(blobData.agent_id ?? "");
      const sessionId = String(blobData.session_id ?? "");
      const outputPath = resolveAgentOutputPath(agentId, sessionId);

      result.push({
        id: taskId,
        name: String(row.title ?? taskId.slice(0, 12)),
        status,
        // tasks.db doesn't track token costs — zero-fill for UI compatibility
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cost: 0,
        toolUses: 0,
        outputPath,
        startedAt,
        lastModified,
        traceId: null,
        exitReason: rowStatus === "failed" ? "failed" : rowStatus === "done" ? "completed" : null,
      });
    }
  } catch (err) {
    console.warn("[subagents] tasks.db query failed:", err);
  }

  result.sort((a, b) => {
    const aActive = a.status === 'running' ? 0 : 1;
    const bActive = b.status === 'running' ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
  });
  jsonResponse(res, result);
}

async function restStreamSubagent(req: http.IncomingMessage, res: http.ServerResponse, outputPath: string): Promise<void> {
  if (!outputPath || !outputPath.startsWith("/tmp/claude-1001/-mnt-data/")) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Invalid path");
    return;
  }
  if (!existsSync(outputPath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("File not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  let offset = 0;
  let lastChangeAt = Date.now();
  const IDLE_TIMEOUT_MS = 30_000;
  const POLL_INTERVAL_MS = 500;

  const send = (line: string) => {
    try {
      res.write(`data: ${line}\n\n`);
    } catch { /* client disconnected */ }
  };

  // Read from `offset` to EOF, send each non-empty line, return new offset.
  // onBytesRead is called whenever bytes are read (used to update lastChangeAt).
  const drainFile = (onBytesRead?: () => void): void => {
    const fd = openSync(outputPath, "r");
    try {
      const buf = Buffer.alloc(65536);
      let bytes: number;
      let accumulated = "";
      while ((bytes = readSync(fd, buf, 0, buf.length, offset)) > 0) {
        offset += bytes;
        accumulated += buf.slice(0, bytes).toString("utf-8");
        onBytesRead?.();
      }
      for (const line of accumulated.split("\n")) {
        if (line.trim()) send(line);
      }
    } finally {
      closeSync(fd);
    }
  };

  // Send existing content
  try { drainFile(); } catch { /* file disappeared */ }

  // Poll for new content
  const cleanup = () => {
    clearInterval(timer);
  };

  req.on("close", cleanup);
  req.on("error", cleanup);

  const timer = setInterval(() => {
    if (Date.now() - lastChangeAt > IDLE_TIMEOUT_MS) {
      cleanup();
      try { res.end(); } catch { /* ignore */ }
      return;
    }
    try {
      const st = statSync(outputPath);
      if (st.size <= offset) return;
      drainFile(() => { lastChangeAt = Date.now(); });
    } catch { /* file may have disappeared */ }
  }, POLL_INTERVAL_MS);
}

function restServeCongressIdentities(res: http.ServerResponse): void {
  const identities: unknown[] = [];
  try {
    const files = readdirSync(AGENTS_DIR_REST).filter((f) => f.endsWith(".md")).sort();
    for (const fname of files) {
      try {
        const content = readFileSync(join(AGENTS_DIR_REST, fname), "utf-8");
        const { data: meta } = matter(content);
        if (!meta.name) continue;
        if (meta.congress === false) continue;
        identities.push({
          name: meta.name ?? "", role: meta.role ?? "", traits: meta.traits ?? [],
          evolves: meta.evolves ?? false, model: meta.model ?? "claude",
          display_name: meta.display_name ?? "", avatar_url: meta.avatar_url ?? "",
          title: meta.title ?? "", sex: meta.sex ?? "",
          status: String(meta.status ?? "eligible"),
        });
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  jsonResponse(res, identities);
}

function restServeCongressSessions(res: http.ServerResponse): void {
  // Return only summary fields — avoids shipping full round/roster arrays (~1.4MB) on every sidebar poll.
  interface SessionSummary { session_id: string; session_number: number; topic: string; status: string; started_at: string; verdict: string | null; flavor: string; defendant?: string; charges?: string }
  const sessions: SessionSummary[] = [];
  try {
    const files = readdirSync(SESSIONS_DIR_REST).filter((f) => /^(?:congress|trial|session)-\d+\.json$/.test(f));
    for (const file of files) {
      try {
        const s = JSON.parse(readFileSync(join(SESSIONS_DIR_REST, file), "utf-8")) as Record<string, unknown>;
        // Derive flavor: from JSON field, or infer from legacy file prefix
        let flavor = (s.flavor as string) ?? "";
        if (!flavor) {
          if (s.defendant) flavor = "trial";
          else if (s.mode === "meme") flavor = "meme";
          else flavor = "normal";
        }
        const entry: SessionSummary = {
          session_id: String(s.session_id ?? ""),
          session_number: Number(s.session_number ?? 0),
          topic: String(s.topic ?? ""),
          status: String(s.status ?? ""),
          started_at: String(s.started_at ?? s.saved_at ?? ""),
          verdict: s.verdict != null ? String(s.verdict) : null,
          flavor,
        };
        // Include defendant/charges for trial sessions (used by sidebar display)
        if (flavor === "trial") {
          entry.defendant = String(s.defendant_display ?? s.defendant ?? "");
          entry.charges = String(s.charges ?? "");
        }
        sessions.push(entry);
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  // Sort by started_at descending (most recent first); fall back to session_number
  sessions.sort((a, b) => {
    // Deliberating sessions always first
    const aActive = a.status === "deliberating" ? 0 : 1;
    const bActive = b.status === "deliberating" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    // Then by timestamp if available
    if (a.started_at && b.started_at) {
      const cmp = b.started_at.localeCompare(a.started_at);
      if (cmp !== 0) return cmp;
    }
    return b.session_number - a.session_number;
  });
  jsonResponse(res, sessions);
}

function restServeCongressSession(res: http.ServerResponse, sessionId: string): void {
  const fpath = join(SESSIONS_DIR_REST, `${sessionId}.json`);
  if (!existsSync(fpath)) { jsonResponse(res, { error: `Session '${sessionId}' not found` }, 404); return; }
  try {
    jsonResponse(res, JSON.parse(readFileSync(fpath, "utf-8")));
  } catch (e) {
    jsonResponse(res, { error: `Could not read session: ${e}` }, 500);
  }
}

function restServeCongressMatrix(res: http.ServerResponse): void {
  // Pre-compute the full participation matrix in one response
  interface MatrixCell {
    participated: boolean;
    vote?: "agree" | "disagree";
    evolution?: "evolved" | "retired" | "retained" | "created";
    evolutionDetail?: string;
  }
  interface MatrixSession {
    session_number: number;
    session_id: string;
    topic: string;
    status: string;
    mode: string;
    flavor: string;
    started_at: string;
    participant_count: number;
  }
  interface MatrixPersona {
    id: string;
    display_name: string;
    total_sessions: number;
    times_evolved: number;
    times_retired: number;
    times_created: number;
    agree_count: number;
    disagree_count: number;
  }

  const sessions: MatrixSession[] = [];
  // Map: persona_id -> session_id -> cell data
  const cells: Record<string, Record<string, MatrixCell>> = {};
  const personaNames: Record<string, string> = {}; // id -> display_name

  try {
    const files = readdirSync(SESSIONS_DIR_REST).filter((f) => /^(?:congress|trial|session)-\d+\.json$/.test(f));
    for (const file of files) {
      try {
        const s = JSON.parse(readFileSync(join(SESSIONS_DIR_REST, file), "utf-8")) as Record<string, unknown>;
        const isTrial = !!s.trial_number || !!s.defendant;
        const num = Number(s.session_number ?? s.trial_number ?? 0);
        const sid = String(s.session_id ?? "");

        // Build roster lookup: id -> display_name
        // For trials: jury + prosecutors + advocate + defendant form the roster
        const displayToId: Record<string, string> = {};
        const rosterSource = isTrial
          ? [
              ...((s.jury as Array<Record<string, unknown>> | undefined) ?? []),
              ...((s.prosecutors as Array<Record<string, unknown>> | undefined) ?? []),
              ...(s.advocate ? [s.advocate as Record<string, unknown>] : []),
              ...(s.defendant ? [{ name: s.defendant, display_name: s.defendant_display ?? s.defendant }] : []),
            ]
          : ((s.roster as Array<Record<string, unknown>> | undefined) ?? []);
        for (const p of rosterSource) {
          const pid = String(p.id ?? p.name ?? "");
          const dn = String(p.display_name ?? pid);
          if (pid) {
            displayToId[dn] = pid;
            personaNames[pid] = dn;
          }
        }

        // Participation — for trials: prosecutors, advocate, defendant, jury all participated
        const participants = new Set<string>();
        if (isTrial) {
          for (const p of ((s.prosecutors as Array<Record<string, unknown>> | undefined) ?? [])) {
            const pid = String(p.name ?? "");
            if (pid) { participants.add(pid); if (!cells[pid]) cells[pid] = {}; cells[pid][sid] = { participated: true }; }
          }
          if (s.advocate && typeof s.advocate === "object") {
            const pid = String((s.advocate as Record<string, unknown>).name ?? "");
            if (pid) { participants.add(pid); if (!cells[pid]) cells[pid] = {}; cells[pid][sid] = { participated: true }; }
          }
          if (s.defendant) {
            const pid = String(s.defendant);
            participants.add(pid); if (!cells[pid]) cells[pid] = {}; cells[pid][sid] = { participated: true };
          }
          for (const j of ((s.jury as Array<Record<string, unknown>> | undefined) ?? [])) {
            const pid = String(j.name ?? "");
            if (pid) { participants.add(pid); if (!cells[pid]) cells[pid] = {}; cells[pid][sid] = { participated: true }; }
          }
        } else {
          for (const r of (s.rounds as Array<Record<string, unknown>> | undefined) ?? []) {
            const ident = String(r.identity ?? "");
            if (ident && ident !== "chairman") {
              participants.add(ident);
              if (!cells[ident]) cells[ident] = {};
              cells[ident][sid] = { participated: true };
            }
          }
        }

        // Vote summary — standardized schema: always a dict with agree/disagree arrays
        // For trials: jury_votes is an array of {juror, verdict, reasoning}
        if (isTrial) {
          for (const jv of ((s.jury_votes as Array<Record<string, unknown>> | undefined) ?? [])) {
            const jurorName = String(jv.juror ?? "");
            const pid = displayToId[jurorName];
            const jverdict = String(jv.verdict ?? "").toLowerCase();
            if (pid && cells[pid]?.[sid]) {
              // Map trial verdict to agree/disagree: guilty=agree (with prosecution), not guilty=disagree
              cells[pid][sid].vote = jverdict.includes("guilty") && !jverdict.includes("not guilty") ? "agree" : "disagree";
            }
          }
        } else {
          const vs = s.vote_summary as Record<string, unknown> | undefined;
          if (vs && typeof vs === "object") {
            for (const dn of (vs.agree as string[] | undefined) ?? []) {
              const pid = displayToId[dn];
              if (pid && cells[pid]?.[sid]) cells[pid][sid].vote = "agree";
            }
            for (const dn of (vs.disagree as string[] | undefined) ?? []) {
              const pid = displayToId[dn];
              if (pid && cells[pid]?.[sid]) cells[pid][sid].vote = "disagree";
            }
          }
        }

        // Evolution — standardized schema: always a dict with evolved/retired/retained/created arrays
        const evo = (s.evolution ?? null) as Record<string, unknown> | null;
        if (evo) {
          for (const item of (evo.evolved as Array<Record<string, unknown>> | undefined) ?? []) {
            const pid = String(item.slug ?? "") || displayToId[String(item.display_name ?? "")];
            if (pid && cells[pid]?.[sid]) {
              cells[pid][sid].evolution = "evolved";
              cells[pid][sid].evolutionDetail = String(item.learned ?? "").slice(0, 120);
            }
          }
          // Read "retired" key first, fall back to legacy "fired" key for old sessions
          for (const item of (evo.retired as Array<Record<string, unknown>> | undefined) ?? (evo.fired as Array<Record<string, unknown>> | undefined) ?? []) {
            const pid = String(item.slug ?? "") || displayToId[String(item.display_name ?? "")];
            if (pid && cells[pid]?.[sid]) {
              cells[pid][sid].evolution = "retired";
              cells[pid][sid].evolutionDetail = String(item.reason ?? "").slice(0, 120);
            }
          }
          for (const item of (evo.retained as Array<Record<string, unknown>> | undefined) ?? []) {
            const pid = String(item.slug ?? "") || displayToId[String(item.display_name ?? "")];
            if (pid && cells[pid]?.[sid]) cells[pid][sid].evolution = "retained";
          }
          for (const item of (evo.created as Array<Record<string, unknown>> | undefined) ?? []) {
            const pid = String(item.slug ?? "") || displayToId[String(item.display_name ?? "")];
            if (pid) {
              if (!cells[pid]) cells[pid] = {};
              cells[pid][sid] = { participated: false, evolution: "created" };
            }
          }
        }

        // Derive flavor for matrix display
        let matrixFlavor = String(s.flavor ?? "");
        if (!matrixFlavor) {
          if (isTrial) matrixFlavor = "trial";
          else if (s.mode === "meme") matrixFlavor = "meme";
          else matrixFlavor = "normal";
        }

        sessions.push({
          session_number: num,
          session_id: sid,
          topic: String(s.topic ?? s.charges ?? ""),
          status: String(s.status ?? s.verdict ?? ""),
          mode: String(s.mode ?? "standard"),
          started_at: String(s.started_at ?? s.saved_at ?? ""),
          participant_count: participants.size,
          flavor: matrixFlavor,
        });
      } catch { /* skip bad file */ }
    }
  } catch { /* skip */ }

  // Sort chronologically by started_at timestamp (trials use saved_at, normalized to started_at)
  sessions.sort((a, b) => {
    if (a.started_at && b.started_at) return a.started_at.localeCompare(b.started_at);
    if (a.started_at) return -1;
    if (b.started_at) return 1;
    return a.session_number - b.session_number;
  });

  // Build persona summaries
  const personas: MatrixPersona[] = [];
  for (const [pid, sessionCells] of Object.entries(cells)) {
    let totalSessions = 0, timesEvolved = 0, timesRetired = 0, timesCreated = 0, agreeCount = 0, disagreeCount = 0;
    for (const cell of Object.values(sessionCells)) {
      if (cell.participated) totalSessions++;
      if (cell.evolution === "evolved") timesEvolved++;
      if (cell.evolution === "retired") timesRetired++;
      if (cell.evolution === "created") timesCreated++;
      if (cell.vote === "agree") agreeCount++;
      if (cell.vote === "disagree") disagreeCount++;
    }
    personas.push({
      id: pid,
      display_name: personaNames[pid] ?? pid,
      total_sessions: totalSessions,
      times_evolved: timesEvolved,
      times_retired: timesRetired,
      times_created: timesCreated,
      agree_count: agreeCount,
      disagree_count: disagreeCount,
    });
  }
  personas.sort((a, b) => b.total_sessions - a.total_sessions);

  jsonResponse(res, { sessions, personas, cells });
}

async function restPatchCongressSession(
  req: http.IncomingMessage, res: http.ServerResponse, sessionId: string
): Promise<void> {
  const fpath = join(SESSIONS_DIR_REST, `${sessionId}.json`);
  if (!existsSync(fpath)) { jsonResponse(res, { error: `Session '${sessionId}' not found` }, 404); return; }
  const body = await readBody(req);
  let updates: Record<string, unknown>;
  try {
    updates = body.length ? (JSON.parse(body.toString("utf-8")) as Record<string, unknown>) : {};
  } catch (e) {
    const status = (e as NodeJS.ErrnoException).code === "BODY_TOO_LARGE" ? 413 : 400;
    jsonResponse(res, { error: status === 413 ? "request body too large" : `Invalid JSON: ${e}` }, status);
    return;
  }
  const ALLOWED = new Set(["verdict", "status", "finished_at", "evolution", "thread_id", "task_titles", "vote_summary", "mode", "requires_ack", "defendant", "charges", "flavor"]);
  try {
    const session = JSON.parse(readFileSync(fpath, "utf-8")) as Record<string, unknown>;
    for (const key of ALLOWED) {
      if (key in updates) {
        // evolution may arrive as a JSON string from the Python activity — parse it
        if (key === "evolution" && typeof updates[key] === "string") {
          try { session[key] = JSON.parse(updates[key] as string); } catch { session[key] = updates[key]; }
        } else {
          session[key] = updates[key];
        }
      }
    }
    writeFileSync(fpath, JSON.stringify(session, null, 2), "utf-8");
    jsonResponse(res, { ok: true, session_id: sessionId });
  } catch (e) {
    jsonResponse(res, { error: `Could not update session: ${e}` }, 500);
  }
}

async function restServeWalletBalance(res: http.ServerResponse): Promise<void> {
  let address: string;
  try {
    const content = readFileSync(WALLET_FILE_REST, "utf-8");
    const line = content.split("\n").find((l) => l.startsWith("ADDRESS="));
    address = line ? line.slice("ADDRESS=".length).trim() : WALLET_ADDRESS_FALLBACK;
  } catch {
    address = WALLET_ADDRESS_FALLBACK;
  }
  try {
    const rpcRes = await fetch(BASE_RPC_URL_REST, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getBalance", params: [address, "latest"], id: 1 }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await rpcRes.json()) as { result?: string; error?: { message: string } };
    if (data.error) { jsonResponse(res, { error: `RPC error: ${data.error.message}` }, 502); return; }
    const wei = BigInt(data.result ?? "0x0");
    const eth = Number(wei) / 1e18;
    let balanceStr = eth.toFixed(6).replace(/0+$/, "").replace(/\.$/, ".0");
    if (!balanceStr.includes(".")) balanceStr += ".0";
    jsonResponse(res, { address, balance_eth: balanceStr, chain: "Base" });
  } catch (e) {
    jsonResponse(res, { error: `RPC error: ${e}` }, 502);
  }
}

// ── Native REST: GET /api/congress/tracking ──────────────────────────────

const VERDICT_TRACKING_DB = "/home/clungus/work/bigclungus-meta/tasks.db";

interface VerdictTrackingRow {
  id: number;
  session_id: string;
  topic: string;
  verdict_ts: string;
  mode: string;
  requires_ack: number;
  ack_ts: string | null;
  task_id: string | null;
  task_status: string | null;
  created_at: string;
}

function restServeCongressTracking(res: http.ServerResponse, filter?: string): void {
  if (!existsSync(VERDICT_TRACKING_DB)) {
    jsonResponse(res, { error: "verdict_tracking database not found" }, 500);
    return;
  }
  const db = new Database(VERDICT_TRACKING_DB, { readonly: true });
  let query = "SELECT * FROM verdict_tracking ORDER BY verdict_ts DESC";
  if (filter === "unacted") {
    query = "SELECT * FROM verdict_tracking WHERE requires_ack = 1 AND ack_ts IS NULL ORDER BY verdict_ts DESC";
  } else if (filter === "acted") {
    query = "SELECT * FROM verdict_tracking WHERE ack_ts IS NOT NULL ORDER BY verdict_ts DESC";
  } else if (filter === "meme") {
    query = "SELECT * FROM verdict_tracking WHERE mode = 'meme' ORDER BY verdict_ts DESC";
  }
  const rows = db.query<VerdictTrackingRow, []>(query).all();
  db.close();

  const total = rows.length;
  const acted = rows.filter((r) => r.ack_ts !== null).length;
  const unacted = rows.filter((r) => r.requires_ack === 1 && r.ack_ts === null).length;
  const meme = rows.filter((r) => r.mode === "meme").length;

  jsonResponse(res, {
    summary: { total, acted, unacted_serious: unacted, meme },
    verdicts: rows.map((r) => ({
      session_id: r.session_id,
      topic: r.topic.length > 200 ? r.topic.slice(0, 200) + "..." : r.topic,
      verdict_ts: r.verdict_ts,
      mode: r.mode,
      requires_ack: r.requires_ack === 1,
      ack_ts: r.ack_ts,
      task_id: r.task_id,
      task_status: r.task_status,
    })),
  });
}

async function restPostCongressTrackingRecord(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  let data: Record<string, unknown>;
  try {
    const body = await readBody(req);
    data = body.length ? (JSON.parse(body.toString("utf-8")) as Record<string, unknown>) : {};
  } catch (e) {
    const status = (e as NodeJS.ErrnoException).code === "BODY_TOO_LARGE" ? 413 : 400;
    jsonResponse(res, { error: status === 413 ? "request body too large" : `Invalid JSON: ${e}` }, status);
    return;
  }

  const sessionId = String(data.session_id ?? "");
  const topic = String(data.topic ?? "");
  const verdictTs = String(data.verdict_ts ?? new Date().toISOString());
  const mode = String(data.mode ?? "serious");
  const requiresAck = data.requires_ack !== false ? 1 : 0;
  const taskId = data.task_id ? String(data.task_id) : null;
  const taskStatus = data.task_status ? String(data.task_status) : null;

  if (!sessionId || !topic) {
    jsonResponse(res, { error: "session_id and topic are required" }, 400);
    return;
  }

  if (!existsSync(VERDICT_TRACKING_DB)) {
    jsonResponse(res, { error: "verdict_tracking database not found" }, 500);
    return;
  }

  const db = new Database(VERDICT_TRACKING_DB);
  try {
    db.run(
      `INSERT INTO verdict_tracking (session_id, topic, verdict_ts, mode, requires_ack, task_id, task_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         topic = excluded.topic,
         verdict_ts = excluded.verdict_ts,
         mode = excluded.mode,
         requires_ack = excluded.requires_ack,
         task_id = COALESCE(excluded.task_id, verdict_tracking.task_id),
         task_status = COALESCE(excluded.task_status, verdict_tracking.task_status)`,
      [sessionId, topic, verdictTs, mode, requiresAck, taskId, taskStatus]
    );
    db.close();
    jsonResponse(res, { ok: true, session_id: sessionId });
  } catch (e) {
    db.close();
    jsonResponse(res, { error: `DB insert failed: ${e}` }, 500);
  }
}

async function restPatchCongressTracking(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sessionId: string
): Promise<void> {
  let data: Record<string, unknown>;
  try {
    const body = await readBody(req);
    data = body.length ? (JSON.parse(body.toString("utf-8")) as Record<string, unknown>) : {};
  } catch (e) {
    const status = (e as NodeJS.ErrnoException).code === "BODY_TOO_LARGE" ? 413 : 400;
    jsonResponse(res, { error: status === 413 ? "request body too large" : `Invalid JSON: ${e}` }, status);
    return;
  }

  if (!existsSync(VERDICT_TRACKING_DB)) {
    jsonResponse(res, { error: "verdict_tracking database not found" }, 500);
    return;
  }

  const db = new Database(VERDICT_TRACKING_DB);
  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.ack_ts !== undefined) {
    updates.push("ack_ts = ?");
    params.push(data.ack_ts ? String(data.ack_ts) : null);
  }
  if (data.task_id !== undefined) {
    updates.push("task_id = ?");
    params.push(data.task_id ? String(data.task_id) : null);
  }
  if (data.task_status !== undefined) {
    updates.push("task_status = ?");
    params.push(data.task_status ? String(data.task_status) : null);
  }

  if (updates.length === 0) {
    db.close();
    jsonResponse(res, { error: "No fields to update" }, 400);
    return;
  }

  params.push(sessionId);
  try {
    const result = db.run(
      `UPDATE verdict_tracking SET ${updates.join(", ")} WHERE session_id = ?`,
      params
    );
    db.close();
    if (result.changes === 0) {
      jsonResponse(res, { error: "Session not found in verdict_tracking" }, 404);
    } else {
      jsonResponse(res, { ok: true, session_id: sessionId });
    }
  } catch (e) {
    db.close();
    jsonResponse(res, { error: `DB update failed: ${e}` }, 500);
  }
}

// ── Native REST: POST /api/congress ────────────────────────────────────────

async function restPostCongress(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!restIsAuthed(req)) {
    jsonResponse(res, { error: "Forbidden: authentication required" }, 403);
    return;
  }
  let data: Record<string, unknown>;
  try {
    const body = await readBody(req);
    data = body.length ? (JSON.parse(body.toString("utf-8")) as Record<string, unknown>) : {};
  } catch (e) {
    const status = (e as NodeJS.ErrnoException).code === "BODY_TOO_LARGE" ? 413 : 400;
    jsonResponse(res, { error: status === 413 ? "request body too large" : `Invalid JSON: ${e}` }, status);
    return;
  }
  try {
    const reqMsg = create(PostDebateRequestSchema, {
      task: String(data.task ?? ""),
      identity: String(data.identity ?? ""),
      sessionId: String(data.session_id ?? ""),
    });
    const result = await congressServiceImpl.postDebate(reqMsg, {} as never);
    jsonResponse(res, { response: result.response, identity: result.identity });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[restPostCongress] error:", msg);
    jsonResponse(res, { error: "Persona failed to respond", reason: msg }, 503);
  }
}

// ── Native REST: GET /api/congress/stream (SSE) ────────────────────────────

function restStreamCongress(req: http.IncomingMessage, res: http.ServerResponse, sessionId: string): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "https://clung.us",
  });

  let lastLen = 0;
  let iter = 0;
  const maxIter = 600; // 60s at 100ms
  let clientClosed = false;

  req.on("close", () => { clientClosed = true; });

  const tick = () => {
    if (clientClosed || iter >= maxIter) {
      if (!clientClosed) res.end();
      return;
    }
    iter++;

    const stream = activeStreams.get(sessionId);
    if (stream) {
      const newText = stream.text.slice(lastLen);
      if (newText) {
        const data = JSON.stringify({
          identity: stream.identity,
          display_name: stream.displayName,
          text: newText,
          done: false,
        });
        res.write(`data: ${data}\n\n`);
        lastLen = stream.text.length;
      }
      if (stream.done) {
        const data = JSON.stringify({
          identity: stream.identity,
          display_name: stream.displayName,
          text: "",
          done: true,
        });
        res.write(`data: ${data}\n\n`);
        res.end();
        return;
      }
    }

    setTimeout(tick, 100);
  };

  tick();
}
// ── Timeline SQLite ────────────────────────────────────────────────────────

const TIMELINE_DB_PATH = "/mnt/data/clunger/timeline.db";
const timelineDb = new Database(TIMELINE_DB_PATH);
timelineDb.exec("PRAGMA journal_mode=WAL");
timelineDb.exec(`
  CREATE TABLE IF NOT EXISTS timeline_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'milestone',
    icon TEXT,
    url TEXT,
    source TEXT DEFAULT 'manual',
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// ── Native REST: /api/personas* ────────────────────────────────────────────

const PERSONAS_DB_PATH_REST = "/mnt/data/hello-world/personas.db";
const AGENTS_UNIFIED_REST = "/mnt/data/bigclungus-meta/agents";


function personaFindMdPath(name: string): { fpath: string; status: string } | null {
  const fpath = join(AGENTS_UNIFIED_REST, `${name}.md`);
  if (!existsSync(fpath)) return null;
  // Derive status from frontmatter status field
  try {
    const content = readFileSync(fpath, "utf-8");
    const { meta } = personaParseFrontmatter(content);
    const status = String(meta["status"] ?? "eligible");
    return { fpath, status };
  } catch (e) {
    console.error(`personaFindMdPath: failed to parse frontmatter for ${name}: ${e}`);
    return null;
  }
}

function personaParseFrontmatter(content: string): { meta: Record<string, unknown>; body: string } {
  if (!content.startsWith("---")) return { meta: {}, body: content };
  const end = content.indexOf("---", 3);
  if (end === -1) return { meta: {}, body: content };
  const fm = content.slice(3, end);
  const body = content.slice(end + 3).trim();
  const meta: Record<string, unknown> = {};
  for (const line of fm.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (key) meta[key] = val;
  }
  return { meta, body };
}

function personaBuildFrontmatter(fields: Record<string, unknown>): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null && v !== "") lines.push(`${k}: ${v}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function personaWriteMd(fpath: string, meta: Record<string, unknown>, prompt: string): void {
  const fm = personaBuildFrontmatter(meta);
  writeFileSync(fpath, `${fm}\n\n${prompt}`, "utf-8");
}

function personaSyncToDb(db: InstanceType<typeof Database>, name: string, meta: Record<string, unknown>, status: string, mdPath: string): void {
  const now = new Date().toISOString();
  const exists = db.query("SELECT name FROM personas WHERE name = ?").get(name);
  if (exists) {
    db.run(
      `UPDATE personas SET display_name=?, model=?, role=?, title=?, sex=?, congress=?, evolves=?, avatar_url=?, status=?, md_path=?, updated_at=? WHERE name=?`,
      [
        String(meta.display_name ?? name),
        String(meta.model ?? "claude"),
        String(meta.role ?? ""),
        meta.title ? String(meta.title) : null,
        meta.sex ? String(meta.sex) : null,
        meta.congress !== false ? 1 : 0,
        meta.evolves ? 1 : 0,
        meta.avatar_url ? String(meta.avatar_url) : null,
        status,
        mdPath,
        now,
        name,
      ]
    );
  } else {
    db.run(
      `INSERT INTO personas (name,display_name,model,role,title,sex,congress,evolves,special_seat,stakeholder_only,status,md_path,avatar_url,prompt_hash,total_congresses,times_evolved,times_retired,times_reinstated,last_verdict,last_verdict_date,updated_at) VALUES (?,?,?,?,?,?,?,?,0,0,?,?,?,NULL,0,0,0,0,NULL,NULL,?)`,
      [
        name,
        String(meta.display_name ?? name),
        String(meta.model ?? "claude"),
        String(meta.role ?? ""),
        meta.title ? String(meta.title) : null,
        meta.sex ? String(meta.sex) : null,
        meta.congress !== false ? 1 : 0,
        meta.evolves ? 1 : 0,
        status,
        mdPath,
        meta.avatar_url ? String(meta.avatar_url) : null,
        now,
      ]
    );
  }
}

function personaRowToJson(row: Record<string, unknown>, prompt = ""): Record<string, unknown> {
  return { ...row, prompt };
}

async function restHandlePersonas(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<void> {
  // All persona mutations require auth
  const isWrite = req.method === "POST" || req.method === "PATCH" || req.method === "DELETE";
  if (isWrite && !restIsAuthed(req)) {
    jsonResponse(res, { error: "Forbidden: authentication required" }, 403);
    return;
  }

  // GET /api/personas — list all
  if (pathname === "/api/personas" && req.method === "GET") {
    const db = new Database(PERSONAS_DB_PATH_REST, { readonly: true });
    try {
      const rows = db.query("SELECT * FROM personas ORDER BY name").all() as Record<string, unknown>[];
      jsonResponse(res, { personas: rows });
    } finally {
      db.close();
    }
    return;
  }

  // POST /api/personas — create
  if (pathname === "/api/personas" && req.method === "POST") {
    let data: Record<string, unknown>;
    try {
      const body = await readBody(req);
      data = body.length ? (JSON.parse(body.toString("utf-8")) as Record<string, unknown>) : {};
    } catch (e) {
      jsonResponse(res, { error: `Invalid JSON: ${e}` }, 400);
      return;
    }
    const name = String(data.name ?? "").trim();
    if (!name || !/^[\w-]+$/.test(name)) {
      jsonResponse(res, { error: "Missing or invalid 'name' field" }, 400);
      return;
    }
    if (personaFindMdPath(name)) {
      jsonResponse(res, { error: `Persona '${name}' already exists` }, 409);
      return;
    }
    const meta: Record<string, unknown> = {
      name,
      display_name: data.display_name ?? name,
      model: data.model ?? "claude-opus-4-6",
      role: data.role ?? "",
      title: data.title ?? null,
      sex: data.sex ?? null,
      congress: data.congress !== false,
      evolves: data.evolves !== false,
      avatar_url: data.avatar_url ?? null,
    };
    const prompt = String(data.prompt ?? "");
    const fpath = join(AGENTS_UNIFIED_REST, `${name}.md`);
    try {
      personaWriteMd(fpath, meta, prompt);
    } catch (e) {
      jsonResponse(res, { error: `Failed to write md file: ${e}` }, 500);
      return;
    }
    const db = new Database(PERSONAS_DB_PATH_REST);
    try {
      personaSyncToDb(db, name, meta, "eligible", fpath);
      db.run("UPDATE personas SET updated_at=? WHERE name=?", [new Date().toISOString(), name]);
      const row = db.query("SELECT * FROM personas WHERE name=?").get(name) as Record<string, unknown>;
      jsonResponse(res, { persona: personaRowToJson(row, prompt) }, 201);
    } finally {
      db.close();
    }
    return;
  }

  // /api/personas/:name routes
  const nameMatch = /^\/api\/personas\/([\w-]+)$/.exec(pathname);
  if (nameMatch) {
    const name = nameMatch[1];

    if (req.method === "GET") {
      const db = new Database(PERSONAS_DB_PATH_REST, { readonly: true });
      try {
        const row = db.query("SELECT * FROM personas WHERE name=?").get(name) as Record<string, unknown> | null;
        if (!row) { jsonResponse(res, { error: `Persona '${name}' not found` }, 404); return; }
        const found = personaFindMdPath(name);
        let prompt = "";
        if (found) {
          const content = readFileSync(found.fpath, "utf-8");
          prompt = personaParseFrontmatter(content).body;
        }
        jsonResponse(res, { persona: personaRowToJson(row, prompt) });
      } finally {
        db.close();
      }
      return;
    }

    if (req.method === "PATCH") {
      const found = personaFindMdPath(name);
      if (!found) { jsonResponse(res, { error: `Persona '${name}' not found` }, 404); return; }
      let updates: Record<string, unknown>;
      try {
        const body = await readBody(req);
        updates = body.length ? (JSON.parse(body.toString("utf-8")) as Record<string, unknown>) : {};
      } catch (e) {
        jsonResponse(res, { error: `Invalid JSON: ${e}` }, 400);
        return;
      }
      const content = readFileSync(found.fpath, "utf-8");
      const { meta: currentMeta, body: currentBody } = personaParseFrontmatter(content);
      const frontmatterFields = new Set(["model", "role", "title", "sex", "congress", "evolves", "avatar_url", "display_name"]);
      for (const field of frontmatterFields) {
        if (field in updates) currentMeta[field] = updates[field];
      }
      const prompt = updates.prompt !== undefined ? String(updates.prompt) : currentBody;
      const newStatus = updates.status !== undefined ? String(updates.status) : found.status;
      if (!["eligible", "meme", "moderator"].includes(newStatus)) {
        jsonResponse(res, { error: `Invalid status '${newStatus}'` }, 400);
        return;
      }
      // No file moves — update status field in frontmatter in place
      if (newStatus !== found.status) {
        currentMeta["status"] = newStatus;
      }
      const newFpath = found.fpath; // file stays in unified agents/ dir
      try {
        personaWriteMd(newFpath, currentMeta, prompt);
      } catch (e) {
        jsonResponse(res, { error: `Failed to write md file: ${e}` }, 500);
        return;
      }
      const db = new Database(PERSONAS_DB_PATH_REST);
      try {
        personaSyncToDb(db, name, currentMeta, newStatus, newFpath);
        const row = db.query("SELECT * FROM personas WHERE name=?").get(name) as Record<string, unknown>;
        jsonResponse(res, { persona: personaRowToJson(row, prompt) });
      } finally {
        db.close();
      }
      return;
    }

    if (req.method === "DELETE") {
      const found = personaFindMdPath(name);
      if (!found) { jsonResponse(res, { error: `Persona '${name}' not found` }, 404); return; }
      try {
        unlinkSync(found.fpath);
      } catch (e) {
        jsonResponse(res, { error: `Failed to remove md file: ${e}` }, 500);
        return;
      }
      const db = new Database(PERSONAS_DB_PATH_REST);
      try {
        db.run("DELETE FROM personas WHERE name=?", [name]);
      } finally {
        db.close();
      }
      jsonResponse(res, { ok: true, deleted: name });
      return;
    }
  }

  // /api/personas/:name/verdict
  const verdictMatch = /^\/api\/personas\/([\w-]+)\/verdict$/.exec(pathname);
  if (verdictMatch && req.method === "POST") {
    const name = verdictMatch[1];
    let data: Record<string, unknown>;
    try {
      const body = await readBody(req);
      data = body.length ? (JSON.parse(body.toString("utf-8")) as Record<string, unknown>) : {};
    } catch (e) {
      jsonResponse(res, { error: `Invalid JSON: ${e}` }, 400);
      return;
    }
    const rawVerdict = String(data.verdict ?? "").toUpperCase();
    if (!["RETIRE", "FIRE", "EVOLVE", "RETAIN"].includes(rawVerdict)) {
      jsonResponse(res, { error: "Invalid verdict — must be RETIRE, EVOLVE, or RETAIN" }, 400);
      return;
    }
    const verdict = rawVerdict === "FIRE" ? "RETIRE" : rawVerdict;  // normalize legacy FIRE
    const dateStr = String(data.date ?? new Date().toISOString().slice(0, 10));
    const now = new Date().toISOString();
    const db = new Database(PERSONAS_DB_PATH_REST);
    try {
      const row = db.query("SELECT * FROM personas WHERE name=?").get(name) as Record<string, unknown> | null;
      if (!row) { jsonResponse(res, { error: `Persona '${name}' not found` }, 404); db.close(); return; }
      if (verdict === "RETIRE") {
        db.run(`UPDATE personas SET last_verdict=?,last_verdict_date=?,times_retired=times_retired+1,status='meme',updated_at=? WHERE name=?`, [verdict, dateStr, now, name]);
        // Update status in frontmatter — safe regex sub avoids lossy
        // parseFrontmatter/buildFrontmatter round-trip that destroys
        // multi-line YAML fields (traits, values, avoid, etc.)
        const mdPath = join(AGENTS_UNIFIED_REST, `${name}.md`);
        if (existsSync(mdPath)) {
          try {
            const content = readFileSync(mdPath, "utf-8");
            const updated = content.replace(/^status:\s*\S+\s*$/m, "status: meme");
            writeFileSync(mdPath, updated, "utf-8");
          } catch { /* non-fatal */ }
        }
        db.run("UPDATE personas SET md_path=? WHERE name=?", [mdPath, name]);
      } else if (verdict === "EVOLVE") {
        db.run(`UPDATE personas SET last_verdict=?,last_verdict_date=?,times_evolved=times_evolved+1,updated_at=? WHERE name=?`, [verdict, dateStr, now, name]);
      } else {
        db.run(`UPDATE personas SET last_verdict=?,last_verdict_date=?,updated_at=? WHERE name=?`, [verdict, dateStr, now, name]);
      }
      jsonResponse(res, { ok: true });
    } finally {
      db.close();
    }
    return;
  }

  jsonResponse(res, { error: "Not found" }, 404);
}

// ── Commons traces ─────────────────────────────────────────────────────────

const TRACES_DB_PATH = "/mnt/data/clunger/traces.db";
const TRACES_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const VALID_TRACE_TYPES = new Set(["footprint", "tree_mark", "note"]);

function getTracesDb(): InstanceType<typeof Database> {
  const db = new Database(TRACES_DB_PATH);
  db.run(`CREATE TABLE IF NOT EXISTS commons_chat_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_user TEXT NOT NULL,
    persona_name TEXT NOT NULL,
    user_prompt TEXT NOT NULL,
    persona_response TEXT NOT NULL,
    tile_x INTEGER,
    tile_y INTEGER,
    created_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS persona_traces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_name TEXT NOT NULL,
    trace_type TEXT NOT NULL,
    tile_x INTEGER NOT NULL,
    tile_y INTEGER NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS traces_persona_time ON persona_traces(persona_name, created_at)`);
  // Auto-expire traces older than 7 days
  db.run(`DELETE FROM persona_traces WHERE created_at < ?`, [Date.now() - TRACES_MAX_AGE_MS]);
  return db;
}

async function restHandleCommons(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string
): Promise<void> {
  // POST /api/commons/trace — record a trace
  if (pathname === "/api/commons/trace" && req.method === "POST") {
    let data: Record<string, unknown>;
    try {
      const body = await readBody(req);
      data = body.length ? (JSON.parse(body.toString("utf-8")) as Record<string, unknown>) : {};
    } catch (e) {
      jsonResponse(res, { error: `Invalid JSON: ${e}` }, 400);
      return;
    }
    const personaName = String(data.persona_name ?? "").trim();
    const traceType = String(data.trace_type ?? "").trim();
    const tileX = typeof data.tile_x === "number" ? Math.floor(data.tile_x) : parseInt(String(data.tile_x ?? ""), 10);
    const tileY = typeof data.tile_y === "number" ? Math.floor(data.tile_y) : parseInt(String(data.tile_y ?? ""), 10);
    const content = String(data.content ?? "").slice(0, 500);
    if (!personaName) {
      jsonResponse(res, { error: "persona_name is required" }, 400);
      return;
    }
    if (!VALID_TRACE_TYPES.has(traceType)) {
      jsonResponse(res, { error: `trace_type must be one of: ${[...VALID_TRACE_TYPES].join(", ")}` }, 400);
      return;
    }
    if (isNaN(tileX) || isNaN(tileY)) {
      jsonResponse(res, { error: "tile_x and tile_y must be numbers" }, 400);
      return;
    }
    const db = getTracesDb();
    try {
      const now = Date.now();
      const oneMinuteAgo = now - 60_000;
      // Rate-limit: max 3 footprints per persona per minute
      if (traceType === "footprint") {
        const recentRow = db.query<{ cnt: number }, [string, string, number]>(
          "SELECT COUNT(*) as cnt FROM persona_traces WHERE persona_name=? AND trace_type=? AND created_at > ?"
        ).get(personaName, "footprint", oneMinuteAgo);
        if ((recentRow?.cnt ?? 0) >= 3) {
          jsonResponse(res, { ok: false, error: "rate_limited", message: "max 3 footprints per persona per minute" }, 429);
          db.close();
          return;
        }
      }
      const result = db.run(
        "INSERT INTO persona_traces (persona_name, trace_type, tile_x, tile_y, content, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [personaName, traceType, tileX, tileY, content, now]
      );
      jsonResponse(res, { ok: true, id: result.lastInsertRowid });
    } catch (e) {
      jsonResponse(res, { error: `Trace insert failed: ${e}` }, 500);
    } finally {
      db.close();
    }
    return;
  }

  // GET /api/commons/traces — return all traces from last 7 days
  if (pathname === "/api/commons/traces" && req.method === "GET") {
    const db = getTracesDb();
    try {
      const cutoff = Date.now() - TRACES_MAX_AGE_MS;
      const now = Date.now();
      const rows = db.query<{
        id: number;
        persona_name: string;
        trace_type: string;
        tile_x: number;
        tile_y: number;
        content: string;
        created_at: number;
      }, [number]>(
        "SELECT id, persona_name, trace_type, tile_x, tile_y, content, created_at FROM persona_traces WHERE created_at >= ? ORDER BY created_at DESC"
      ).all(cutoff);
      const traces = rows.map((r) => ({ ...r, age_ms: now - r.created_at }));
      jsonResponse(res, { traces });
    } catch (e) {
      jsonResponse(res, { error: `Traces fetch failed: ${e}` }, 500);
    } finally {
      db.close();
    }
    return;
  }

  // GET /api/commons/chat-log — return last 50 persona interactions (auth required)
  if (pathname === "/api/commons/chat-log" && req.method === "GET") {
    if (!restIsAuthed(req)) {
      jsonResponse(res, { error: "Unauthorized" }, 401);
      return;
    }
    const db = getTracesDb();
    try {
      const rows = db.query<{
        id: number;
        github_user: string;
        persona_name: string;
        user_prompt: string;
        persona_response: string;
        tile_x: number | null;
        tile_y: number | null;
        created_at: number;
      }, []>(
        "SELECT id, github_user, persona_name, user_prompt, persona_response, tile_x, tile_y, created_at FROM commons_chat_log ORDER BY created_at DESC LIMIT 50"
      ).all();
      jsonResponse(res, { log: rows });
    } catch (e) {
      jsonResponse(res, { error: `Chat log fetch failed: ${e}` }, 500);
    } finally {
      db.close();
    }
    return;
  }

  jsonResponse(res, { error: "Not found" }, 404);
}

// ── Voting ─────────────────────────────────────────────────────────────────

// ConnectRPC adapter — routes is a callback that registers services
const connectHandler = connectNodeAdapter({
  routes(router) {
    router.service(PersonaService, personaServiceImpl);
    router.service(AgentService, agentServiceImpl);
    router.service(TaskService, taskServiceImpl);
    router.service(WalletService, walletServiceImpl);
    router.service(CongressService, congressServiceImpl);
  },
});

// ── CommonsV2 bundle (built at startup) ───────────────────────────────────────
let commonsV2Bundle: string | null = null;
let commonsV2BundleError: string | null = null;
let commonsV2BuildToken: string = String(Date.now());

async function buildCommonsV2Bundle(): Promise<void> {
  const result = await Bun.build({
    entrypoints: ["/mnt/data/commons-client/src/main.ts"],
    target: "browser",
    format: "esm",
    minify: false,
  });
  if (!result.success) {
    const msgs = result.logs.map((l) => l.message).join("\n");
    commonsV2BundleError = `Bundle failed:\n${msgs}`;
    throw new Error(commonsV2BundleError);
  }
  const [output] = result.outputs;
  commonsV2Bundle = await output.text();
  commonsV2BuildToken = String(Date.now());
  console.log(`[commons-v2] client bundle built (${Math.round(commonsV2Bundle.length / 1024)}KB), token=${commonsV2BuildToken}`);
}

// Build CommonsV2 bundle at startup — don't block server start on failure
buildCommonsV2Bundle().catch((err) => {
  console.error("[commons-v2] bundle build failed at startup:", err);
});

function buildCommonsV2HTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Commons V2</title>
  <link rel="stylesheet" href="https://clung.us/sitenav.css">
  <script src="https://clung.us/sitenav.js" defer></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #111;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      font-family: monospace;
      color: #ccc;
    }
    #game-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      padding: 16px;
    }
    #game-wrapper {
      position: relative;
    }
    #game-canvas {
      display: block;
      border: 1px solid #333;
      image-rendering: pixelated;
    }
    #v2-badge {
      position: absolute;
      top: 6px;
      right: 8px;
      font-size: 10px;
      color: #7eb8f7;
      opacity: 0.7;
      pointer-events: none;
    }
    #error-banner {
      margin-top: 12px;
      color: #e74c3c;
      font-size: 12px;
      max-width: 1000px;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div id="game-container">
  <div id="game-wrapper">
    <canvas id="game-canvas" width="1000" height="700"></canvas>
    <div id="v2-badge">CommonsV2</div>
  </div>
  <div id="error-banner"></div>
  </div>
  <script>
    // CommonsV2 connects to /commons-ws on the same host (proxied by clunger)
    window.__COMMONS_WS_BASE = location.protocol === "https:" ? "wss://" + location.host : "ws://" + location.host;
    window.addEventListener("error", (e) => {
      document.getElementById("error-banner").textContent = "JS Error: " + e.message + " (" + e.filename + ":" + e.lineno + ")";
    });
    window.addEventListener("unhandledrejection", (e) => {
      document.getElementById("error-banner").textContent = "Unhandled: " + e.reason;
    });
  </script>
  <script src="https://clung.us/sprites-batch1.js"></script>
  <script src="https://clung.us/sprites-batch2.js"></script>
  <script src="https://clung.us/sprites-batch3.js"></script>
  <script type="module" src="/commons-v2/__bundle/main.js?v=${commonsV2BuildToken}"></script>
</body>
</html>`;
}

// Static file serving
const STATIC_DIR = "/mnt/data/hello-world/static";
const HTML_DIR = "/mnt/data/hello-world";

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
};

function serveStaticFile(res: http.ServerResponse, filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const ext = extname(filePath).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  let data: Buffer;
  try {
    data = readFileSync(filePath);
  } catch {
    return false;
  }
  const headers: Record<string, string> = { "Content-Type": mime };
  if (ext === ".html" || ext === ".js" || ext === ".css") {
    headers["Cache-Control"] = "no-cache";
  }
  res.writeHead(200, headers);
  res.end(data);
  return true;
}

// ── Folded: inject service (was port 9876) ─────────────────────────────────
// Forwards POST /inject to the omni gateway. Secret-authenticated.

const OMNI_INJECT_URL = "http://127.0.0.1:8085/webhooks/bigclungus-main";
const INJECT_SECRET = process.env.DISCORD_INJECT_SECRET ?? "";
const INJECT_MAX_RETRIES = 3;
const INJECT_RETRY_DELAY_MS = 600;

async function handleInject(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (INJECT_SECRET) {
    const providedSecret = (req.headers["x-inject-secret"] as string) ?? "";
    if (providedSecret !== INJECT_SECRET) {
      res.writeHead(401, { "Content-Type": "text/plain" });
      res.end("Unauthorized");
      return;
    }
  }

  let body: { content?: string; user?: string; chat_id?: string };
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw.toString("utf-8")) as { content?: string; user?: string; chat_id?: string };
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request: invalid JSON");
    return;
  }

  const { content, user } = body;
  if (!content) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request: missing content");
    return;
  }

  console.log(`[inject] proxying message from=${user ?? "(unknown)"} content="${content.slice(0, 80)}${content.length > 80 ? "..." : ""}"`);

  const omniPayload = { content, user };
  let lastErr = "";
  let omniRes: Response | null = null;

  for (let attempt = 1; attempt <= INJECT_MAX_RETRIES; attempt++) {
    try {
      omniRes = await fetch(OMNI_INJECT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(omniPayload),
        signal: AbortSignal.timeout(10_000),
      });
      if (omniRes.ok) break;
      lastErr = `omni responded ${omniRes.status}`;
      console.warn(`[inject] attempt ${attempt}/${INJECT_MAX_RETRIES}: ${lastErr}`);
      if (attempt < INJECT_MAX_RETRIES) await new Promise((r) => setTimeout(r, INJECT_RETRY_DELAY_MS * attempt));
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      console.warn(`[inject] attempt ${attempt}/${INJECT_MAX_RETRIES}: request failed: ${lastErr}`);
      if (attempt < INJECT_MAX_RETRIES) await new Promise((r) => setTimeout(r, INJECT_RETRY_DELAY_MS * attempt));
    }
  }

  if (!omniRes) {
    console.error(`[inject] all ${INJECT_MAX_RETRIES} attempts failed: ${lastErr}`);
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`Bad Gateway: ${lastErr}`);
    return;
  }

  const responseText = await omniRes.text();
  console.log(`[inject] omni responded ${omniRes.status}`);
  const ct = omniRes.headers.get("Content-Type") ?? "text/plain";
  res.writeHead(omniRes.status, { "Content-Type": ct });
  res.end(responseText);
}

// ── Folded: temporal-proxy service (was port 8234) ─────────────────────────
// Auth proxy for the Temporal dev server at :8233. Requires tauth_github cookie.

const TEMPORAL_UPSTREAM = "http://localhost:8233";
const TEMPORAL_LOGIN_URL = "https://clung.us/auth/github?next=https://temporal.clung.us";
const TEMPORAL_HOP_BY_HOP = new Set([
  "connection", "transfer-encoding", "te", "trailers",
  "upgrade", "proxy-authorization", "proxy-authenticate", "keep-alive",
  "content-encoding", "content-length",
]);

async function handleTemporalProxy(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!restIsAuthed(req)) {
    res.writeHead(302, { Location: TEMPORAL_LOGIN_URL });
    res.end();
    return;
  }

  const rawPath = req.url ?? "/";
  const targetUrl = TEMPORAL_UPSTREAM + rawPath;

  const forwardHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (k.toLowerCase() === "host") continue;
    if (TEMPORAL_HOP_BY_HOP.has(k.toLowerCase())) continue;
    forwardHeaders[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
  }
  forwardHeaders["X-Forwarded-For"] = req.socket.remoteAddress ?? "";
  forwardHeaders["X-Forwarded-Host"] = req.headers["host"] ?? "";

  try {
    const body = await readBody(req);
    const upstreamResp = await fetch(targetUrl, {
      method: req.method ?? "GET",
      headers: forwardHeaders,
      body: body.length > 0 ? body : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    } as RequestInit);

    const respHeaders: Record<string, string> = {};
    upstreamResp.headers.forEach((v, k) => {
      if (!TEMPORAL_HOP_BY_HOP.has(k.toLowerCase())) respHeaders[k] = v;
    });

    const respBody = Buffer.from(await upstreamResp.arrayBuffer());
    res.writeHead(upstreamResp.status, respHeaders);
    res.end(respBody);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED") || msg.includes("connect")) {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Temporal upstream unreachable");
    } else {
      res.writeHead(504, { "Content-Type": "text/plain" });
      res.end(`Upstream error: ${msg}`);
    }
  }
}

// ── Folded: labs-router service (was port 8083) ────────────────────────────
// Discovers lab experiments from lab.json manifests and proxies labs.clung.us/<name>/.

const LABS_DIR = "/mnt/data/labs";

interface LabManifest {
  name: string;
  title: string;
  description: string;
  port: number;
  status: string;
}

const LABS_NAV_INJECT = `<link rel="stylesheet" href="https://clung.us/sitenav.css">
<style>
/* labs-router nav override: pin nav to top across all body layouts */
nav.sitenav {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  max-width: none !important;
  box-sizing: border-box !important;
  z-index: 9999 !important;
}
/* push page content below the fixed nav (nav is ~37px tall) */
body { padding-top: 48px !important; }
</style>
<script src="https://clung.us/sitenav.js" defer></script>`;

async function labsDiscoverLabs(): Promise<LabManifest[]> {
  const { readdir, readFile } = await import("fs/promises");
  const labs: LabManifest[] = [];
  let entries: string[];
  try {
    entries = await readdir(LABS_DIR);
  } catch {
    return labs;
  }
  for (const entry of entries) {
    const manifestPath = join(LABS_DIR, entry, "lab.json");
    try {
      const raw = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(raw) as LabManifest;
      if (manifest.status === "active") labs.push(manifest);
    } catch {
      // No lab.json or invalid — skip
    }
  }
  return labs;
}

function labsInjectNav(html: string): string {
  const headClose = html.match(/<\/head>/i);
  if (headClose) return html.replace(headClose[0], LABS_NAV_INJECT + "\n" + headClose[0]);
  const bodyTag = html.match(/<body[^>]*>/i);
  if (bodyTag) return html.replace(bodyTag[0], LABS_NAV_INJECT + "\n" + bodyTag[0]);
  return LABS_NAV_INJECT + html;
}

function labsRenderIndex(labs: LabManifest[]): string {
  const items =
    labs.length === 0
      ? `<p style="color:#666">No active labs yet. Run <code>new-lab.sh &lt;name&gt;</code> to create one.</p>`
      : labs.map((lab) => `
    <div class="lab">
      <a href="/${lab.name}/">${lab.title}</a>
      <p>${lab.description}</p>
    </div>`).join("\n");

  return labsInjectNav(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>labs.clung.us</title>
  <style>
    body { font-family: monospace; max-width: 720px; margin: 0 auto; padding: 48px 20px 20px; background: #0d0d0d; color: #e0e0e0; }
    h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
    .subtitle { color: #666; margin-bottom: 2rem; font-size: 0.9rem; }
    .lab { border: 1px solid #222; padding: 14px 18px; margin-bottom: 12px; border-radius: 4px; }
    .lab a { color: #7eb8f7; text-decoration: none; font-size: 1rem; font-weight: bold; }
    .lab a:hover { text-decoration: underline; }
    .lab p { margin: 6px 0 0; color: #999; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>labs.clung.us</h1>
  <p class="subtitle">active experiments — ${labs.length} running</p>
  ${items}
</body>
</html>`);
}

async function handleLabsRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://labs.clung.us");
  const pathname = url.pathname;

  if (pathname === "/" || pathname === "") {
    const labs = await labsDiscoverLabs();
    const html = labsRenderIndex(labs);
    const buf = Buffer.from(html, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": buf.length });
    res.end(buf);
    return;
  }

  const parts = pathname.split("/").filter(Boolean);
  const labName = parts[0];
  const subpath = "/" + parts.slice(1).join("/") + (pathname.endsWith("/") && parts.length > 1 ? "/" : "");

  const labs = await labsDiscoverLabs();
  const lab = labs.find((l) => l.name === labName);

  if (!lab) {
    const html = labsInjectNav(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:monospace;padding:40px;background:#0d0d0d;color:#e0e0e0">
      <h2>404 — lab not found</h2>
      <p>No active lab named <code>${labName}</code>.</p>
      <p><a href="/" style="color:#7eb8f7">← back to index</a></p>
    </body></html>`);
    const buf = Buffer.from(html, "utf-8");
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Content-Length": buf.length });
    res.end(buf);
    return;
  }

  const targetUrl = `http://127.0.0.1:${lab.port}${(subpath || "/") + url.search}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(", "));
  }
  headers.set("X-Forwarded-For", "127.0.0.1");
  headers.set("X-Lab-Name", lab.name);
  headers.set("X-Lab-Base-Path", `/${lab.name}`);

  let reqBody: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    reqBody = (await readBody(req)).buffer as ArrayBuffer;
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method ?? "GET",
      headers,
      body: reqBody,
      signal: AbortSignal.timeout(30_000),
    });

    const contentType = upstream.headers.get("content-type") ?? "";
    const isHtml = contentType.includes("text/html");

    if (!isHtml) {
      const upstreamBuf = Buffer.from(await upstream.arrayBuffer());
      const responseHeaders: Record<string, string> = {};
      upstream.headers.forEach((v, k) => { responseHeaders[k] = v; });
      res.writeHead(upstream.status, responseHeaders);
      res.end(upstreamBuf);
      return;
    }

    const html = await upstream.text();
    const modified = labsInjectNav(html);
    const modifiedBuf = Buffer.from(modified, "utf-8");
    const responseHeaders: Record<string, string> = {};
    upstream.headers.forEach((v, k) => {
      if (k.toLowerCase() !== "content-length" && k.toLowerCase() !== "content-encoding") {
        responseHeaders[k] = v;
      }
    });
    responseHeaders["content-type"] = "text/html; charset=utf-8";
    responseHeaders["content-length"] = String(modifiedBuf.length);
    res.writeHead(upstream.status, responseHeaders);
    res.end(modifiedBuf);
  } catch (err) {
    console.error(`[labs-router] proxy error for lab ${labName}: ${err}`);
    const html = labsInjectNav(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:monospace;padding:40px;background:#0d0d0d;color:#e0e0e0">
      <h2>502 — lab unreachable</h2>
      <p>Lab <code>${labName}</code> is registered but not responding on port ${lab.port}.</p>
      <p><a href="/" style="color:#7eb8f7">← back to index</a></p>
    </body></html>`);
    const buf = Buffer.from(html, "utf-8");
    res.writeHead(502, { "Content-Type": "text/html; charset=utf-8", "Content-Length": buf.length });
    res.end(buf);
  }
}

const server = http.createServer(async (req, res) => {
  try {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const host = (req.headers["host"] ?? "").split(":")[0].toLowerCase();

  // ── labs.clung.us — labs router ────────────────────────────────────────────
  if (host === "labs.clung.us") {
    await handleLabsRequest(req, res);
    return;
  }

  // ── temporal.clung.us — Temporal auth proxy ────────────────────────────────
  if (host === "temporal.clung.us") {
    await handleTemporalProxy(req, res);
    return;
  }

  // ── /chat — Clungcord proxy ───────────────────────────────────────────────
  if (pathname === "/chat") {
    res.writeHead(301, { Location: "/chat/" });
    res.end();
    return;
  }
  if (pathname.startsWith("/chat/")) {
    const subpath = pathname.slice("/chat".length);
    const targetUrl = `http://127.0.0.1:8120${subpath}${url.search}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(", "));
    }
    headers.set("X-Forwarded-For", "127.0.0.1");
    headers.delete("host");

    let reqBody: ArrayBuffer | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      reqBody = (await readBody(req)).buffer as ArrayBuffer;
    }

    try {
      const upstream = await fetch(targetUrl, {
        method: req.method ?? "GET",
        headers,
        body: reqBody,
        signal: AbortSignal.timeout(30_000),
      });
      const upstreamBuf = Buffer.from(await upstream.arrayBuffer());
      const responseHeaders: Record<string, string> = {};
      upstream.headers.forEach((v, k) => { responseHeaders[k] = v; });
      // Fix content-length for proxied responses
      delete responseHeaders["content-encoding"];
      responseHeaders["content-length"] = String(upstreamBuf.length);
      res.writeHead(upstream.status, responseHeaders);
      res.end(upstreamBuf);
    } catch (err) {
      console.error(`[chat-proxy] proxy error: ${err}`);
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Clungcord unreachable");
    }
    return;
  }

  // ConnectRPC routes — identified by service package prefix
  if (
    pathname.startsWith("/persona.v1.") ||
    pathname.startsWith("/agent.v1.") ||
    pathname.startsWith("/task.v1.") ||
    pathname.startsWith("/wallet.v1.") ||
    pathname.startsWith("/congress.v1.")
  ) {
    return connectHandler(req, res);
  }

  // Auth: GitHub OAuth initiation
  if (pathname === "/auth/github") {
    const clientId = process.env.GITHUB_CLIENT_ID ?? "";
    if (!clientId) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("GITHUB_CLIENT_ID not configured");
      return;
    }
    const nextUrl = url.searchParams.get("next") ?? "";
    const state = randomBytes(16).toString("base64url");
    oauthStates.set(state, nextUrl);
    // Prune if store grows too large
    if (oauthStates.size > 100) {
      const oldest = [...oauthStates.keys()].slice(0, 50);
      for (const k of oldest) oauthStates.delete(k);
    }
    const redirectUri = "https://clung.us/auth/callback";
    const ghUrl =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&scope=read:user` +
      `&state=${encodeURIComponent(state)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;
    res.writeHead(302, {
      Location: ghUrl,
      "Set-Cookie": `gh_oauth_state=${state}; Max-Age=600; HttpOnly; SameSite=Lax; Path=/`,
    });
    res.end();
    return;
  }

  // Auth: GitHub OAuth callback
  if (pathname === "/auth/callback") {
    await handleGithubCallback(req, res, url);
    return;
  }

  // GitHub webhook
  if (pathname === "/webhook/github" && req.method === "POST") {
    await handleGithubWebhook(req, res);
    return;
  }

  // Folded inject endpoint — POST /inject
  if (pathname === "/inject" && req.method === "POST") {
    await handleInject(req, res);
    return;
  }

  // REST API routes
  if (pathname.startsWith("/api/")) {
    // GET /api/tasks — auth required
    if (pathname === "/api/tasks" && req.method === "GET") {
      if (!restIsAuthed(req)) { jsonResponse(res, { error: "Forbidden: authentication required" }, 403); return; }
      restServeTasks(res, url.searchParams);
      return;
    }

    // GET /api/tasks/stats — auth required
    if (pathname === "/api/tasks/stats" && req.method === "GET") {
      if (!restIsAuthed(req)) { jsonResponse(res, { error: "Forbidden: authentication required" }, 403); return; }
      restServeTaskStats(res);
      return;
    }

    // GET /api/tasks/:id — auth required
    const taskDetailMatch = /^\/api\/tasks\/([a-zA-Z0-9_-]+)$/.exec(pathname);
    if (taskDetailMatch && req.method === "GET") {
      if (!restIsAuthed(req)) { jsonResponse(res, { error: "Forbidden: authentication required" }, 403); return; }
      restServeTaskDetail(res, taskDetailMatch[1]);
      return;
    }

    // GET /api/me — returns current authenticated GitHub username (401 if not authed)
    if (pathname === "/api/me" && req.method === "GET") {
      const user = getGithubUser(req);
      if (user === "anonymous") {
        jsonResponse(res, { error: "Not authenticated" }, 401);
      } else {
        jsonResponse(res, { username: user });
      }
      return;
    }

    // GET /api/agents — public
    if (pathname === "/api/agents" && req.method === "GET") {
      restServeAgents(res);
      return;
    }

    // GET /api/subagents — list current session subagent output files (public)
    if (pathname === "/api/subagents" && req.method === "GET") {
      restServeSubagents(res);
      return;
    }

    // GET /api/subagents/stream?path=<encoded-path> — SSE tail of an output file (public)
    if (pathname === "/api/subagents/stream" && req.method === "GET") {
      const outputPath = url.searchParams.get("path") ?? "";
      await restStreamSubagent(req, res, outputPath);
      return;
    }

    // POST /api/agents/spawn — internal; no auth (localhost only)
    if (pathname === "/api/agents/spawn" && req.method === "POST") {
      await restHandleAgentSpawn(req, res);
      return;
    }

    // POST /api/agents/:id/complete — new path-based endpoint (internal)
    {
      const m = pathname.match(/^\/api\/agents\/([^/]+)\/complete$/);
      if (m && req.method === "POST") {
        await restHandleAgentComplete(req, res, m[1]);
        return;
      }
    }

    // POST /api/agents/:id/heartbeat — internal; no auth (localhost only)
    {
      const m = pathname.match(/^\/api\/agents\/([^/]+)\/heartbeat$/);
      if (m && req.method === "POST") {
        await restHandleAgentHeartbeat(res, m[1]);
        return;
      }
    }

    // POST /api/agents/:id/events — internal; no auth (localhost only)
    // GET  /api/agents/:id/events — public
    {
      const m = pathname.match(/^\/api\/agents\/([^/]+)\/events$/);
      if (m && req.method === "POST") {
        await restHandleAgentEventPost(req, res, m[1]);
        return;
      }
      if (m && req.method === "GET") {
        restHandleAgentEventGet(res, m[1]);
        return;
      }
    }

    // POST /api/agents/complete — deprecated alias (ID in body); kept for backward compat
    if (pathname === "/api/agents/complete" && req.method === "POST") {
      await restHandleAgentComplete(req, res);
      return;
    }

    // GET /api/congress/identities — public
    if (pathname === "/api/congress/identities" && req.method === "GET") {
      restServeCongressIdentities(res);
      return;
    }

    // GET /api/congress/sessions — public
    if (pathname === "/api/congress/sessions" && req.method === "GET") {
      restServeCongressSessions(res);
      return;
    }

    // GET /api/congress/matrix — pre-computed participation matrix data
    if (pathname === "/api/congress/matrix" && req.method === "GET") {
      restServeCongressMatrix(res);
      return;
    }

    // GET /api/congress/sessions/:id — public; PATCH — auth required
    const sessionMatch = /^\/api\/congress\/sessions\/((?:congress|trial|session)-\d+)$/.exec(pathname);
    if (sessionMatch) {
      if (req.method === "GET") {
        restServeCongressSession(res, sessionMatch[1]);
        return;
      }
      if (req.method === "PATCH") {
        if (!restIsAuthed(req) && !isInternalRequest(req)) { jsonResponse(res, { error: "Forbidden: authentication required" }, 403); return; }
        await restPatchCongressSession(req, res, sessionMatch[1]);
        return;
      }
    }

    // GET /api/wallet/balance — auth required
    if (pathname === "/api/wallet/balance" && req.method === "GET") {
      if (!restIsAuthed(req)) { jsonResponse(res, { error: "Forbidden: authentication required" }, 403); return; }
      await restServeWalletBalance(res);
      return;
    }

    // GET /api/congress/stream — native SSE
    if (pathname === "/api/congress/stream" && req.method === "GET") {
      const sessionId = url.searchParams.get("session_id") ?? "";
      restStreamCongress(req, res, sessionId);
      return;
    }

    // POST /api/congress — native congress debate handler
    if (pathname === "/api/congress" && req.method === "POST") {
      await restPostCongress(req, res);
      return;
    }

    // GET /api/congress/active — check for an in-progress congress session
    if (pathname === "/api/congress/active" && req.method === "GET") {
      restServeCongressActive(res);
      return;
    }

    // GET /api/congress/tracking — public dashboard of verdict tracking
    if (pathname === "/api/congress/tracking" && req.method === "GET") {
      const filter = url.searchParams.get("filter") ?? undefined;
      restServeCongressTracking(res, filter);
      return;
    }

    // POST /api/congress/tracking — insert/upsert a verdict tracking record (internal only)
    if (pathname === "/api/congress/tracking" && req.method === "POST") {
      if (!isInternalRequest(req) && !restIsAuthed(req)) {
        jsonResponse(res, { error: "Forbidden" }, 403);
        return;
      }
      await restPostCongressTrackingRecord(req, res);
      return;
    }

    // PATCH /api/congress/tracking/:session_id — update ack/task status (internal only)
    const trackingPatchMatch = /^\/api\/congress\/tracking\/((?:congress|trial|session)-\d+)$/.exec(pathname);
    if (trackingPatchMatch && req.method === "PATCH") {
      if (!isInternalRequest(req) && !restIsAuthed(req)) {
        jsonResponse(res, { error: "Forbidden" }, 403);
        return;
      }
      await restPatchCongressTracking(req, res, trackingPatchMatch[1]);
      return;
    }

    // POST /api/invoke-persona — invoke a persona by name with a user prompt
    if (pathname === "/api/invoke-persona" && req.method === "POST") {
      await restInvokePersona(req, res);
      return;
    }

    // POST /api/discord/persona — intercept [persona: x] Discord messages, inject [persona-invoke] back
    if (pathname === "/api/discord/persona" && req.method === "POST") {
      await restHandleDiscordPersona(req, res);
      return;
    }

    // /api/personas* — native persona CRUD
    if (pathname.startsWith("/api/personas")) {
      await restHandlePersonas(req, res, pathname);
      return;
    }

    // /api/commons/* — commons traces
    if (pathname.startsWith("/api/commons/")) {
      await restHandleCommons(req, res, pathname);
      return;
    }

    // /api/clungiverse/* — proxy to commons-server on :8090
    if (pathname.startsWith("/api/clungiverse/")) {
      const upstream = `http://localhost:8090${pathname}`;
      const upstreamRes = await fetch(upstream, {
        method: req.method,
        headers: { "Content-Type": "application/json" },
        body: req.method !== "GET" ? (await readBody(req)).toString() : undefined,
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (!upstreamRes) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "commons-server clungiverse endpoint unavailable" }));
        return;
      }
      const data = await upstreamRes.text();
      res.writeHead(upstreamRes.status, { "Content-Type": "application/json" });
      res.end(data);
      return;
    }

    // /api/audition/* — proxy to commons-server on :8090
    if (pathname.startsWith("/api/audition/")) {
      const upstream = `http://localhost:8090${pathname}`;
      const upstreamRes = await fetch(upstream, {
        method: req.method,
        headers: { "Content-Type": "application/json" },
        body: req.method !== "GET" ? (await readBody(req)).toString() : undefined,
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (!upstreamRes) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "commons-server audition endpoint unavailable" }));
        return;
      }
      const data = await upstreamRes.text();
      res.writeHead(upstreamRes.status, { "Content-Type": "application/json" });
      res.end(data);
      return;
    }

    // POST /api/nightowl/complete?task_id=xxx — BigClungus calls when done
    if (pathname === "/api/nightowl/complete" && req.method === "POST") {
      const taskId = url.searchParams.get("task_id");
      if (!taskId) {
        jsonResponse(res, { error: "missing task_id" }, 400);
        return;
      }
      nightowlCleanup();
      const existing = nightowlTasks.get(taskId);
      if (existing) {
        existing.done = true;
      } else {
        nightowlTasks.set(taskId, { done: true, createdAt: Date.now() });
      }
      jsonResponse(res, { ok: true, task_id: taskId });
      return;
    }

    // GET /api/nightowl/status/:task_id — NightOwl polls this
    const nightowlStatusMatch = pathname.match(/^\/api\/nightowl\/status\/(.+)$/);
    if (nightowlStatusMatch && req.method === "GET") {
      const taskId = nightowlStatusMatch[1];
      nightowlCleanup();
      const entry = nightowlTasks.get(taskId);
      jsonResponse(res, { task_id: taskId, done: entry?.done ?? false });
      return;
    }

    // ── Timeline API ──────────────────────────────────────────────────────
    // GET /api/timeline — public (read)
    if (pathname === "/api/timeline" && req.method === "GET") {
      const rows = timelineDb.query("SELECT * FROM timeline_events ORDER BY date ASC").all();
      jsonResponse(res, rows);
      return;
    }

    // POST /api/timeline — auth required (create)
    if (pathname === "/api/timeline" && req.method === "POST") {
      if (!restIsAuthed(req)) {
        jsonResponse(res, { error: "Forbidden: authentication required" }, 403);
        return;
      }
      const body = JSON.parse((await readBody(req)).toString("utf-8"));
      if (!body.date || !body.title) {
        jsonResponse(res, { error: "date and title are required" }, 400);
        return;
      }
      const stmt = timelineDb.query(
        `INSERT INTO timeline_events (date, title, description, category, icon, url, source)
         VALUES ($date, $title, $description, $category, $icon, $url, $source)`
      );
      stmt.run({
        $date: body.date,
        $title: body.title,
        $description: body.description ?? null,
        $category: body.category ?? "milestone",
        $icon: body.icon ?? null,
        $url: body.url ?? null,
        $source: body.source ?? "manual",
      });
      const id = (timelineDb.query("SELECT last_insert_rowid() as id").get() as { id: number }).id;
      const row = timelineDb.query("SELECT * FROM timeline_events WHERE id = ?").get(id);
      jsonResponse(res, row, 201);
      return;
    }

    // PATCH/DELETE /api/timeline/:id — auth required
    const timelineIdMatch = pathname.match(/^\/api\/timeline\/(\d+)$/);
    if (timelineIdMatch && req.method === "PATCH") {
      if (!restIsAuthed(req)) {
        jsonResponse(res, { error: "Forbidden: authentication required" }, 403);
        return;
      }
      const id = parseInt(timelineIdMatch[1], 10);
      const existing = timelineDb.query("SELECT * FROM timeline_events WHERE id = ?").get(id);
      if (!existing) {
        jsonResponse(res, { error: "not found" }, 404);
        return;
      }
      const body = JSON.parse((await readBody(req)).toString("utf-8"));
      const fields: string[] = [];
      const params: Record<string, unknown> = { $id: id };
      for (const col of ["date", "title", "description", "category", "icon", "url", "source"]) {
        if (body[col] !== undefined) {
          fields.push(`${col} = $${col}`);
          params[`$${col}`] = body[col];
        }
      }
      if (fields.length === 0) {
        jsonResponse(res, { error: "no fields to update" }, 400);
        return;
      }
      timelineDb.query(`UPDATE timeline_events SET ${fields.join(", ")} WHERE id = $id`).run(params);
      const updated = timelineDb.query("SELECT * FROM timeline_events WHERE id = ?").get(id);
      jsonResponse(res, updated);
      return;
    }

    // DELETE /api/timeline/:id — auth required
    if (timelineIdMatch && req.method === "DELETE") {
      if (!restIsAuthed(req)) {
        jsonResponse(res, { error: "Forbidden: authentication required" }, 403);
        return;
      }
      const id = parseInt(timelineIdMatch[1], 10);
      const existing = timelineDb.query("SELECT * FROM timeline_events WHERE id = ?").get(id);
      if (!existing) {
        jsonResponse(res, { error: "not found" }, 404);
        return;
      }
      timelineDb.query("DELETE FROM timeline_events WHERE id = ?").run(id);
      jsonResponse(res, { ok: true, id });
      return;
    }
  }

  // ── Cockpit API ───────────────────────────────────────────────────────────
  if (pathname === "/api/cockpit/status" && req.method === "GET") {
    if (!restIsAuthed(req)) { jsonResponse(res, { error: "Forbidden: authentication required" }, 403); return; }
    restCockpitStatus(res);
    return;
  }

  const cockpitLogsMatch = pathname.match(/^\/api\/cockpit\/logs\/([^/]+)$/);
  if (cockpitLogsMatch && req.method === "GET") {
    if (!restIsAuthed(req)) { jsonResponse(res, { error: "Forbidden: authentication required" }, 403); return; }
    restCockpitLogs(res, decodeURIComponent(cockpitLogsMatch[1]));
    return;
  }

  if (pathname === "/api/cockpit/restart" && req.method === "POST") {
    if (!restIsAuthed(req)) { jsonResponse(res, { error: "Forbidden: authentication required" }, 403); return; }
    await restCockpitRestart(req, res);
    return;
  }

  if (pathname === "/api/cockpit/metrics" && req.method === "GET") {
    if (!restIsAuthed(req)) { jsonResponse(res, { error: "Forbidden: authentication required" }, 403); return; }
    restCockpitMetrics(res);
    return;
  }

  if (pathname === "/api/cockpit/containers" && req.method === "GET") {
    if (!restIsAuthed(req)) { jsonResponse(res, { error: "Forbidden: authentication required" }, 403); return; }
    restCockpitContainers(res);
    return;
  }

  if (pathname === "/api/cockpit/schedules" && req.method === "GET") {
    if (!restIsAuthed(req)) { jsonResponse(res, { error: "Forbidden: authentication required" }, 403); return; }
    restCockpitSchedules(res);
    return;
  }

  // ── Cockpit page — auth-gated HTML ────────────────────────────────────────
  if ((pathname === "/cockpit" || pathname === "/cockpit/") && (req.method === "GET" || req.method === "HEAD")) {
    if (!restIsAuthed(req)) {
      res.writeHead(302, { Location: `/auth/github?next=${encodeURIComponent("https://clung.us/cockpit")}` });
      res.end();
      return;
    }
    if (serveStaticFile(res, "/mnt/data/hello-world/cockpit.html")) return;
  }

  // Redirect legacy /commons-vote → /refinery
  if (pathname === "/commons-vote") {
    res.writeHead(301, { Location: "/refinery" });
    res.end();
    return;
  }

  // CommonsV2 routes
  if (pathname === "/commons-v2" || pathname === "/commons-v2/") {
    const html = buildCommonsV2HTML();
    const buf = Buffer.from(html, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": buf.length });
    res.end(buf);
    return;
  }
  if (pathname === "/commons-v2/__bundle/main.js") {
    if (commonsV2BundleError) {
      const errBody = `// Bundle error:\n// ${commonsV2BundleError}`;
      res.writeHead(500, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(errBody);
      return;
    }
    if (!commonsV2Bundle) {
      res.writeHead(503, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end("// Bundle not yet built — retry in a moment");
      return;
    }
    const buf = Buffer.from(commonsV2Bundle, "utf-8");
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Content-Length": buf.length,
      "Cache-Control": "no-cache",
    });
    res.end(buf);
    return;
  }

  // Static file serving
  if (req.method === "GET" || req.method === "HEAD") {
    // Try /static/ directory first
    const staticPath = join(STATIC_DIR, pathname === "/" ? "index.html" : pathname);
    if (serveStaticFile(res, staticPath)) return;

    // Try HTML root
    const htmlPath = join(HTML_DIR, pathname === "/" ? "index.html" : pathname);
    if (serveStaticFile(res, htmlPath)) return;

    // Try appending .html for extensionless paths
    if (!extname(pathname)) {
      if (serveStaticFile(res, join(HTML_DIR, pathname + ".html"))) return;
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[clunger] unhandled error in request handler:", msg);
    if (!res.headersSent) {
      jsonResponse(res, { error: msg }, 500);
    }
  }
});

// ── Commons multiplayer WebSocket ─────────────────────────────────────────────

// ── Server-side Warthog state ─────────────────────────────────────────────────
interface WarthogSeat {
  name: string;
  socketId: string;
  color: string;
}

interface WarthogState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: string;
  seats: (WarthogSeat | null)[];
}

const warthogState: WarthogState = {
  x: 600,
  y: 350,
  vx: 0,
  vy: 0,
  facing: "right",
  seats: [null, null, null, null],
};

function broadcastWarthog(): void {
  const payload = JSON.stringify({ type: "warthog_state", warthog: warthogState });
  for (const [, client] of commonsClients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

interface CommonsPlayer {
  id: string;
  socket_id: string;
  x: number;
  y: number;
  px: number;
  py: number;
  name: string;
  color: string;
  facing: string;
  isAway: boolean;
  ts: number;
}

// ── Server-side NPC state ──────────────────────────────────────────────────────
interface CommonsNPC {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: string;
  dirTimer: number;
}

const NPC_NAMES = [
  "chairman", "critic", "architect", "ux", "designer",
  "galactus", "hume", "otto", "pm", "spengler",
  "trump", "uncle-bob", "bloodfeast", "adelbert", "jhaddu",
  "morgan", "the-kid",
];

const COMMONS_W = 1000;
const COMMONS_H = 700;
const COMMONS_NPC_SPEED = 35; // px per tick (500ms) — ~70px/s, crosses 1000px canvas in ~14s

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

const commonsNpcs: CommonsNPC[] = NPC_NAMES.map((name) => ({
  id: name,
  name,
  x: randomInRange(50, COMMONS_W - 50),
  y: randomInRange(50, COMMONS_H - 50),
  vx: (Math.random() - 0.5) * COMMONS_NPC_SPEED * 2,
  vy: (Math.random() - 0.5) * COMMONS_NPC_SPEED * 2,
  facing: Math.random() < 0.5 ? "left" : "right",
  dirTimer: Math.floor(Math.random() * 16),
}));

function tickNpcs(): void {
  for (const npc of commonsNpcs) {
    // Occasionally change direction
    npc.dirTimer--;
    if (npc.dirTimer <= 0) {
      npc.vx = (Math.random() - 0.5) * COMMONS_NPC_SPEED * 2;
      npc.vy = (Math.random() - 0.5) * COMMONS_NPC_SPEED * 2;
      npc.dirTimer = 8 + Math.floor(Math.random() * 8); // 4–8 seconds before turning again
    }

    // Update position
    npc.x += npc.vx;
    npc.y += npc.vy;

    // Bounce off walls
    if (npc.x < 10) { npc.x = 10; npc.vx = Math.abs(npc.vx); }
    if (npc.x > COMMONS_W - 10) { npc.x = COMMONS_W - 10; npc.vx = -Math.abs(npc.vx); }
    if (npc.y < 10) { npc.y = 10; npc.vy = Math.abs(npc.vy); }
    if (npc.y > COMMONS_H - 10) { npc.y = COMMONS_H - 10; npc.vy = -Math.abs(npc.vy); }

    // Update facing based on vx
    if (Math.abs(npc.vx) > 0.5) {
      npc.facing = npc.vx > 0 ? "right" : "left";
    }
  }

  // Broadcast NPC positions to all clients
  const payload = JSON.stringify({
    type: "npc_update",
    npcs: commonsNpcs.map((n) => ({
      id: n.id,
      name: n.name,
      x: Math.round(n.x),
      y: Math.round(n.y),
      facing: n.facing,
    })),
  });
  for (const [, client] of commonsClients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

// Start NPC tick every 500ms
setInterval(tickNpcs, 500);

const commonsPlayers = new Map<string, CommonsPlayer>();
const commonsClients = new Map<string, { ws: WebSocket; lastMove: number }>();

const commonsWss = new WebSocketServer({ noServer: true });

commonsWss.on("connection", (ws: WebSocket, _req: http.IncomingMessage) => {
  const id = randomBytes(8).toString("hex");
  commonsClients.set(id, { ws, lastMove: 0 });

  // Send welcome message with unique socket_id
  ws.send(JSON.stringify({ type: "welcome", socket_id: id }));

  // Send current warthog state to newly connected client
  ws.send(JSON.stringify({ type: "warthog_state", warthog: warthogState }));

  ws.on("message", (raw: Buffer) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString("utf-8")) as Record<string, unknown>;
    } catch {
      return; // ignore malformed
    }

    if (msg.type === "hop") {
      // Broadcast hop to all other clients
      const hopPayload = JSON.stringify({ type: "player_hop", socket_id: String(msg.socket_id ?? id) });
      for (const [cid, client] of commonsClients) {
        if (cid !== id && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(hopPayload);
        }
      }
      return;
    }

    if (msg.type === "player_status") {
      // Update away status for this player
      const existing = commonsPlayers.get(id);
      if (existing) {
        existing.isAway = msg.status === "away";
        broadcastCommons();
      }
      return;
    }

    if (msg.type === "warthog_update") {
      // Only accept from driver (seat 0 must be this socket)
      const seat0 = warthogState.seats[0];
      if (!seat0 || seat0.socketId !== id) return;
      if (typeof msg.x === "number") warthogState.x = msg.x;
      if (typeof msg.y === "number") warthogState.y = msg.y;
      if (typeof msg.vx === "number") warthogState.vx = msg.vx;
      if (typeof msg.vy === "number") warthogState.vy = msg.vy;
      if (typeof msg.facing === "string") warthogState.facing = msg.facing;
      broadcastWarthog();
      return;
    }

    if (msg.type === "warthog_join") {
      const seatIndex = typeof msg.seatIndex === "number" ? msg.seatIndex : -1;
      if (seatIndex < 0 || seatIndex >= 4) return;
      if (warthogState.seats[seatIndex] !== null) return; // seat taken
      const playerName = String(msg.playerName ?? "visitor").slice(0, 32);
      const playerColor = String(msg.playerColor ?? "#ffffff").slice(0, 12);
      warthogState.seats[seatIndex] = { name: playerName, socketId: id, color: playerColor };
      broadcastWarthog();
      return;
    }

    if (msg.type === "warthog_leave") {
      for (let i = 0; i < warthogState.seats.length; i++) {
        const seat = warthogState.seats[i];
        if (seat && seat.socketId === id) {
          warthogState.seats[i] = null;
          break;
        }
      }
      broadcastWarthog();
      return;
    }

    if (msg.type !== "move") return;

    const client = commonsClients.get(id);
    if (!client) return;

    const now = Date.now();
    if (now - client.lastMove < 50) return; // throttle: ignore moves faster than 50ms
    client.lastMove = now;

    const x = typeof msg.x === "number" ? Math.round(msg.x) : 0;
    const y = typeof msg.y === "number" ? Math.round(msg.y) : 0;
    const px = typeof msg.px === "number" ? msg.px : x * 20 + 10;
    const py = typeof msg.py === "number" ? msg.py : y * 20 + 10;
    const name = String(msg.name ?? "visitor").slice(0, 32);
    const color = String(msg.color ?? "#ffffff").slice(0, 12);
    const facing = String(msg.facing ?? "right");
    const socketId = String(msg.socket_id ?? id);
    const isAway = commonsPlayers.get(id)?.isAway ?? false;

    commonsPlayers.set(id, { id, socket_id: socketId, x, y, px, py, name, color, facing, isAway, ts: now });
    broadcastCommons();
  });

  ws.on("close", () => {
    commonsClients.delete(id);
    commonsPlayers.delete(id);
    // Evict any warthog seats held by this socket
    let warthogChanged = false;
    for (let i = 0; i < warthogState.seats.length; i++) {
      const seat = warthogState.seats[i];
      if (seat && seat.socketId === id) {
        warthogState.seats[i] = null;
        warthogChanged = true;
      }
    }
    broadcastCommons();
    if (warthogChanged) broadcastWarthog();
  });

  ws.on("error", (err: Error) => {
    console.error("[commons-ws] client error:", err.message);
    commonsClients.delete(id);
    commonsPlayers.delete(id);
    // Evict any warthog seats held by this socket
    for (let i = 0; i < warthogState.seats.length; i++) {
      const seat = warthogState.seats[i];
      if (seat && seat.socketId === id) {
        warthogState.seats[i] = null;
      }
    }
  });
});

function broadcastCommons() {
  // Evict stale players (no update in 15s)
  const cutoff = Date.now() - 15_000;
  for (const [pid, p] of commonsPlayers) {
    if (p.ts < cutoff) commonsPlayers.delete(pid);
  }

  const players: Record<string, CommonsPlayer> = {};
  for (const [pid, p] of commonsPlayers) players[pid] = p;
  const payload = JSON.stringify({ type: "players", players });

  for (const [, client] of commonsClients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

// ── Commons-server WebSocket proxy (/commons-ws → localhost:8090/ws) ──────────
const commonsProxyWss = new WebSocketServer({ noServer: true });

commonsProxyWss.on("connection", (clientWs: WebSocket, req: http.IncomingMessage) => {
  // Forward query params (userId, name, color) to commons-server
  const incomingUrl = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const params = incomingUrl.searchParams.toString();
  const backendUrl = `ws://localhost:8090/ws${params ? "?" + params : ""}`;

  const backendWs = new WebSocket(backendUrl);

  backendWs.on("open", () => {
    // Pipe messages from client → backend
    clientWs.on("message", (data) => {
      if (backendWs.readyState === WebSocket.OPEN) {
        backendWs.send(data);
      }
    });
  });

  // Pipe messages from backend → client
  backendWs.on("message", (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data);
    }
  });

  backendWs.on("close", (code, reason) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code, reason);
    }
  });

  backendWs.on("error", (err) => {
    console.error("[commons-proxy] backend error:", err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, "backend error");
    }
  });

  clientWs.on("close", () => {
    if (backendWs.readyState === WebSocket.OPEN || backendWs.readyState === WebSocket.CONNECTING) {
      backendWs.close();
    }
  });

  clientWs.on("error", (err) => {
    console.error("[commons-proxy] client error:", err.message);
    backendWs.close();
  });
});

// ── Chat WebSocket proxy (/chat/ws → localhost:8120/ws) ─────────────────────
const chatProxyWss = new WebSocketServer({ noServer: true });

chatProxyWss.on("connection", (clientWs: WebSocket, req: http.IncomingMessage) => {
  const cookieHeader = req.headers.cookie ?? "";
  const backendUrl = `ws://127.0.0.1:8120/ws`;
  const backendWs = new WebSocket(backendUrl, { headers: { cookie: cookieHeader } });

  backendWs.on("open", () => {
    clientWs.on("message", (data) => {
      if (backendWs.readyState === WebSocket.OPEN) {
        backendWs.send(data);
      }
    });
  });

  backendWs.on("message", (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      // Forward as text so the browser receives a string, not a Blob
      clientWs.send(isBinary ? data.toString("utf-8") : data);
    }
  });

  backendWs.on("close", (code, reason) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code, reason);
    }
  });

  backendWs.on("error", (err) => {
    console.error("[chat-proxy] backend ws error:", err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, "backend error");
    }
  });

  clientWs.on("close", () => {
    if (backendWs.readyState === WebSocket.OPEN || backendWs.readyState === WebSocket.CONNECTING) {
      backendWs.close();
    }
  });

  clientWs.on("error", (err) => {
    console.error("[chat-proxy] client ws error:", err.message);
    backendWs.close();
  });
});

// ── Dungeon WebSocket proxy (/dungeon-ws → localhost:8090/dungeon-ws) ─────────
const dungeonProxyWss = new WebSocketServer({ noServer: true });

dungeonProxyWss.on("connection", (clientWs: WebSocket, req: http.IncomingMessage) => {
  const incomingUrl = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const params = incomingUrl.searchParams.toString();
  const backendUrl = `ws://localhost:8090/dungeon-ws${params ? "?" + params : ""}`;

  const backendWs = new WebSocket(backendUrl);

  backendWs.on("open", () => {
    clientWs.on("message", (data) => {
      if (backendWs.readyState === WebSocket.OPEN) {
        backendWs.send(data);
      }
    });
  });

  backendWs.on("message", (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data);
    }
  });

  backendWs.on("close", (code, reason) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code, reason);
    }
  });

  backendWs.on("error", (err) => {
    console.error("[dungeon-proxy] backend error:", err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, "backend error");
    }
  });

  clientWs.on("close", () => {
    if (backendWs.readyState === WebSocket.OPEN || backendWs.readyState === WebSocket.CONNECTING) {
      backendWs.close();
    }
  });

  clientWs.on("error", (err) => {
    console.error("[dungeon-proxy] client error:", err.message);
    backendWs.close();
  });
});

// Handle WebSocket upgrade requests
server.on("upgrade", (req: http.IncomingMessage, socket, head) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/commons-ws") {
    commonsProxyWss.handleUpgrade(req, socket, head, (ws) => {
      commonsProxyWss.emit("connection", ws, req);
    });
  } else if (url.pathname === "/api/commons/ws") {
    commonsWss.handleUpgrade(req, socket, head, (ws) => {
      commonsWss.emit("connection", ws, req);
    });
  } else if (url.pathname === "/chat/ws") {
    chatProxyWss.handleUpgrade(req, socket, head, (ws) => {
      chatProxyWss.emit("connection", ws, req);
    });
  } else if (url.pathname === "/dungeon-ws") {
    dungeonProxyWss.handleUpgrade(req, socket, head, (ws) => {
      dungeonProxyWss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`clunger listening on :${PORT}`);

  // Log which LLM providers are available at startup
  const providers: string[] = [];
  if (process.env.ANTHROPIC_API_KEY) providers.push("claude(sdk)");
  providers.push("claude(cli)"); // always available via OAuth
  if (process.env.XAI_API_KEY) providers.push("grok");
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) providers.push("gemini(key)");
  if (existsSync("/usr/local/bin/gemini")) providers.push("gemini(cli)");
  console.log(`[clunger] LLM providers available: ${providers.join(", ")}`);
  const missingProviders: string[] = [];
  if (!process.env.XAI_API_KEY) {
    console.warn("[clunger] WARNING: XAI_API_KEY not set — grok personas will fail");
    missingProviders.push("grok (XAI_API_KEY missing)");
  }
  if (!existsSync("/usr/local/bin/gemini")) {
    console.warn("[clunger] WARNING: gemini CLI not found at /usr/local/bin/gemini — gemini personas will fail");
    missingProviders.push("gemini (CLI not found at /usr/local/bin/gemini)");
  }
  if (missingProviders.length > 0) {
    injectAlert(`clunger startup: unavailable LLM providers — ${missingProviders.join(", ")}. Personas using these models will fail.`).catch(() => {});
  }
});
