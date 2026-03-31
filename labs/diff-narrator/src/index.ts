import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";

const LAB_NAME = "diff-narrator";
const PORT = 8101;

const db = new Database(`/mnt/data/labs/${LAB_NAME}/data.db`);
db.run(`
  CREATE TABLE IF NOT EXISTS verdicts (
    id TEXT PRIMARY KEY,
    left_text TEXT NOT NULL,
    right_text TEXT NOT NULL,
    diff TEXT NOT NULL,
    narrative TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )
`);

// Purge expired rows on startup
db.run(`DELETE FROM verdicts WHERE expires_at < ${Math.floor(Date.now() / 1000)}`);

async function generateDiff(left: string, right: string): Promise<string> {
  const proc = Bun.spawn(
    ["bash", "-c", `diff -u <(echo "$LEFT") <(echo "$RIGHT") || true`],
    {
      env: { ...process.env, LEFT: left, RIGHT: right },
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return output.trim();
}

async function narrateDiff(diff: string): Promise<string> {
  const prompt = `You are analyzing a unified diff. The user pasted two versions of some text and wants to understand what changed.

Here is the unified diff (lines starting with - were removed, lines starting with + were added, context lines have a space, @@ markers show line positions):

${diff || "(no differences — the two texts are identical)"}

Please write a clear plain-English explanation covering:
1. **What changed** — the specific content that was added, removed, or modified
2. **What stayed the same on purpose** — notable things that were kept unchanged (if relevant)
3. **What the author probably intended** — the likely goal or motivation behind these changes
4. **Any risks introduced** — potential issues, regressions, or things to watch out for (if any)

Be concise and direct. Speak to a developer or writer who wants to understand the edit at a glance.`;

  // Try Anthropic SDK first
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const block = msg.content[0];
    if (block.type !== "text") throw new Error("Unexpected response block type from Anthropic API");
    return block.text;
  }

  // Fall back to claude CLI
  const cliProc = Bun.spawn(
    ["claude", "-p", prompt, "--output-format", "text"],
    {
      stdin: new TextEncoder().encode(""),
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const cliOut = await new Response(cliProc.stdout).text();
  const exitCode = await cliProc.exited;
  if (exitCode !== 0) {
    const errText = await new Response(cliProc.stderr).text();
    throw new Error(`claude CLI exited with code ${exitCode}: ${errText}`);
  }
  return cliOut.trim();
}

function renderDiffHtml(diff: string): string {
  if (!diff) return `<div class="diff-empty">No differences found — the texts are identical.</div>`;
  const lines = diff.split("\n");
  const rendered = lines.map((line) => {
    const cls = line.startsWith("+") ? "add" : line.startsWith("-") ? "rem" : line.startsWith("@") ? "hunk" : "ctx";
    const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<div class="diff-line ${cls}">${escaped}</div>`;
  });
  return rendered.join("\n");
}

function renderMarkdownish(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^#{1,3}\s+(.+)$/gm, "<strong>$1</strong>");
}

function buildHTML(base: string): string { return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Diff Narrator</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0d0d0d;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 0 0 80px;
    }
    header {
      padding: 32px 40px 24px;
      border-bottom: 1px solid #222;
    }
    header h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
    header p { margin-top: 6px; color: #888; font-size: 0.9rem; }
    .workspace {
      max-width: 1400px;
      margin: 0 auto;
      padding: 32px 40px;
    }
    .editors {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 20px;
    }
    @media (max-width: 800px) {
      .editors { grid-template-columns: 1fr; }
      header, .workspace { padding-left: 20px; padding-right: 20px; }
    }
    .editor-box label {
      display: block;
      font-size: 0.78rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #666;
      margin-bottom: 8px;
    }
    textarea {
      width: 100%;
      height: 320px;
      background: #111;
      border: 1px solid #2a2a2a;
      border-radius: 6px;
      color: #e0e0e0;
      font-family: "JetBrains Mono", "Fira Code", monospace;
      font-size: 0.83rem;
      line-height: 1.6;
      padding: 14px;
      resize: vertical;
      outline: none;
      transition: border-color 0.15s;
    }
    textarea:focus { border-color: #444; }
    .actions { display: flex; gap: 12px; align-items: center; margin-bottom: 32px; }
    button#narrate-btn {
      background: #4a7cf7;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 10px 28px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    button#narrate-btn:hover { background: #3a6ae6; }
    button#narrate-btn:disabled { background: #2a2a2a; color: #555; cursor: not-allowed; }
    #status { font-size: 0.85rem; color: #666; }
    .result { display: none; }
    .result.visible { display: block; }
    .result-section { margin-bottom: 28px; }
    .result-section h2 {
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #555;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #1e1e1e;
    }
    .narrative {
      background: #111;
      border: 1px solid #222;
      border-radius: 6px;
      padding: 20px 24px;
      line-height: 1.75;
      font-size: 0.93rem;
      white-space: pre-wrap;
    }
    .narrative strong { color: #7eb8f7; }
    .diff-view {
      background: #0a0a0a;
      border: 1px solid #222;
      border-radius: 6px;
      overflow: auto;
      font-family: "JetBrains Mono", "Fira Code", monospace;
      font-size: 0.8rem;
      line-height: 1.55;
    }
    .diff-line { padding: 1px 16px; white-space: pre; }
    .diff-line.add { background: #0d2b14; color: #6fcf97; }
    .diff-line.rem { background: #2b0d0d; color: #eb5757; }
    .diff-line.hunk { color: #888; background: #141414; }
    .diff-line.ctx { color: #666; }
    .diff-empty { padding: 20px; color: #555; font-style: italic; }
    .permalink { font-size: 0.82rem; color: #555; }
    .permalink a { color: #4a7cf7; text-decoration: none; }
    .permalink a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <header>
    <h1>Diff Narrator</h1>
    <p>Paste two versions of anything. Get a plain-English explanation of what changed and why.</p>
  </header>
  <div class="workspace">
    <div class="editors">
      <div class="editor-box">
        <label for="left">Before</label>
        <textarea id="left" placeholder="Paste the original version here\u2026" spellcheck="false"></textarea>
      </div>
      <div class="editor-box">
        <label for="right">After</label>
        <textarea id="right" placeholder="Paste the new version here\u2026" spellcheck="false"></textarea>
      </div>
    </div>
    <div class="actions">
      <button id="narrate-btn">Narrate &rarr;</button>
      <span id="status"></span>
    </div>
    <div class="result" id="result">
      <div class="result-section">
        <h2>Narrative</h2>
        <div class="narrative" id="narrative"></div>
      </div>
      <div class="result-section">
        <h2>Diff</h2>
        <div class="diff-view" id="diff-view"></div>
      </div>
      <p class="permalink" id="permalink"></p>
    </div>
  </div>
  <script>
    const btn = document.getElementById('narrate-btn');
    const status = document.getElementById('status');
    const result = document.getElementById('result');
    const narrativeEl = document.getElementById('narrative');
    const diffViewEl = document.getElementById('diff-view');
    const permalinkEl = document.getElementById('permalink');

    function renderMarkdownish(text) {
      return text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
        .replace(/^#{1,3}\\s+(.+)$/gm, function(_, t) { return '<strong>' + t + '</strong>'; });
    }

    btn.addEventListener('click', async () => {
      const left = document.getElementById('left').value;
      const right = document.getElementById('right').value;
      if (!left.trim() && !right.trim()) {
        status.textContent = 'Paste some text into at least one box.';
        return;
      }
      btn.disabled = true;
      status.textContent = 'Narrating\u2026';
      result.classList.remove('visible');
      try {
        const res = await fetch('${base}/api/narrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ left, right }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(err);
        }
        const data = await res.json();
        narrativeEl.innerHTML = renderMarkdownish(data.narrative);
        diffViewEl.innerHTML = data.diffHtml;
        permalinkEl.innerHTML = 'Permalink: <a href="${base}/d/' + data.id + '">${base}/d/' + data.id + '</a>';
        result.classList.add('visible');
        status.textContent = '';
      } catch (e) {
        status.textContent = 'Error: ' + e.message;
      } finally {
        btn.disabled = false;
      }
    });
  </script>
</body>
</html>`; }

function permalinkPage(id: string, narrative: string, diff: string, createdAt: number, base: string): string {
  const date = new Date(createdAt * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Diff Narrator &mdash; ${id}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0d0d0d; color: #e0e0e0; min-height: 100vh; padding: 0 0 80px; }
    header { padding: 32px 40px 24px; border-bottom: 1px solid #222; }
    header h1 { font-size: 1.5rem; font-weight: 700; }
    header p { margin-top: 6px; color: #666; font-size: 0.82rem; }
    .workspace { max-width: 900px; margin: 0 auto; padding: 32px 40px; }
    @media (max-width: 600px) { header, .workspace { padding-left: 20px; padding-right: 20px; } }
    .result-section { margin-bottom: 28px; }
    .result-section h2 { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #1e1e1e; }
    .narrative { background: #111; border: 1px solid #222; border-radius: 6px; padding: 20px 24px; line-height: 1.75; font-size: 0.93rem; white-space: pre-wrap; }
    .narrative strong { color: #7eb8f7; }
    .diff-view { background: #0a0a0a; border: 1px solid #222; border-radius: 6px; overflow: auto; font-family: monospace; font-size: 0.8rem; line-height: 1.55; }
    .diff-line { padding: 1px 16px; white-space: pre; }
    .diff-line.add { background: #0d2b14; color: #6fcf97; }
    .diff-line.rem { background: #2b0d0d; color: #eb5757; }
    .diff-line.hunk { color: #888; background: #141414; }
    .diff-line.ctx { color: #666; }
    .diff-empty { padding: 20px; color: #555; font-style: italic; }
    a { color: #4a7cf7; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <header>
    <h1>Diff Narrator</h1>
    <p>Saved on ${date} &mdash; <a href="${base}/">narrate another diff</a></p>
  </header>
  <div class="workspace">
    <div class="result-section">
      <h2>Narrative</h2>
      <div class="narrative">${renderMarkdownish(narrative)}</div>
    </div>
    <div class="result-section">
      <h2>Diff</h2>
      <div class="diff-view">${renderDiffHtml(diff)}</div>
    </div>
  </div>
</body>
</html>`;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Base path injected by the labs-router (e.g. "/diff-narrator").
    // Falls back to "" so the lab also works when run directly without the router.
    const base = req.headers.get("X-Lab-Base-Path") ?? "";

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(buildHTML(base), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (url.pathname === "/api/narrate" && req.method === "POST") {
      let body: { left: string; right: string };
      try {
        body = await req.json();
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }
      const left = (body.left ?? "").toString();
      const right = (body.right ?? "").toString();

      let diff: string;
      try {
        diff = await generateDiff(left, right);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return new Response(`Failed to generate diff: ${msg}`, { status: 500 });
      }

      let narrative: string;
      try {
        narrative = await narrateDiff(diff);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return new Response(`Failed to generate narrative: ${msg}`, { status: 500 });
      }

      const id = randomUUID().replace(/-/g, "").slice(0, 12);
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + 7 * 24 * 60 * 60;

      db.run(
        `INSERT INTO verdicts (id, left_text, right_text, diff, narrative, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, left, right, diff, narrative, now, expiresAt]
      );

      return new Response(
        JSON.stringify({ id, narrative, diff, diffHtml: renderDiffHtml(diff) }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const permalinkMatch = url.pathname.match(/^\/d\/([a-f0-9]{12})$/);
    if (permalinkMatch) {
      const id = permalinkMatch[1];
      const row = db.query<{ narrative: string; diff: string; created_at: number }, [string, number]>(
        `SELECT narrative, diff, created_at FROM verdicts WHERE id = ? AND expires_at > ?`
      ).get(id, Math.floor(Date.now() / 1000));
      if (!row) {
        return new Response("Not found or expired", { status: 404 });
      }
      return new Response(permalinkPage(id, row.narrative, row.diff, row.created_at, base), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`${LAB_NAME} lab listening on port ${PORT}`);
