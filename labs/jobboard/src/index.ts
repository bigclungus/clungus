import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";

const LAB_NAME = "jobboard";
const PORT = 8106;
const LAB_DIR = `/mnt/data/labs/${LAB_NAME}`;

const db = new Database(`${LAB_DIR}/jobs.db`);
db.exec("PRAGMA journal_mode=WAL");

// Create schema
db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company       TEXT NOT NULL,
  title         TEXT NOT NULL,
  link          TEXT NOT NULL UNIQUE,
  salary_min    INTEGER,
  salary_max    INTEGER,
  level         TEXT,
  industry      TEXT,
  location      TEXT,
  remote        TEXT CHECK(remote IN ('remote','hybrid','onsite','unknown')) DEFAULT 'unknown',
  source        TEXT,
  relevance     REAL,
  fit_notes     TEXT,
  tags          TEXT,
  posted_at     TEXT,
  discovered_at TEXT DEFAULT (datetime('now')),
  status        TEXT CHECK(status IN ('new','interested','applied','rejected','stale')) DEFAULT 'new',
  hidden        INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_jobs_relevance ON jobs(relevance DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_link ON jobs(link);
`);

// Seed data if table is empty
const count = db.query("SELECT COUNT(*) as c FROM jobs").get() as { c: number };
if (count.c === 0) {
  const seed = db.prepare(`
    INSERT INTO jobs (company, title, link, salary_min, salary_max, level, industry, location, remote, source, relevance, fit_notes, tags, posted_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seedData = [
    ["Stripe", "Staff Engineer, Payment Infrastructure", "https://stripe.com/jobs/staff-payments-infra", 250, 350, "Staff", "Fintech", "San Francisco, CA", "hybrid", "LinkedIn", 0.92, "Strong match - distributed systems + payments experience", "distributed-systems,payments,go,typescript", "2026-04-10", "new"],
    ["Cloudflare", "Principal Systems Engineer", "https://cloudflare.com/careers/principal-systems", 280, 380, "Principal", "Infrastructure", "Austin, TX", "remote", "careers page", 0.85, "Good fit - edge computing, Rust/Go, large scale", "rust,go,distributed-systems,edge-computing", "2026-04-08", "new"],
    ["Anthropic", "Staff Software Engineer, Infrastructure", "https://anthropic.com/careers/staff-infra", 300, 400, "Staff", "AI/ML", "San Francisco, CA", "hybrid", "HN Who's Hiring", 0.88, "AI infra scaling - relevant background in distributed training", "python,infrastructure,ml-ops,distributed-systems", "2026-04-11", "interested"],
    ["Datadog", "Principal Engineer, Real-Time Analytics", "https://datadog.com/careers/principal-realtime", 270, 360, "Principal", "Observability", "New York, NY", "hybrid", "recruiter outreach", 0.72, "Decent fit - metrics pipeline experience overlaps", "go,kafka,time-series,analytics", "2026-04-05", "new"],
    ["Fly.io", "Senior Staff Engineer", "https://fly.io/jobs/senior-staff", 220, 320, "Senior Staff", "Infrastructure", "Remote", "remote", "Twitter", 0.78, "Interesting - container orchestration and edge compute", "rust,go,containers,edge-computing", "2026-04-09", "new"],
  ];

  for (const row of seedData) {
    seed.run(...row);
  }
  console.log("Seeded 5 sample jobs");
}

// Load static HTML
const indexHtml = readFileSync(join(LAB_DIR, "public", "index.html"), "utf-8");

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Strip lab prefix if proxied through clunger
    const route = path.replace(`/labs/${LAB_NAME}`, "").replace(`/${LAB_NAME}`, "") || "/";

    // Static HTML
    if (route === "/" || route === "/index.html") {
      return new Response(indexHtml, {
        headers: { "Content-Type": "text/html" },
      });
    }

    // GET /api/jobs
    if (route === "/api/jobs" && req.method === "GET") {
      const status = url.searchParams.get("status");
      const minRelevance = url.searchParams.get("minRelevance");
      const showHidden = url.searchParams.get("hidden") === "1";

      let sql = "SELECT * FROM jobs WHERE 1=1";
      const params: (string | number)[] = [];

      if (!showHidden) {
        sql += " AND hidden = 0";
      }
      if (status) {
        sql += " AND status = ?";
        params.push(status);
      }
      if (minRelevance) {
        sql += " AND relevance >= ?";
        params.push(parseFloat(minRelevance));
      }

      sql += " ORDER BY relevance DESC";

      const jobs = db.query(sql).all(...params);
      return Response.json(jobs);
    }

    // POST /api/jobs
    if (route === "/api/jobs" && req.method === "POST") {
      return (async () => {
        const body = await req.json() as Record<string, unknown>;
        const stmt = db.prepare(`
          INSERT INTO jobs (company, title, link, salary_min, salary_max, level, industry, location, remote, source, relevance, fit_notes, tags, posted_at, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        try {
          stmt.run(
            body.company, body.title, body.link,
            body.salary_min ?? null, body.salary_max ?? null,
            body.level ?? null, body.industry ?? null,
            body.location ?? null, body.remote ?? "unknown",
            body.source ?? null, body.relevance ?? null,
            body.fit_notes ?? null, body.tags ?? null,
            body.posted_at ?? null, body.status ?? "new"
          );
          return Response.json({ ok: true }, { status: 201 });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ error: msg }, { status: 400 });
        }
      })();
    }

    // PATCH /api/jobs/:id
    const patchMatch = route.match(/^\/api\/jobs\/(\d+)$/);
    if (patchMatch && req.method === "PATCH") {
      return (async () => {
        const id = parseInt(patchMatch[1]);
        const body = await req.json() as Record<string, unknown>;
        const updates: string[] = [];
        const params: (string | number)[] = [];

        for (const key of ["status", "hidden", "relevance", "fit_notes", "tags"]) {
          if (key in body) {
            updates.push(`${key} = ?`);
            params.push(body[key] as string | number);
          }
        }

        if (updates.length === 0) {
          return Response.json({ error: "No valid fields to update" }, { status: 400 });
        }

        params.push(id);
        db.run(`UPDATE jobs SET ${updates.join(", ")} WHERE id = ?`, ...params);
        return Response.json({ ok: true });
      })();
    }

    // DELETE /api/jobs/:id
    const deleteMatch = route.match(/^\/api\/jobs\/(\d+)$/);
    if (deleteMatch && req.method === "DELETE") {
      const id = parseInt(deleteMatch[1]);
      db.run("DELETE FROM jobs WHERE id = ?", id);
      return Response.json({ ok: true });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Job Board lab running on http://localhost:${PORT}`);
