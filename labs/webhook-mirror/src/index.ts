import { Database } from "bun:sqlite";
import { randomBytes } from "crypto";

const LAB_NAME = "webhook-mirror";
const PORT = 8102;
const BASE_PATH = `/mnt/data/labs/${LAB_NAME}`;
const ENDPOINT_TTL_S = 86400; // 24 hours

const db = new Database(`${BASE_PATH}/data.db`);
db.run(`CREATE TABLE IF NOT EXISTS endpoints (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
)`);
db.run(`CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  method TEXT NOT NULL,
  headers TEXT NOT NULL,
  body TEXT NOT NULL,
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_requests_endpoint ON requests (endpoint_id, ts DESC)`);

function newId(bytes = 4): string {
  return randomBytes(bytes).toString("hex");
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function purgeExpired(): void {
  const t = now();
  const expired = db.query<{ id: string }, number>(
    `SELECT id FROM endpoints WHERE expires_at < ?`
  ).all(t);
  for (const { id } of expired) {
    db.run(`DELETE FROM requests WHERE endpoint_id = ?`, [id]);
  }
  db.run(`DELETE FROM endpoints WHERE expires_at < ?`, [t]);
}

function html(content: string, title = "Webhook Mirror", base = ""): Response {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Webhook Mirror</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      background: #0d0d0d;
      color: #d0d0d0;
      min-height: 100vh;
      padding: 0 0 60px;
    }
    header {
      background: #111;
      border-bottom: 1px solid #222;
      padding: 18px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    header a { text-decoration: none; color: inherit; }
    header .logo { font-size: 1.1rem; font-weight: bold; color: #7eb8f7; }
    header .sub { font-size: 0.78rem; color: #666; }
    main { max-width: 860px; margin: 0 auto; padding: 40px 24px 0; }
    h1 { font-size: 1.5rem; margin-bottom: 12px; color: #eee; }
    h2 { font-size: 1.1rem; margin: 32px 0 12px; color: #bbb; border-bottom: 1px solid #222; padding-bottom: 6px; }
    p { line-height: 1.65; color: #999; margin-bottom: 14px; }
    a { color: #7eb8f7; }
    .code {
      background: #161616;
      border: 1px solid #2a2a2a;
      border-radius: 4px;
      padding: 14px 18px;
      font-size: 0.85rem;
      overflow-x: auto;
      white-space: pre;
      color: #c8e6c9;
      margin-bottom: 20px;
    }
    .btn {
      display: inline-block;
      background: #7eb8f7;
      color: #0d0d0d;
      border: none;
      border-radius: 4px;
      padding: 10px 22px;
      font-size: 0.9rem;
      font-family: inherit;
      cursor: pointer;
      text-decoration: none;
      font-weight: bold;
    }
    .btn:hover { background: #9ecaff; }
    .endpoint-url {
      background: #161616;
      border: 1px solid #2a2a2a;
      border-radius: 4px;
      padding: 12px 16px;
      font-size: 0.9rem;
      color: #7eb8f7;
      word-break: break-all;
      margin: 16px 0;
    }
    .badge {
      display: inline-block;
      border-radius: 3px;
      padding: 2px 7px;
      font-size: 0.75rem;
      font-weight: bold;
      text-transform: uppercase;
      margin-right: 8px;
    }
    .GET    { background: #1a4a1a; color: #6fcf97; }
    .POST   { background: #2a2a00; color: #f2c94c; }
    .PUT    { background: #1a2a4a; color: #56cef2; }
    .DELETE { background: #4a1a1a; color: #eb5757; }
    .PATCH  { background: #2a1a4a; color: #bb86fc; }
    .request-card {
      background: #111;
      border: 1px solid #222;
      border-radius: 4px;
      margin-bottom: 12px;
      overflow: hidden;
    }
    .request-header {
      display: flex;
      align-items: center;
      padding: 10px 14px;
      cursor: pointer;
      user-select: none;
      gap: 10px;
    }
    .request-header:hover { background: #161616; }
    .req-ts { font-size: 0.75rem; color: #555; margin-left: auto; white-space: nowrap; }
    .req-ip { font-size: 0.75rem; color: #444; margin-left: 8px; }
    .request-body {
      border-top: 1px solid #1a1a1a;
      padding: 14px;
      display: none;
    }
    .request-body.open { display: block; }
    .section-label { font-size: 0.72rem; color: #555; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; margin-top: 12px; }
    .section-label:first-child { margin-top: 0; }
    .headers-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    .headers-table td { padding: 3px 8px; border-bottom: 1px solid #1a1a1a; vertical-align: top; }
    .headers-table td:first-child { color: #888; width: 40%; word-break: break-all; }
    .headers-table td:last-child { color: #bbb; word-break: break-all; }
    .body-pre {
      background: #0a0a0a;
      border: 1px solid #1f1f1f;
      border-radius: 3px;
      padding: 10px 12px;
      font-size: 0.8rem;
      white-space: pre-wrap;
      word-break: break-word;
      color: #c8e6c9;
      max-height: 400px;
      overflow-y: auto;
    }
    .empty { color: #444; font-size: 0.85rem; padding: 20px 0; text-align: center; }
    .count-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
      font-size: 0.82rem;
      color: #555;
    }
    .count-bar strong { color: #888; }
    .expires-in { font-size: 0.78rem; color: #4a4a4a; }
    .copy-btn {
      background: none;
      border: 1px solid #333;
      color: #888;
      border-radius: 3px;
      padding: 3px 9px;
      font-family: inherit;
      font-size: 0.75rem;
      cursor: pointer;
    }
    .copy-btn:hover { border-color: #555; color: #bbb; }
  </style>
</head>
<body>
  <header>
    <div>
      <a href="${base}/"><div class="logo">⚡ webhook mirror</div></a>
      <div class="sub">inspect webhook payloads in real time</div>
    </div>
  </header>
  <main>
${content}
  </main>
</body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function landingPage(base: string): Response {
  return html(`
    <h1>Webhook Mirror</h1>
    <p>Get a temporary public URL that captures and displays every HTTP request sent to it.
       Perfect for debugging webhooks, inspecting payloads, and testing integrations.</p>

    <h2>Create a new endpoint</h2>
    <p>Click below to get a unique URL. It stays alive for 24 hours.</p>
    <form method="POST" action="${base}/new" style="margin-bottom:32px">
      <button class="btn" type="submit">Create new endpoint →</button>
    </form>

    <h2>How it works</h2>
    <div class="code">1. Create an endpoint — you get a URL like:
   https://labs.clung.us/webhook-mirror/hook/a1b2c3d4

2. Point your webhook at that URL (any method: POST, PUT, DELETE…)

3. Open the viewer page to see every request — method, headers, body

4. Endpoint auto-expires after 24 hours</div>

    <h2>API</h2>
    <div class="code">POST /new                     → create endpoint, redirect to viewer
GET  /:id                     → viewer page (auto-refreshes every 3s)
POST /hook/:id                → capture a request
PUT  /hook/:id                → capture a request
DELETE /hook/:id              → capture a request
GET  /api/:id/requests        → JSON list of captured requests</div>
  `, "Webhook Mirror", base);
}

function viewerPage(id: string, publicBase: string, base: string): Response {
  const row = db.query<{ created_at: number; expires_at: number }, string>(
    `SELECT created_at, expires_at FROM endpoints WHERE id = ?`
  ).get(id);

  if (!row || row.expires_at < now()) {
    return html(`
      <h1>Endpoint not found</h1>
      <p>This endpoint has expired or never existed.</p>
      <p><a href="${base}/">← Create a new one</a></p>
    `, "Not Found", base);
  }

  const hookUrl = `${publicBase}/hook/${id}`;
  const expiresIn = row.expires_at - now();
  const expiresHours = Math.floor(expiresIn / 3600);
  const expiresMinutes = Math.floor((expiresIn % 3600) / 60);
  const expiresStr = expiresIn > 3600
    ? `${expiresHours}h ${expiresMinutes}m`
    : `${expiresMinutes}m`;

  return html(`
    <h1>Endpoint <code style="font-size:0.9em;color:#7eb8f7">${id}</code></h1>
    <div class="expires-in">Expires in ${expiresStr}</div>

    <h2>Your webhook URL</h2>
    <div class="endpoint-url" id="hook-url">${hookUrl}</div>
    <button class="copy-btn" onclick="navigator.clipboard.writeText('${hookUrl}').then(()=>{this.textContent='copied!';setTimeout(()=>{this.textContent='copy'},1500)})">copy</button>

    <h2>Quick test</h2>
    <div class="code">curl -X POST ${hookUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"hello": "world"}'</div>

    <h2>Captured requests</h2>
    <div class="count-bar">
      <strong id="req-count">—</strong> requests received
      <span style="color:#333">·</span>
      <span>auto-refreshes every 3s</span>
    </div>
    <div id="requests-container"><div class="empty">No requests yet. Send something to the URL above.</div></div>

    <script>
    const endpointId = ${JSON.stringify(id)};
    const BASE_PATH = ${JSON.stringify(base)};
    let lastCount = -1;

    function formatTs(ts) {
      const d = new Date(ts * 1000);
      return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) +
             ' ' + d.toLocaleDateString([], {month:'short',day:'numeric'});
    }

    function prettyBody(body) {
      if (!body || body.trim() === '') return '<span style="color:#444">(empty body)</span>';
      try {
        return JSON.stringify(JSON.parse(body), null, 2);
      } catch {
        return body;
      }
    }

    function methodBadge(method) {
      const m = method.toUpperCase();
      return '<span class="badge ' + m + '">' + m + '</span>';
    }

    function renderRequests(reqs) {
      if (reqs.length === 0) {
        return '<div class="empty">No requests yet. Send something to the URL above.</div>';
      }
      return reqs.map((r, i) => {
        const headersObj = JSON.parse(r.headers);
        const headerRows = Object.entries(headersObj)
          .map(([k,v]) => '<tr><td>' + k + '</td><td>' + v + '</td></tr>')
          .join('');
        return '<div class="request-card">' +
          '<div class="request-header" onclick="toggleCard(this)">' +
            methodBadge(r.method) +
            '<span style="color:#888;font-size:0.85rem">#' + (reqs.length - i) + '</span>' +
            '<span class="req-ts">' + formatTs(r.ts) + '</span>' +
            '<span class="req-ip">' + r.ip + '</span>' +
          '</div>' +
          '<div class="request-body' + (i === 0 ? ' open' : '') + '">' +
            '<div class="section-label">Headers</div>' +
            '<table class="headers-table"><tbody>' + headerRows + '</tbody></table>' +
            '<div class="section-label" style="margin-top:14px">Body</div>' +
            '<pre class="body-pre">' + prettyBody(r.body) + '</pre>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function toggleCard(header) {
      const body = header.nextElementSibling;
      body.classList.toggle('open');
    }

    async function fetchRequests() {
      try {
        const res = await fetch(BASE_PATH + '/api/' + endpointId + '/requests');
        if (!res.ok) return;
        const reqs = await res.json();
        document.getElementById('req-count').textContent = reqs.length;
        if (reqs.length !== lastCount) {
          lastCount = reqs.length;
          document.getElementById('requests-container').innerHTML = renderRequests(reqs);
        }
      } catch(e) {
        console.warn("[webhook-mirror] poll error (transient):", e);
      }
    }

    fetchRequests();
    setInterval(fetchRequests, 3000);
    </script>
  `, `Endpoint ${id}`, base);
}

function getClientIP(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function detectPublicBase(req: Request): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || `localhost:${PORT}`;
  const proto = req.headers.get("x-forwarded-proto") || "http";
  // Use X-Lab-Base-Path injected by the labs-router (e.g. "/webhook-mirror"),
  // falling back to x-forwarded-prefix or "" for direct access.
  const prefix = req.headers.get("X-Lab-Base-Path") || req.headers.get("x-forwarded-prefix") || "";
  return `${proto}://${host}${prefix}`;
}

const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = req.method.toUpperCase();

    // Base path injected by the labs-router (e.g. "/webhook-mirror").
    // Falls back to "" so the lab also works when run directly without the router.
    const base = req.headers.get("X-Lab-Base-Path") ?? "";

    purgeExpired();

    // GET / — landing page
    if (path === "" || path === "/" && method === "GET") {
      return landingPage(base);
    }

    // POST /new — create endpoint
    if (path === "/new" && method === "POST") {
      const id = newId(4);
      const t = now();
      db.run(`INSERT INTO endpoints (id, created_at, expires_at) VALUES (?, ?, ?)`, [id, t, t + ENDPOINT_TTL_S]);
      return new Response(null, {
        status: 302,
        headers: { Location: `${base}/${id}` },
      });
    }

    // GET /api/:id/requests — JSON API
    const apiMatch = path.match(/^\/api\/([0-9a-f]{8})\/requests$/);
    if (apiMatch && method === "GET") {
      const id = apiMatch[1];
      const endpoint = db.query<{ id: string }, string>(
        `SELECT id FROM endpoints WHERE id = ? AND expires_at >= ?`
      ).get(id, now());
      if (!endpoint) {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      const rows = db.query<{
        id: string; method: string; headers: string; body: string; ip: string; ts: number;
      }, string>(
        `SELECT id, method, headers, body, ip, ts FROM requests WHERE endpoint_id = ? ORDER BY ts DESC LIMIT 200`
      ).all(id);
      return new Response(JSON.stringify(rows), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // GET /:id — viewer page
    const viewerMatch = path.match(/^\/([0-9a-f]{8})$/);
    if (viewerMatch && method === "GET") {
      const id = viewerMatch[1];
      const publicBase = detectPublicBase(req);
      return viewerPage(id, publicBase, base);
    }

    // POST|PUT|DELETE /hook/:id — capture request
    const hookMatch = path.match(/^\/hook\/([0-9a-f]{8})$/);
    if (hookMatch && ["POST", "PUT", "DELETE", "PATCH", "GET"].includes(method)) {
      const id = hookMatch[1];
      const endpoint = db.query<{ id: string }, [string, number]>(
        `SELECT id FROM endpoints WHERE id = ? AND expires_at >= ?`
      ).get(id, now());

      if (!endpoint) {
        return new Response(
          JSON.stringify({ error: "endpoint not found or expired" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      // Collect headers (exclude sensitive ones optionally)
      const headersObj: Record<string, string> = {};
      for (const [k, v] of req.headers.entries()) {
        headersObj[k] = v;
      }

      let body = "";
      try {
        body = await req.text();
      } catch (e) {
        console.warn(`[webhook-mirror] failed to read request body: ${e instanceof Error ? e.message : String(e)}`);
        body = "";
      }

      const reqId = newId(8);
      const ip = getClientIP(req);
      db.run(
        `INSERT INTO requests (id, endpoint_id, method, headers, body, ip, ts) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [reqId, id, method, JSON.stringify(headersObj), body, ip, now()]
      );

      return new Response(JSON.stringify({ ok: true, id: reqId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`${LAB_NAME} lab listening on port ${PORT}`);
