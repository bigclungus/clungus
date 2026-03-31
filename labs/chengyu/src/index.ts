import { Database } from "bun:sqlite";

const LAB_NAME = "chengyu";
const PORT = 8109;
const DB_PATH = `/mnt/data/labs/${LAB_NAME}/data.db`;

const db = new Database(DB_PATH);

// Ensure table exists (seed.ts handles population)
db.run(`CREATE TABLE IF NOT EXISTS chengyu (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL,
  pinyin TEXT NOT NULL,
  explanation TEXT NOT NULL,
  derivation TEXT NOT NULL,
  example TEXT NOT NULL,
  abbreviation TEXT NOT NULL
)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_word ON chengyu(word)`);

// Migration: add translation columns
try { db.run(`ALTER TABLE chengyu ADD COLUMN translation_literal TEXT DEFAULT ''`); } catch {}
try { db.run(`ALTER TABLE chengyu ADD COLUMN translation_explanation TEXT DEFAULT ''`); } catch {}

// Load OpenAI key for on-demand translation
const OPENAI_API_KEY = (() => {
  try {
    const env = require("fs").readFileSync("/mnt/data/temporal-workflows/.env", "utf-8");
    const match = env.match(/^OPENAI_API_KEY=(.+)$/m);
    return match?.[1]?.trim() ?? "";
  } catch { return ""; }
})();

