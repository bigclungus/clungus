import { Database } from "bun:sqlite";

const LAB_NAME = "golf-scorecard";
const PORT = 8100;

const db = new Database(`/mnt/data/labs/${LAB_NAME}/data.db`);

db.run(`
  CREATE TABLE IF NOT EXISTS rounds (
    id TEXT PRIMARY KEY,
    course TEXT NOT NULL,
    date TEXT NOT NULL,
    tees TEXT,
    notes TEXT,
    created_at INTEGER
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS holes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id TEXT NOT NULL,
    hole_num INTEGER NOT NULL,
    par INTEGER NOT NULL,
    strokes INTEGER NOT NULL,
    putts INTEGER,
    fairway_hit INTEGER DEFAULT 0,
    gir INTEGER DEFAULT 0,
    FOREIGN KEY (round_id) REFERENCES rounds(id)
  )
`);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

function calcHandicapDifferential(score: number, coursePar: number): string {
  // Simple slope/rating approximation (no slope rating stored — just +/- vs par)
  const diff = score - coursePar;
  return diff >= 0 ? `+${diff}` : `${diff}`;
}

function homePage(base: string): Response {
  const rounds = db.query(`
    SELECT r.id, r.course, r.date, r.tees, r.notes,
           COUNT(h.id) as holes_played,
           SUM(h.strokes) as total_strokes,
           SUM(h.par) as total_par
    FROM rounds r
    LEFT JOIN holes h ON h.round_id = r.id
    GROUP BY r.id
    ORDER BY r.date DESC, r.created_at DESC
    LIMIT 20
  `).all() as Array<{
    id: string; course: string; date: string; tees: string | null;
    notes: string | null; holes_played: number; total_strokes: number; total_par: number;
  }>;

  const roundRows = rounds.map(r => {
    const diffStr = r.holes_played > 0 ? calcHandicapDifferential(r.total_strokes, r.total_par) : "—";
    const scoreDisplay = r.holes_played > 0
      ? `${r.total_strokes} (${diffStr})`
      : "—";
    return `<tr>
      <td><a href="${base}round/${escapeHtml(r.id)}">${escapeHtml(r.date)}</a></td>
      <td>${escapeHtml(r.course)}</td>
      <td>${r.tees ? escapeHtml(r.tees) : "—"}</td>
      <td class="score">${scoreDisplay}</td>
      <td>${r.holes_played}/18</td>
      <td><a href="${base}round/${escapeHtml(r.id)}/delete" class="del" onclick="return confirm('Delete this round?')">✕</a></td>
    </tr>`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Golf Scorecard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1a1f1a; color: #e2e8d5; font-family: system-ui, sans-serif; padding: 20px; }
    h1 { color: #7ec850; margin-bottom: 4px; }
    .subtitle { color: #8a9e78; font-size: 0.9rem; margin-bottom: 24px; }
    .card { background: #232a23; border-radius: 8px; padding: 20px; margin-bottom: 24px; border: 1px solid #2e3a2e; }
    h2 { color: #a8c890; margin-bottom: 14px; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.08em; }
    form label { display: block; margin-bottom: 12px; font-size: 0.9rem; color: #8a9e78; }
    form input, form select, form textarea {
      display: block; width: 100%; padding: 8px 10px; margin-top: 4px;
      background: #1a1f1a; border: 1px solid #2e3a2e; border-radius: 4px;
      color: #e2e8d5; font-size: 0.95rem;
    }
    form input:focus, form select:focus { outline: none; border-color: #7ec850; }
    .btn { background: #3a6b2a; color: #e2e8d5; border: none; padding: 9px 20px; border-radius: 5px; cursor: pointer; font-size: 0.95rem; }
    .btn:hover { background: #4a8b3a; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th { color: #7ec850; text-align: left; padding: 6px 8px; border-bottom: 1px solid #2e3a2e; }
    td { padding: 7px 8px; border-bottom: 1px solid #1e261e; }
    tr:hover td { background: #1e2a1e; }
    .score { font-weight: bold; color: #a8c890; }
    a { color: #7ec850; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .del { color: #c84040; font-size: 0.85rem; }
    .del:hover { color: #e05050; text-decoration: none; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  </style>
</head>
<body>
  <h1>Golf Scorecard</h1>
  <p class="subtitle">track rounds, holes, and scores</p>

  <div class="card">
    <h2>New Round</h2>
    <form method="POST" action="${base}round">
      <div class="row2">
        <label>Course Name
          <input name="course" required placeholder="Augusta National">
        </label>
        <label>Date
          <input name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}">
        </label>
      </div>
      <div class="row2">
        <label>Tees
          <input name="tees" placeholder="White, Blue, Red...">
        </label>
        <label>Notes
          <input name="notes" placeholder="Optional notes">
        </label>
      </div>
      <button class="btn" type="submit">Start Round →</button>
    </form>
  </div>

  <div class="card">
    <h2>Recent Rounds</h2>
    ${rounds.length === 0
      ? `<p style="color:#5a6e5a">No rounds yet. Start one above.</p>`
      : `<table>
          <thead><tr>
            <th>Date</th><th>Course</th><th>Tees</th><th>Score</th><th>Holes</th><th></th>
          </tr></thead>
          <tbody>${roundRows}</tbody>
        </table>`
    }
  </div>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

function roundPage(base: string, roundId: string): Response {
  const round = db.query("SELECT * FROM rounds WHERE id = ?").get(roundId) as {
    id: string; course: string; date: string; tees: string | null; notes: string | null;
  } | null;
  if (!round) return new Response("Round not found", { status: 404 });

  const holes = db.query("SELECT * FROM holes WHERE round_id = ? ORDER BY hole_num").all(roundId) as Array<{
    id: number; hole_num: number; par: number; strokes: number;
    putts: number | null; fairway_hit: number; gir: number;
  }>;

  const holesById = new Map(holes.map(h => [h.hole_num, h]));

  let totalPar = 0;
  let totalStrokes = 0;
  const holeRows = Array.from({ length: 18 }, (_, i) => {
    const n = i + 1;
    const h = holesById.get(n);
    if (h) {
      totalPar += h.par;
      totalStrokes += h.strokes;
      const diff = h.strokes - h.par;
      const scoreClass = diff < 0 ? "eagle" : diff === 0 ? "par" : diff === 1 ? "bogey" : "double";
      const scoreLabel = diff <= -2 ? "Eagle" : diff === -1 ? "Birdie" : diff === 0 ? "Par" : diff === 1 ? "Bogey" : `+${diff}`;
      return `<tr>
        <td>${n}</td>
        <td>${h.par}</td>
        <td class="sc-${scoreClass}">${h.strokes} <small>(${scoreLabel})</small></td>
        <td>${h.putts ?? "—"}</td>
        <td>${h.fairway_hit ? "✓" : "—"}</td>
        <td>${h.gir ? "✓" : "—"}</td>
        <td><a href="${base}hole/${h.id}/delete" class="del" onclick="return confirm('Delete hole ${n}?')">✕</a></td>
      </tr>`;
    }
    return `<tr class="empty-hole">
      <td>${n}</td>
      <td><input name="par_${n}" type="number" min="3" max="6" value="4" class="ph"></td>
      <td><input name="strokes_${n}" type="number" min="1" max="20" class="ph" placeholder="—"></td>
      <td><input name="putts_${n}" type="number" min="0" max="10" class="ph" placeholder="—"></td>
      <td><input name="fh_${n}" type="checkbox" value="1"></td>
      <td><input name="gir_${n}" type="checkbox" value="1"></td>
      <td></td>
    </tr>`;
  }).join("\n");

  const scoreSummary = holes.length > 0
    ? `<div class="summary">
        <span>Total: <strong>${totalStrokes}</strong></span>
        <span>Par: <strong>${totalPar}</strong></span>
        <span>Diff: <strong class="${totalStrokes <= totalPar ? "under" : "over"}">${calcHandicapDifferential(totalStrokes, totalPar)}</strong></span>
        <span>Holes: <strong>${holes.length}/18</strong></span>
      </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(round.course)} — Golf Scorecard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1a1f1a; color: #e2e8d5; font-family: system-ui, sans-serif; padding: 20px; }
    h1 { color: #7ec850; margin-bottom: 2px; }
    .meta { color: #8a9e78; font-size: 0.85rem; margin-bottom: 20px; }
    .back { color: #7ec850; font-size: 0.85rem; display: block; margin-bottom: 12px; }
    .card { background: #232a23; border-radius: 8px; padding: 20px; margin-bottom: 20px; border: 1px solid #2e3a2e; }
    h2 { color: #a8c890; margin-bottom: 14px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.08em; }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    th { color: #7ec850; text-align: left; padding: 5px 6px; border-bottom: 1px solid #2e3a2e; }
    td { padding: 5px 6px; border-bottom: 1px solid #1e261e; vertical-align: middle; }
    tr:hover td { background: #1e2a1e; }
    .sc-eagle { color: #f0d060; font-weight: bold; }
    .sc-par { color: #7ec850; }
    .sc-bogey { color: #c8a050; }
    .sc-double { color: #c84040; }
    .ph { width: 48px; padding: 3px 5px; background: #1a1f1a; border: 1px solid #2e3a2e; border-radius: 3px; color: #e2e8d5; }
    .btn { background: #3a6b2a; color: #e2e8d5; border: none; padding: 8px 18px; border-radius: 5px; cursor: pointer; margin-top: 12px; }
    .btn:hover { background: #4a8b3a; }
    .del { color: #c84040; font-size: 0.8rem; }
    a { color: #7ec850; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .summary { display: flex; gap: 20px; padding: 10px 0; font-size: 0.9rem; color: #8a9e78; flex-wrap: wrap; }
    .summary strong { color: #e2e8d5; }
    .under { color: #7ec850; }
    .over { color: #c87050; }
    .empty-hole td { opacity: 0.65; }
    small { font-size: 0.75rem; opacity: 0.75; }
  </style>
</head>
<body>
  <a class="back" href="${base}">← All Rounds</a>
  <h1>${escapeHtml(round.course)}</h1>
  <p class="meta">${escapeHtml(round.date)}${round.tees ? ` · ${escapeHtml(round.tees)} tees` : ""}${round.notes ? ` · ${escapeHtml(round.notes)}` : ""}</p>

  ${scoreSummary}

  <div class="card">
    <h2>Scorecard</h2>
    <form method="POST" action="${base}round/${roundId}/holes">
      <table>
        <thead><tr>
          <th>Hole</th><th>Par</th><th>Strokes</th><th>Putts</th><th>FH</th><th>GIR</th><th></th>
        </tr></thead>
        <tbody>${holeRows}</tbody>
      </table>
      <button class="btn" type="submit">Save Holes</button>
    </form>
  </div>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    // Detect base path (works behind reverse proxy)
    const base = url.pathname.includes(`/${LAB_NAME}/`) ? `/${LAB_NAME}/` : "/";

    const path = url.pathname.replace(new RegExp(`^/${LAB_NAME}`), "") || "/";

    // GET /
    if (req.method === "GET" && path === "/") {
      return homePage(base);
    }

    // POST /round — create new round
    if (req.method === "POST" && path === "/round") {
      const form = await req.formData();
      const course = (form.get("course") as string || "").trim();
      const date = (form.get("date") as string || "").trim();
      const tees = (form.get("tees") as string || "").trim() || null;
      const notes = (form.get("notes") as string || "").trim() || null;
      if (!course || !date) return new Response("Missing course or date", { status: 400 });
      const id = randomId();
      db.run("INSERT INTO rounds (id, course, date, tees, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [id, course, date, tees, notes, Date.now()]);
      return Response.redirect(`${base}round/${id}`, 303);
    }

    // GET /round/:id
    const roundMatch = path.match(/^\/round\/([a-f0-9]+)$/);
    if (req.method === "GET" && roundMatch) {
      return roundPage(base, roundMatch[1]);
    }

    // POST /round/:id/holes — upsert holes from scorecard form
    const holesMatch = path.match(/^\/round\/([a-f0-9]+)\/holes$/);
    if (req.method === "POST" && holesMatch) {
      const roundId = holesMatch[1];
      const round = db.query("SELECT id FROM rounds WHERE id = ?").get(roundId);
      if (!round) return new Response("Round not found", { status: 404 });

      const form = await req.formData();
      for (let n = 1; n <= 18; n++) {
        const strokesRaw = form.get(`strokes_${n}`) as string | null;
        if (!strokesRaw || strokesRaw.trim() === "") continue;
        const strokes = parseInt(strokesRaw, 10);
        if (isNaN(strokes) || strokes < 1) continue;
        const par = parseInt((form.get(`par_${n}`) as string) || "4", 10) || 4;
        const putts = parseInt((form.get(`putts_${n}`) as string) || "", 10);
        const fh = form.get(`fh_${n}`) === "1" ? 1 : 0;
        const gir = form.get(`gir_${n}`) === "1" ? 1 : 0;

        // Delete existing entry for this hole then insert fresh
        db.run("DELETE FROM holes WHERE round_id = ? AND hole_num = ?", [roundId, n]);
        db.run(
          "INSERT INTO holes (round_id, hole_num, par, strokes, putts, fairway_hit, gir) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [roundId, n, par, strokes, isNaN(putts) ? null : putts, fh, gir]
        );
      }
      return Response.redirect(`${base}round/${roundId}`, 303);
    }

    // GET /round/:id/delete
    const deleteRoundMatch = path.match(/^\/round\/([a-f0-9]+)\/delete$/);
    if (req.method === "GET" && deleteRoundMatch) {
      const roundId = deleteRoundMatch[1];
      db.run("DELETE FROM holes WHERE round_id = ?", [roundId]);
      db.run("DELETE FROM rounds WHERE id = ?", [roundId]);
      return Response.redirect(base, 303);
    }

    // GET /hole/:id/delete
    const deleteHoleMatch = path.match(/^\/hole\/(\d+)\/delete$/);
    if (req.method === "GET" && deleteHoleMatch) {
      const holeId = parseInt(deleteHoleMatch[1], 10);
      const hole = db.query("SELECT round_id FROM holes WHERE id = ?").get(holeId) as { round_id: string } | null;
      const roundId = hole?.round_id;
      db.run("DELETE FROM holes WHERE id = ?", [holeId]);
      return Response.redirect(roundId ? `${base}round/${roundId}` : base, 303);
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`[${LAB_NAME}] listening on :${PORT}`);
