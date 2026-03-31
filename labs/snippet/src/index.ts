import { Database } from "bun:sqlite";

const LAB_NAME = "snippet";
const PORT = 8103;

const db = new Database(`/mnt/data/labs/${LAB_NAME}/data.db`);
db.run(`
  CREATE TABLE IF NOT EXISTS snippets (
    id TEXT PRIMARY KEY,
    title TEXT,
    language TEXT,
    content TEXT,
    created_at INTEGER,
    view_count INTEGER DEFAULT 0
  )
`);

const LANGUAGES = [
  "text", "javascript", "typescript", "python", "bash",
  "sql", "json", "yaml", "go", "rust", "html", "css", "markdown"
];

function randomId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) {
    id += chars[b % chars.length];
  }
  return id;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const langOptions = LANGUAGES.map(l =>
  `<option value="${l}">${l}</option>`
).join("\n");

function homePage(base: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Snippet — paste &amp; share</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f0f10;
      color: #e0e0e0;
      margin: 0;
      padding: 24px 16px;
      min-height: 100vh;
    }
    .container { max-width: 860px; margin: 0 auto; }
    h1 { font-size: 1.4rem; margin: 0 0 4px; color: #fff; }
    .tagline { color: #888; font-size: 0.9rem; margin: 0 0 24px; }
    .row { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
    input[type=text] {
      flex: 1;
      min-width: 200px;
      background: #1a1a1e;
      border: 1px solid #333;
      color: #e0e0e0;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.95rem;
    }
    select {
      background: #1a1a1e;
      border: 1px solid #333;
      color: #e0e0e0;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.95rem;
    }
    textarea {
      width: 100%;
      height: 420px;
      background: #141416;
      border: 1px solid #333;
      color: #e8e8e8;
      padding: 14px;
      border-radius: 6px;
      font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
      font-size: 0.88rem;
      line-height: 1.6;
      resize: vertical;
      tab-size: 2;
    }
    textarea:focus, input:focus, select:focus {
      outline: none;
      border-color: #4a9eff;
    }
    button {
      background: #4a9eff;
      color: #fff;
      border: none;
      padding: 10px 28px;
      border-radius: 6px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    button:hover { background: #2f84e8; }
    .actions { display: flex; justify-content: flex-end; margin-top: 12px; }
    .error { color: #f87171; margin-top: 12px; font-size: 0.9rem; display: none; }
  </style>
</head>
<body>
<div class="container">
  <h1>snippet</h1>
  <p class="tagline">Paste and share code or text with syntax highlighting and a short link.</p>
  <form id="form">
    <div class="row">
      <input type="text" id="title" placeholder="Title (optional)" maxlength="200">
      <select id="language">${langOptions}</select>
    </div>
    <textarea id="content" placeholder="Paste your code or text here..." spellcheck="false" autofocus></textarea>
    <div class="actions">
      <button type="submit" id="btn">Share</button>
    </div>
    <div class="error" id="error"></div>
  </form>
</div>
<script>
document.getElementById('form').addEventListener('submit', async e => {
  e.preventDefault();
  const content = document.getElementById('content').value.trim();
  if (!content) return;
  const btn = document.getElementById('btn');
  btn.disabled = true;
  btn.textContent = 'Sharing...';
  const err = document.getElementById('error');
  err.style.display = 'none';
  try {
    const res = await fetch('${base}/api/snippet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: document.getElementById('title').value.trim(),
        language: document.getElementById('language').value,
        content,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');
    window.location.href = data.url;
  } catch (ex) {
    err.textContent = ex.message;
    err.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Share';
  }
});
document.getElementById('content').addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const ta = e.target;
    const s = ta.selectionStart, end = ta.selectionEnd;
    ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = s + 2;
  }
});
</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

interface SnippetRow {
  id: string;
  title: string | null;
  language: string;
  content: string;
  created_at: number;
  view_count: number;
}

function viewPage(row: SnippetRow, baseUrl: string, base: string): Response {
  const title = row.title ? escapeHtml(row.title) : "Untitled";
  const lang = escapeHtml(row.language || "text");
  const content = escapeHtml(row.content);
  const rawUrl = `${baseUrl}/raw/${row.id}`;
  const created = new Date(row.created_at * 1000).toUTCString();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} -- snippet</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"><\/script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f0f10;
      color: #e0e0e0;
      margin: 0;
      padding: 24px 16px;
      min-height: 100vh;
    }
    .container { max-width: 960px; margin: 0 auto; }
    .header { margin-bottom: 16px; }
    .title { font-size: 1.3rem; font-weight: 700; color: #fff; margin: 0 0 6px; }
    .meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 0.82rem; color: #888; }
    .badge {
      background: #1e3a5f;
      color: #7eb8f7;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 0.78rem;
    }
    .actions { display: flex; gap: 8px; margin-bottom: 12px; }
    .btn {
      background: #1a1a1e;
      border: 1px solid #333;
      color: #e0e0e0;
      padding: 6px 14px;
      border-radius: 5px;
      font-size: 0.85rem;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
    }
    .btn:hover { border-color: #4a9eff; color: #7eb8f7; }
    .code-wrap {
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #2a2a2e;
    }
    pre { margin: 0; overflow-x: auto; }
    pre code {
      font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace !important;
      font-size: 0.875rem !important;
      line-height: 1.65 !important;
      padding: 20px !important;
    }
    .new-link { color: #4a9eff; text-decoration: none; font-size: 0.85rem; }
    .new-link:hover { text-decoration: underline; }
    .footer { margin-top: 20px; }
    #copy-msg { color: #4ade80; font-size: 0.8rem; margin-left: 6px; opacity: 0; transition: opacity 0.3s; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="title">${title}</div>
    <div class="meta">
      <span class="badge">${lang}</span>
      <span>${row.view_count} view${row.view_count === 1 ? "" : "s"}</span>
      <span>${created}</span>
    </div>
  </div>
  <div class="actions">
    <button class="btn" id="copy-btn">Copy</button>
    <span id="copy-msg">Copied!</span>
    <a class="btn" href="${rawUrl}">Raw</a>
  </div>
  <div class="code-wrap">
    <pre><code id="code" class="language-${lang}">${content}</code></pre>
  </div>
  <div class="footer">
    <a class="new-link" href="${base}/">+ New snippet</a>
  </div>
</div>
<script>
hljs.highlightElement(document.getElementById('code'));
document.getElementById('copy-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('code').innerText).then(() => {
    const msg = document.getElementById('copy-msg');
    msg.style.opacity = '1';
    setTimeout(() => msg.style.opacity = '0', 1800);
  });
});
<\/script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const baseUrl = `${url.protocol}//${url.host}`;

    // Base path injected by the labs-router (e.g. "/snippet").
    // Falls back to "" so the lab also works when run directly without the router.
    const base = req.headers.get("X-Lab-Base-Path") ?? "";

    if (req.method === "GET" && (path === "/" || path === "")) {
      return homePage(base);
    }

    if (req.method === "POST" && path === "/api/snippet") {
      let body: { title?: string; language?: string; content?: string };
      try {
        body = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
          status: 400, headers: { "Content-Type": "application/json" }
        });
      }

      const content = (body.content ?? "").trim();
      if (!content) {
        return new Response(JSON.stringify({ error: "Content is required" }), {
          status: 400, headers: { "Content-Type": "application/json" }
        });
      }

      const lang = LANGUAGES.includes(body.language ?? "") ? (body.language ?? "text") : "text";
      const title = (body.title ?? "").trim().slice(0, 200) || null;

      let id = randomId();
      let attempts = 0;
      while (db.query("SELECT 1 FROM snippets WHERE id = ?").get(id) && attempts < 10) {
        id = randomId();
        attempts++;
      }

      db.run(
        "INSERT INTO snippets (id, title, language, content, created_at) VALUES (?, ?, ?, ?, ?)",
        [id, title, lang, content, Math.floor(Date.now() / 1000)]
      );

      return new Response(JSON.stringify({ id, url: `${base}/s/${id}` }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    }

    const viewMatch = path.match(/^\/s\/([A-Za-z0-9]{6})$/);
    if (req.method === "GET" && viewMatch) {
      const id = viewMatch[1];
      const row = db.query("SELECT * FROM snippets WHERE id = ?").get(id) as SnippetRow | null;
      if (!row) {
        return new Response("Snippet not found", { status: 404 });
      }
      db.run("UPDATE snippets SET view_count = view_count + 1 WHERE id = ?", [id]);
      row.view_count += 1;
      return viewPage(row, baseUrl, base);
    }

    const rawMatch = path.match(/^\/raw\/([A-Za-z0-9]{6})$/);
    if (req.method === "GET" && rawMatch) {
      const id = rawMatch[1];
      const row = db.query("SELECT content FROM snippets WHERE id = ?").get(id) as { content: string } | null;
      if (!row) {
        return new Response("Snippet not found", { status: 404 });
      }
      return new Response(row.content, {
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`${LAB_NAME} lab listening on port ${PORT}`);