async function translateChengyu(word: string, explanation: string): Promise<{ literal: string; explanationEn: string }> {
  if (!OPENAI_API_KEY) throw new Error("No OpenAI API key configured");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: "You translate Chinese chengyu (four-character idioms). Reply ONLY with valid JSON, no markdown."
        },
        {
          role: "user",
          content: `Translate this chengyu. Return JSON: {"literal": "<literal word-by-word meaning in English>", "explanation": "<English translation of the explanation>"}

Chengyu: ${word}
Chinese explanation: ${explanation}`
        }
      ]
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${text}`);
  }

  const data = await resp.json() as { choices: { message: { content: string } }[] };
  const content = data.choices[0]?.message?.content?.trim() ?? "";
  // Strip markdown code fences if present
  const cleaned = content.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned);
  return { literal: parsed.literal ?? "", explanationEn: parsed.explanation ?? "" };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function noExample(s: string): boolean {
  return !s || s.trim() === "无" || s.trim() === "";
}

function wiktionaryLinks(word: string): string {
  const fullUrl = `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`;
  const chars = [...word].filter(c => c.trim());
  const charLinks = chars.map(c =>
    `<a href="https://en.wiktionary.org/wiki/${encodeURIComponent(c)}" class="wikt-char" target="_blank" rel="noopener">${escapeHtml(c)}</a>`
  ).join("");
  return `<span class="wikt-links">
    <a href="${fullUrl}" class="wikt-full" target="_blank" rel="noopener">Wiktionary</a>
    <span class="wikt-chars">${charLinks}</span>
  </span>`;
}

function entryHtml(base: string, e: {
  id: number; word: string; pinyin: string;
  explanation: string; derivation: string; example: string;
  translation_literal?: string; translation_explanation?: string;
}): string {
  const hasTranslation = e.translation_literal || e.translation_explanation;
  return `
    <article class="entry">
      <div class="entry-header">
        <a href="${base}/word/${encodeURIComponent(e.word)}" class="word-link">
          <span class="word">${escapeHtml(e.word)}</span>
        </a>
        <span class="pinyin">${escapeHtml(e.pinyin)}</span>
        ${wiktionaryLinks(e.word)}
      </div>
      ${hasTranslation && e.translation_literal ? `<p class="translation"><span class="label">Literal</span>${escapeHtml(e.translation_literal)}</p>` : ""}
      <p class="explanation">${escapeHtml(e.explanation)}</p>
      ${hasTranslation && e.translation_explanation ? `<p class="translation-en"><span class="label">English</span>${escapeHtml(e.translation_explanation)}</p>` : ""}
      ${!hasTranslation ? `<p class="translate-prompt"><a href="${base}/translate/${encodeURIComponent(e.word)}" class="translate-btn">Translate to English</a></p>` : ""}
      ${!noExample(e.derivation) ? `<p class="derivation"><span class="label">来源</span>${escapeHtml(e.derivation)}</p>` : ""}
      ${!noExample(e.example) ? `<p class="example"><span class="label">例句</span>${escapeHtml(e.example)}</p>` : ""}
    </article>`;
}

function pageHtml(base: string, title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} — 成语 Browser</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Noto Serif CJK SC", "Noto Serif SC", Georgia, serif;
      background: #0f0f0f; color: #e0ddd8;
      min-height: 100vh;
    }
    header {
      background: #1a1a1a; border-bottom: 1px solid #2e2e2e;
      padding: 14px 20px; display: flex; align-items: center; gap: 20px;
      position: sticky; top: 0; z-index: 10;
    }
    header a { text-decoration: none; color: inherit; }
    header .logo { font-size: 1.4rem; color: #d4a843; letter-spacing: .05em; }
    header .subtitle { font-size: .75rem; color: #888; margin-top: 2px; font-family: monospace; }
    form { display: flex; flex: 1; max-width: 420px; gap: 8px; margin-left: auto; }
    input[type=search] {
      flex: 1; padding: 7px 12px; border-radius: 6px;
      border: 1px solid #333; background: #1f1f1f; color: #e0ddd8;
      font-size: .9rem; outline: none;
    }
    input[type=search]:focus { border-color: #d4a843; }
    button {
      padding: 7px 14px; border-radius: 6px; border: none;
      background: #d4a843; color: #0f0f0f; font-weight: bold;
      cursor: pointer; font-size: .85rem;
    }
    button:hover { background: #e8bc55; }
    main { max-width: 760px; margin: 0 auto; padding: 28px 20px 60px; }
    h1 { font-size: 1.1rem; color: #888; font-weight: normal; margin-bottom: 20px; font-family: monospace; }
    .entry {
      border: 1px solid #252525; border-radius: 8px; padding: 18px 20px;
      margin-bottom: 16px; background: #141414;
    }
    .entry:hover { border-color: #383838; }
    .entry-header { display: flex; align-items: baseline; gap: 14px; margin-bottom: 10px; flex-wrap: wrap; }
    .word-link { text-decoration: none; }
    .word { font-size: 1.9rem; color: #d4a843; letter-spacing: .12em; }
    .word-link:hover .word { color: #e8bc55; }
    .pinyin { font-size: .95rem; color: #8eb8d8; font-family: "Noto Sans", "Segoe UI", system-ui, -apple-system, sans-serif; letter-spacing: .03em; }
    .explanation { font-size: .95rem; line-height: 1.65; color: #d8d5cf; }
    .derivation, .example {
      font-size: .82rem; line-height: 1.6; color: #999; margin-top: 8px;
    }
    .label {
      display: inline-block; font-size: .7rem; background: #222; color: #666;
      border-radius: 3px; padding: 1px 5px; margin-right: 6px;
      font-family: monospace; vertical-align: middle;
    }
    .pagination { display: flex; gap: 8px; margin-top: 28px; flex-wrap: wrap; }
    .pagination a, .pagination span {
      padding: 6px 12px; border-radius: 5px; font-size: .85rem; text-decoration: none;
      border: 1px solid #2e2e2e; color: #bbb; font-family: monospace;
    }
    .pagination a:hover { border-color: #d4a843; color: #d4a843; }
    .pagination .current { background: #d4a843; color: #0f0f0f; border-color: #d4a843; }
    .random-btn {
      display: inline-block; margin-bottom: 24px; padding: 8px 16px;
      background: #1e1e1e; border: 1px solid #333; border-radius: 6px;
      color: #bbb; text-decoration: none; font-family: monospace; font-size: .85rem;
    }
    .random-btn:hover { border-color: #d4a843; color: #d4a843; }
    .detail-word { font-size: 3.5rem; color: #d4a843; letter-spacing: .2em; display: block; margin-bottom: 6px; }
    .detail-pinyin { font-size: 1.1rem; color: #8eb8d8; font-family: "Noto Sans", "Segoe UI", system-ui, -apple-system, sans-serif; letter-spacing: .03em; }
    .detail-section { margin-top: 20px; }
    .detail-section h3 { font-size: .75rem; color: #666; font-family: monospace; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 8px; }
    .detail-section p { font-size: 1rem; line-height: 1.7; color: #d8d5cf; }
    .back { font-family: monospace; font-size: .85rem; color: #888; text-decoration: none; display: inline-block; margin-bottom: 20px; }
    .back:hover { color: #d4a843; }
    .count-info { font-family: monospace; font-size: .8rem; color: #555; margin-bottom: 20px; }
    .no-results { color: #666; font-family: monospace; padding: 40px 0; }
    .wikt-links { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; font-size: .75rem; }
    .wikt-full {
      color: #7a9b6d; text-decoration: none; font-family: monospace;
      border: 1px solid #2a3a25; border-radius: 3px; padding: 1px 6px;
    }
    .wikt-full:hover { color: #a4cc91; border-color: #4a6a3f; }
    .wikt-chars { display: inline-flex; gap: 2px; }
    .wikt-char {
      color: #8a8a6a; text-decoration: none; font-size: .85rem;
      border: 1px solid #2a2a22; border-radius: 3px; padding: 0 4px;
    }
    .wikt-char:hover { color: #d4a843; border-color: #4a4a32; }
    .translation, .translation-en {
      font-size: .88rem; line-height: 1.5; color: #b0c8a0; margin-top: 4px;
    }
    .translation-en { color: #a0b8c8; }
    .translate-prompt { margin-top: 6px; }
    .translate-btn {
      font-size: .75rem; color: #888; text-decoration: none; font-family: monospace;
      border: 1px dashed #333; border-radius: 4px; padding: 2px 8px;
    }
    .translate-btn:hover { color: #d4a843; border-color: #d4a843; }
  </style>
</head>
<body>
  <header>
    <a href="${base}/">
      <div class="logo">成语</div>
      <div class="subtitle">chengyu browser</div>
    </a>
    <form method="get" action="${base}/search">
      <input type="search" name="q" placeholder="Search (character, pinyin, meaning...)" autocomplete="off">
      <button type="submit">Search</button>
    </form>
  </header>
  <main>
    ${content}
  </main>
</body>
</html>`;
}

