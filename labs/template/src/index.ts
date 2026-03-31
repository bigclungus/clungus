import { Database } from "bun:sqlite";

const LAB_NAME = "template";
const PORT = 8100;

// SQLite DB (optional — remove if you don't need persistence)
const db = new Database(`/mnt/data/labs/${LAB_NAME}/data.db`);
db.run(`CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT CURRENT_TIMESTAMP)`);

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    // Base path injected by the labs-router (e.g. "/mylab").
    // Falls back to "" so the lab also works when run directly (without the router).
    const base = req.headers.get("X-Lab-Base-Path") ?? "";

    if (url.pathname === "/" || url.pathname === "") {
      db.run(`INSERT INTO visits DEFAULT VALUES`);
      const count = (db.query(`SELECT COUNT(*) as c FROM visits`).get() as { c: number }).c;

      return new Response(
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${LAB_NAME}</title>
  <style>
    body { font-family: monospace; max-width: 600px; margin: 80px auto; padding: 0 20px;
           background: #0d0d0d; color: #e0e0e0; padding-top: 32px; }
    h1 { font-size: 1.4rem; }
    .count { color: #7eb8f7; }
  </style>
</head>
<body>
  <h1>Hello from <strong>${LAB_NAME}</strong></h1>
  <p>This lab has been visited <span class="count">${count}</span> time(s).</p>
  <p><a href="${base}/" style="color:#7eb8f7">refresh</a></p>
</body>
</html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`${LAB_NAME} lab listening on port ${PORT}`);