const PAGE_SIZE = 20;

function homePage(base: string): Response {
  const total = (db.query("SELECT COUNT(*) as c FROM chengyu").get() as { c: number }).c;
  const featured = db.query(
    "SELECT * FROM chengyu ORDER BY RANDOM() LIMIT 5"
  ).all() as { id: number; word: string; pinyin: string; explanation: string; derivation: string; example: string; translation_literal: string; translation_explanation: string }[];

  const content = `
    <h1>${total.toLocaleString()} chengyu in the database</h1>
    <a href="${base}/random" class="random-btn">🎲 random chengyu</a>
    ${featured.map(e => entryHtml(base, e)).join("")}
    <p style="font-family:monospace;font-size:.8rem;color:#555;margin-top:24px">Showing 5 random entries. Use search to find specific chengyu.</p>
  `;
  return new Response(pageHtml(base, "成语 Browser", content), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function searchPage(base: string, query: string, page: number): Response {
  if (!query.trim()) {
    return Response.redirect(`${base}/`, 302);
  }

  const q = `%${query}%`;
  const offset = (page - 1) * PAGE_SIZE;

  const total = (db.query(
    `SELECT COUNT(*) as c FROM chengyu WHERE word LIKE ? OR pinyin LIKE ? OR explanation LIKE ? OR derivation LIKE ?`
  ).get(q, q, q, q) as { c: number }).c;

  const results = db.query(
    `SELECT * FROM chengyu WHERE word LIKE ? OR pinyin LIKE ? OR explanation LIKE ? OR derivation LIKE ?
     LIMIT ? OFFSET ?`
  ).all(q, q, q, q, PAGE_SIZE, offset) as { id: number; word: string; pinyin: string; explanation: string; derivation: string; example: string; translation_literal: string; translation_explanation: string }[];

  const totalPages = Math.ceil(total / PAGE_SIZE);

  let paginationHtml = "";
  if (totalPages > 1) {
    paginationHtml = `<div class="pagination">`;
    if (page > 1) paginationHtml += `<a href="${base}/search?q=${encodeURIComponent(query)}&p=${page - 1}">← prev</a>`;
    const start = Math.max(1, page - 3);
    const end = Math.min(totalPages, page + 3);
    for (let i = start; i <= end; i++) {
      if (i === page) paginationHtml += `<span class="current">${i}</span>`;
      else paginationHtml += `<a href="${base}/search?q=${encodeURIComponent(query)}&p=${i}">${i}</a>`;
    }
    if (page < totalPages) paginationHtml += `<a href="${base}/search?q=${encodeURIComponent(query)}&p=${page + 1}">next →</a>`;
    paginationHtml += `</div>`;
  }

  const content = results.length === 0
    ? `<h1>Search: "${escapeHtml(query)}"</h1><p class="no-results">No results found.</p>`
    : `
      <h1>Search: "${escapeHtml(query)}"</h1>
      <p class="count-info">${total.toLocaleString()} result${total !== 1 ? "s" : ""} · page ${page} of ${totalPages}</p>
      ${results.map(e => entryHtml(base, e)).join("")}
      ${paginationHtml}
    `;

  return new Response(pageHtml(base, `"${query}" — Search`, content), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function wordPage(base: string, word: string): Response {
  const e = db.query("SELECT * FROM chengyu WHERE word = ? LIMIT 1").get(word) as {
    id: number; word: string; pinyin: string; explanation: string; derivation: string; example: string;
    translation_literal: string; translation_explanation: string;
  } | null;

  if (!e) {
    return new Response(
      pageHtml(base, "Not found", `<a href="${base}/" class="back">← back</a><p class="no-results">No entry for "${escapeHtml(word)}".</p>`),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const hasTranslation = e.translation_literal || e.translation_explanation;

  const content = `
    <a href="javascript:history.back()" class="back">← back</a>
    <div>
      <span class="detail-word">${escapeHtml(e.word)}</span>
      <span class="detail-pinyin">${escapeHtml(e.pinyin)}</span>
    </div>
    <div style="margin: 12px 0">${wiktionaryLinks(e.word)}</div>
    ${hasTranslation && e.translation_literal ? `
    <div class="detail-section">
      <h3>Literal Meaning</h3>
      <p class="translation">${escapeHtml(e.translation_literal)}</p>
    </div>` : ""}
    <div class="detail-section">
      <h3>Meaning</h3>
      <p>${escapeHtml(e.explanation)}</p>
    </div>
    ${hasTranslation && e.translation_explanation ? `
    <div class="detail-section">
      <h3>English Translation</h3>
      <p class="translation-en">${escapeHtml(e.translation_explanation)}</p>
    </div>` : ""}
    ${!hasTranslation ? `
    <div class="detail-section">
      <a href="${base}/translate/${encodeURIComponent(e.word)}" class="translate-btn" style="font-size:.85rem;padding:6px 14px">Translate to English</a>
    </div>` : ""}
    ${!noExample(e.derivation) ? `
    <div class="detail-section">
      <h3>Origin / Etymology (来源)</h3>
      <p>${escapeHtml(e.derivation)}</p>
    </div>` : ""}
    ${!noExample(e.example) ? `
    <div class="detail-section">
      <h3>Example (例句)</h3>
      <p>${escapeHtml(e.example)}</p>
    </div>` : ""}
  `;

  return new Response(pageHtml(base, e.word, content), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function randomRedirect(base: string): Response {
  const e = db.query("SELECT word FROM chengyu ORDER BY RANDOM() LIMIT 1").get() as { word: string };
  return Response.redirect(`${base}/word/${encodeURIComponent(e.word)}`, 302);
}

async function handleTranslate(base: string, word: string): Promise<Response> {
  const e = db.query("SELECT id, word, explanation, translation_literal, translation_explanation FROM chengyu WHERE word = ? LIMIT 1").get(word) as {
    id: number; word: string; explanation: string; translation_literal: string; translation_explanation: string;
  } | null;

  if (!e) {
    return Response.redirect(`${base}/`, 302);
  }

  // Already translated? Just redirect.
  if (e.translation_literal && e.translation_explanation) {
    return Response.redirect(`${base}/word/${encodeURIComponent(word)}`, 302);
  }

  try {
    const result = await translateChengyu(e.word, e.explanation);
    db.run(
      `UPDATE chengyu SET translation_literal = ?, translation_explanation = ? WHERE id = ?`,
      result.literal, result.explanationEn, e.id
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Translation failed for ${word}: ${msg}`);
    // Redirect back even on failure; they just won't see translation
  }

  return Response.redirect(`${base}/word/${encodeURIComponent(word)}`, 302);
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const base = req.headers.get("X-Lab-Base-Path") ?? "";
    const path = url.pathname.replace(base, "") || "/";

    if (path === "/" || path === "") return homePage(base);
    if (path === "/random") return randomRedirect(base);
    if (path === "/search") {
      const q = url.searchParams.get("q") ?? "";
      const p = Math.max(1, parseInt(url.searchParams.get("p") ?? "1", 10));
      return searchPage(base, q, p);
    }
    const translateMatch = path.match(/^\/translate\/(.+)$/);
    if (translateMatch) return handleTranslate(base, decodeURIComponent(translateMatch[1]));
    const wordMatch = path.match(/^\/word\/(.+)$/);
    if (wordMatch) return wordPage(base, decodeURIComponent(wordMatch[1]));

    return new Response("not found", { status: 404 });
  },
});

console.log(`${LAB_NAME} lab listening on port ${PORT} — ${(db.query("SELECT COUNT(*) as c FROM chengyu").get() as { c: number }).c} chengyu loaded`);
