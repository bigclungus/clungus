import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";

const LAB_NAME = "workout";
const PORT = 8113;
const API_ORIGIN = "http://localhost:8081"; // clunger
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? "";
const DB_PATH = `/mnt/data/labs/${LAB_NAME}/data.db`;

const db = new Database(DB_PATH);
db.run("PRAGMA journal_mode=WAL");

// ── Auth helper ──
async function getUser(req: Request): Promise<{ login: string } | null> {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (INTERNAL_TOKEN) headers["X-Internal-Token"] = INTERNAL_TOKEN;
    if (cookie) headers["Cookie"] = cookie;
    const res = await fetch(`${API_ORIGIN}/api/me`, { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { username?: string };
    return data.username ? { login: data.username } : null;
  } catch {
    return null;
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(msg: string, status = 400): Response {
  return jsonResponse({ error: msg }, status);
}

// ── Workout Generation Logic ──

interface ExerciseRow {
  id: number;
  name: string;
  muscle_groups: string;
  equipment: string;
  difficulty: string;
  description: string;
  is_compound: number;
}

interface PlanExercise {
  name: string;
  sets: number;
  reps: string;
  rest: string;
  notes: string;
  muscle_groups: string[];
  equipment: string;
  is_compound: boolean;
}

interface GeneratedPlan {
  title: string;
  duration_minutes: number;
  exercises: PlanExercise[];
  warmup: string;
  cooldown: string;
  notes: string;
}

const SPLIT_MUSCLES: Record<string, string[][]> = {
  push: [["chest", "shoulders", "triceps"]],
  pull: [["middle back", "lats", "biceps", "forearms", "traps"]],
  legs: [["quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors"]],
  upper: [["chest", "shoulders", "triceps", "middle back", "lats", "biceps", "traps"]],
  lower: [["quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors"]],
  full_body: [["chest", "shoulders", "middle back", "lats", "quadriceps", "hamstrings", "glutes"]],
  chest_back: [["chest", "middle back", "lats"]],
  shoulders_arms: [["shoulders", "biceps", "triceps", "forearms"]],
  chest_triceps: [["chest", "triceps"]],
  back_biceps: [["middle back", "lats", "biceps"]],
  core: [["abdominals", "lower back"]],
};

const GOAL_PARAMS: Record<string, { sets: number; reps: string; rest: string }> = {
  strength: { sets: 5, reps: "3-5", rest: "3-5 min" },
  hypertrophy: { sets: 4, reps: "8-12", rest: "60-90 sec" },
  endurance: { sets: 3, reps: "15-20", rest: "30-45 sec" },
  power: { sets: 5, reps: "1-3", rest: "3-5 min" },
  general: { sets: 3, reps: "8-12", rest: "60-90 sec" },
};

function generateWorkout(inputs: {
  split: string;
  equipment: string[];
  duration: number;
  goal: string;
  experience: string;
}): GeneratedPlan {
  const { split, equipment, duration, goal, experience } = inputs;
  const goalParams = GOAL_PARAMS[goal] || GOAL_PARAMS.general;

  const muscleGroupSets = SPLIT_MUSCLES[split] || SPLIT_MUSCLES.full_body;
  const targetMuscles = muscleGroupSets.flat();

  const equipList = equipment.map((e) => e.toLowerCase());
  const equipPlaceholders = equipList.map(() => "?").join(",");

  const allExercises: ExerciseRow[] = [];
  for (const muscle of targetMuscles) {
    const rows = db
      .query(
        `SELECT * FROM exercises
         WHERE muscle_groups LIKE ?
         AND equipment IN (${equipPlaceholders})
         ${experience === "beginner" ? "AND difficulty != 'expert'" : ""}
         ORDER BY is_compound DESC, RANDOM()`
      )
      .all(`%${muscle}%`, ...equipList) as ExerciseRow[];
    allExercises.push(...rows);
  }

  // Deduplicate
  const seen = new Set<number>();
  const unique: ExerciseRow[] = [];
  for (const ex of allExercises) {
    if (!seen.has(ex.id)) {
      seen.add(ex.id);
      unique.push(ex);
    }
  }

  // Sort: compounds first
  unique.sort((a, b) => b.is_compound - a.is_compound);

  // Estimate exercise count from duration
  const timePerExercise = goal === "strength" || goal === "power" ? 7 : 5;
  const exerciseCount = Math.max(3, Math.min(12, Math.floor((duration - 10) / timePerExercise)));

  // Pick exercises, ensuring muscle group coverage
  const picked: ExerciseRow[] = [];
  const coveredMuscles = new Set<string>();

  // First pass: one compound per major muscle group
  for (const muscle of targetMuscles) {
    if (picked.length >= exerciseCount) break;
    const match = unique.find(
      (ex) =>
        ex.is_compound &&
        ex.muscle_groups.toLowerCase().includes(muscle) &&
        !picked.includes(ex)
    );
    if (match) {
      picked.push(match);
      match.muscle_groups.split(",").forEach((m) => coveredMuscles.add(m.trim()));
    }
  }

  // Second pass: fill remaining slots
  for (const ex of unique) {
    if (picked.length >= exerciseCount) break;
    if (!picked.includes(ex)) {
      picked.push(ex);
    }
  }

  const planExercises: PlanExercise[] = picked.map((ex) => {
    const isCompound = ex.is_compound === 1;
    let { sets, reps, rest } = goalParams;

    if (!isCompound) {
      sets = Math.max(2, sets - 1);
      if (goal === "strength") reps = "6-8";
    }

    if (experience === "beginner") {
      sets = Math.max(2, sets - 1);
    }

    return {
      name: ex.name,
      sets,
      reps,
      rest,
      notes: isCompound ? "Focus on controlled eccentric" : "",
      muscle_groups: ex.muscle_groups.split(",").map((m) => m.trim()),
      equipment: ex.equipment,
      is_compound: isCompound,
    };
  });

  const splitName = split.replace(/_/g, " ");

  return {
    title: `${splitName.charAt(0).toUpperCase() + splitName.slice(1)} - ${goal.charAt(0).toUpperCase() + goal.slice(1)}`,
    duration_minutes: duration,
    exercises: planExercises,
    warmup: "5 minutes light cardio + dynamic stretching for target muscles",
    cooldown: "5 minutes static stretching, focus on worked muscle groups",
    notes: `${experience} level ${goal} workout. ${duration} min target.`,
  };
}

function getAlternatives(exerciseName: string, limit = 5): ExerciseRow[] {
  const exercise = db
    .query("SELECT * FROM exercises WHERE name = ?")
    .get(exerciseName) as ExerciseRow | null;
  if (!exercise) return [];

  const muscles = exercise.muscle_groups.split(",").map((m) => m.trim());
  const primary = muscles[0] || "";

  return db
    .query(
      `SELECT * FROM exercises
       WHERE name != ?
       AND muscle_groups LIKE ?
       AND equipment = ?
       ORDER BY
         CASE WHEN is_compound = ? THEN 0 ELSE 1 END,
         RANDOM()
       LIMIT ?`
    )
    .all(exerciseName, `%${primary}%`, exercise.equipment, exercise.is_compound, limit) as ExerciseRow[];
}

// ── Server ──

const server = Bun.serve({
  port: PORT,
  reusePort: true,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const base = req.headers.get("X-Lab-Base-Path") ?? "";

    // ── API Routes ──

    if (path === "/api/me") {
      const cookie = req.headers.get("cookie");
      const headers: Record<string, string> = { Accept: "application/json" };
      if (INTERNAL_TOKEN) headers["X-Internal-Token"] = INTERNAL_TOKEN;
      if (cookie) headers["Cookie"] = cookie;
      try {
        const res = await fetch(`${API_ORIGIN}/api/me`, { headers });
        return new Response(await res.text(), {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        });
      } catch (e: any) {
        return errorResponse("auth proxy error: " + e.message, 502);
      }
    }

    if (path === "/api/exercises" && req.method === "GET") {
      const muscle = url.searchParams.get("muscle_group");
      const equip = url.searchParams.get("equipment");
      const search = url.searchParams.get("q");
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");

      let where = "1=1";
      const params: any[] = [];

      if (muscle) {
        where += " AND muscle_groups LIKE ?";
        params.push(`%${muscle}%`);
      }
      if (equip) {
        where += " AND equipment = ?";
        params.push(equip.toLowerCase());
      }
      if (search) {
        where += " AND name LIKE ?";
        params.push(`%${search}%`);
      }

      params.push(limit, offset);
      const rows = db
        .query(`SELECT * FROM exercises WHERE ${where} ORDER BY name LIMIT ? OFFSET ?`)
        .all(...params);

      const countRow = db
        .query(`SELECT COUNT(*) as c FROM exercises WHERE ${where}`)
        .get(...params.slice(0, -2)) as { c: number };

      return jsonResponse({ exercises: rows, total: countRow.c });
    }

    if (path === "/api/exercises/alternatives" && req.method === "GET") {
      const name = url.searchParams.get("name");
      if (!name) return errorResponse("name parameter required");
      const alts = getAlternatives(name);
      return jsonResponse({ alternatives: alts });
    }

    if (path === "/api/equipment" && req.method === "GET") {
      const rows = db
        .query("SELECT DISTINCT equipment FROM exercises ORDER BY equipment")
        .all() as Array<{ equipment: string }>;
      return jsonResponse({ equipment: rows.map((r) => r.equipment) });
    }

    if (path === "/api/muscle-groups" && req.method === "GET") {
      const rows = db.query("SELECT muscle_groups FROM exercises").all() as Array<{
        muscle_groups: string;
      }>;
      const groups = new Set<string>();
      for (const r of rows) {
        for (const m of r.muscle_groups.split(",")) {
          groups.add(m.trim());
        }
      }
      return jsonResponse({ muscle_groups: [...groups].sort() });
    }

    if (path === "/api/generate" && req.method === "POST") {
      const user = await getUser(req);
      if (!user) return errorResponse("unauthorized", 401);

      let body: any;
      try {
        body = await req.json();
      } catch {
        return errorResponse("invalid JSON body");
      }

      const {
        split = "full_body",
        equipment = ["barbell", "dumbbell", "body only"],
        duration = 60,
        goal = "hypertrophy",
        experience = "intermediate",
      } = body;

      const plan = generateWorkout({ split, equipment, duration, goal, experience });
      const planId = randomUUID();

      db.query(
        "INSERT INTO plans (id, user_id, inputs, plan, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
      ).run(planId, user.login, JSON.stringify(body), JSON.stringify(plan));

      return jsonResponse({ id: planId, ...plan });
    }

    if (path.startsWith("/api/plan/") && req.method === "GET") {
      const planId = path.replace("/api/plan/", "");
      const row = db.query("SELECT * FROM plans WHERE id = ?").get(planId) as any;
      if (!row) return errorResponse("plan not found", 404);
      return jsonResponse({
        id: row.id,
        user_id: row.user_id,
        inputs: JSON.parse(row.inputs),
        ...JSON.parse(row.plan),
        created_at: row.created_at,
      });
    }

    if (path.startsWith("/api/plan/") && req.method === "PATCH") {
      const user = await getUser(req);
      if (!user) return errorResponse("unauthorized", 401);

      const planId = path.replace("/api/plan/", "");
      const row = db.query("SELECT * FROM plans WHERE id = ? AND user_id = ?").get(planId, user.login) as any;
      if (!row) return errorResponse("plan not found", 404);

      let body: any;
      try {
        body = await req.json();
      } catch {
        return errorResponse("invalid JSON body");
      }

      const existingPlan = JSON.parse(row.plan);
      if (body.exercises) {
        existingPlan.exercises = body.exercises;
      }

      db.query("UPDATE plans SET plan = ? WHERE id = ?").run(JSON.stringify(existingPlan), planId);
      return jsonResponse({ id: planId, ...existingPlan });
    }

    if (path === "/api/plans" && req.method === "GET") {
      const user = await getUser(req);
      if (!user) return errorResponse("unauthorized", 401);

      const rows = db
        .query("SELECT id, inputs, plan, created_at FROM plans WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
        .all(user.login) as any[];

      const plans = rows.map((r) => {
        const plan = JSON.parse(r.plan);
        return {
          id: r.id,
          title: plan.title,
          duration_minutes: plan.duration_minutes,
          exercise_count: plan.exercises?.length || 0,
          created_at: r.created_at,
        };
      });

      return jsonResponse({ plans });
    }

    if (path === "/api/preferences" && req.method === "GET") {
      const user = await getUser(req);
      if (!user) return errorResponse("unauthorized", 401);

      const row = db.query("SELECT * FROM user_preferences WHERE user_id = ?").get(user.login) as any;
      if (!row) return jsonResponse({ equipment: null, duration: null });
      return jsonResponse({
        equipment: row.equipment ? JSON.parse(row.equipment) : null,
        duration: row.duration,
      });
    }

    if (path === "/api/preferences" && req.method === "PUT") {
      const user = await getUser(req);
      if (!user) return errorResponse("unauthorized", 401);

      let body: any;
      try {
        body = await req.json();
      } catch {
        return errorResponse("invalid JSON body");
      }

      db.query(
        `INSERT INTO user_preferences (user_id, equipment, duration, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           equipment = excluded.equipment,
           duration = excluded.duration,
           updated_at = excluded.updated_at`
      ).run(user.login, body.equipment ? JSON.stringify(body.equipment) : null, body.duration || null);

      return jsonResponse({ ok: true });
    }

    // ── Static Pages ──
    if (path === "/" || path === "") {
      return new Response(buildGeneratorPage(base), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (path === "/history") {
      return new Response(buildHistoryPage(base), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (path === "/exercises") {
      return new Response(buildExercisesPage(base), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (path.startsWith("/view/")) {
      return new Response(buildPlanViewerPage(base), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`${LAB_NAME} lab listening on port ${PORT}`);

// ── Page Builders ──

const STYLES = `
<style>
  :root {
    --bg: #0f0f1a;
    --surface: #1a1a2e;
    --surface-2: #22223a;
    --border: #2a2a45;
    --text: #e0e0f0;
    --text-muted: #8888aa;
    --accent: #4ecca3;
    --accent-dim: rgba(78,204,163,0.15);
    --danger: #e94560;
    --warning: #f59e0b;
    --orange: #f97316;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    font-size: 14px;
  }
  .nav {
    display: flex; align-items: center; gap: 6px;
    padding: 10px 20px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    position: sticky; top: 0; z-index: 100;
  }
  .nav a {
    color: var(--text-muted); text-decoration: none;
    font-size: 13px; font-weight: 500;
    padding: 6px 14px; border-radius: 6px;
    transition: all 0.15s;
  }
  .nav a:hover { color: var(--text); background: rgba(255,255,255,0.05); }
  .nav a.active { color: var(--accent); background: var(--accent-dim); }
  .nav .logo { font-weight: 700; color: var(--accent); font-size: 15px; margin-right: 12px; }
  .container { max-width: 900px; margin: 0 auto; padding: 24px 20px; }
  h1 { font-size: 1.5rem; margin-bottom: 16px; }
  h2 { font-size: 1.1rem; margin-bottom: 12px; color: var(--accent); }
  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 20px; margin-bottom: 16px;
  }
  label { display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 6px; font-weight: 500; }
  select, input[type="number"] {
    width: 100%; padding: 10px 12px;
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 6px; color: var(--text); font-size: 14px;
    outline: none;
  }
  select:focus, input:focus { border-color: var(--accent); }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  .checkbox-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px;
  }
  .checkbox-item {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; background: var(--surface-2);
    border: 1px solid var(--border); border-radius: 6px;
    cursor: pointer; transition: all 0.15s; font-size: 13px;
  }
  .checkbox-item:hover { border-color: var(--accent); }
  .checkbox-item.checked { border-color: var(--accent); background: var(--accent-dim); }
  .checkbox-item input { display: none; }
  .btn {
    padding: 12px 24px; border: none; border-radius: 8px;
    font-size: 15px; font-weight: 600; cursor: pointer;
    transition: all 0.15s;
  }
  .btn-primary { background: var(--accent); color: #0f0f1a; }
  .btn-primary:hover { filter: brightness(1.1); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary {
    background: var(--surface-2); color: var(--text);
    border: 1px solid var(--border);
  }
  .btn-secondary:hover { border-color: var(--accent); }
  .slider-container { display: flex; align-items: center; gap: 12px; }
  .slider-container input[type="range"] { flex: 1; accent-color: var(--accent); background: transparent; }
  .slider-value { font-weight: 600; color: var(--accent); min-width: 50px; text-align: right; }
  .exercise-list { list-style: none; }
  .exercise-item {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 16px; background: var(--surface-2);
    border: 1px solid var(--border); border-radius: 8px;
    margin-bottom: 8px; cursor: grab; transition: all 0.15s;
  }
  .exercise-item:hover { border-color: var(--accent); }
  .exercise-item.dragging { opacity: 0.5; border-color: var(--accent); }
  .exercise-num {
    font-weight: 700; color: var(--accent);
    min-width: 28px; text-align: center; font-size: 16px;
  }
  .exercise-info { flex: 1; }
  .exercise-name { font-weight: 600; font-size: 14px; }
  .exercise-meta { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
  .exercise-params {
    display: flex; gap: 16px; font-size: 13px; color: var(--text-muted);
  }
  .exercise-params span { white-space: nowrap; }
  .exercise-params strong { color: var(--text); }
  .tag {
    display: inline-block; padding: 2px 8px;
    background: var(--accent-dim); color: var(--accent);
    border-radius: 4px; font-size: 11px; font-weight: 500; margin-right: 4px;
  }
  .tag.compound { background: rgba(249,115,22,0.15); color: var(--orange); }
  .swap-btn {
    padding: 4px 10px; font-size: 12px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 4px; color: var(--text-muted); cursor: pointer;
  }
  .swap-btn:hover { color: var(--accent); border-color: var(--accent); }
  .alt-list {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: 12px; margin-top: 8px;
  }
  .alt-item {
    padding: 8px 10px; cursor: pointer; border-radius: 4px; font-size: 13px;
  }
  .alt-item:hover { background: var(--accent-dim); color: var(--accent); }
  .plan-header {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
  }
  .plan-header .meta { color: var(--text-muted); font-size: 13px; }
  .history-item {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 16px; background: var(--surface);
    border: 1px solid var(--border); border-radius: 8px;
    margin-bottom: 8px; text-decoration: none; color: var(--text);
    transition: all 0.15s;
  }
  .history-item:hover { border-color: var(--accent); }
  .history-title { font-weight: 600; }
  .history-meta { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
  .loading { text-align: center; padding: 40px; color: var(--text-muted); }
  .empty { text-align: center; padding: 40px; color: var(--text-muted); font-style: italic; }
  @media (max-width: 600px) {
    .grid-2 { grid-template-columns: 1fr; }
    .grid-3 { grid-template-columns: 1fr 1fr; }
    .checkbox-grid { grid-template-columns: 1fr 1fr; }
  }
</style>`;

function navHtml(base: string, active: string): string {
  const link = (href: string, label: string) =>
    `<a href="${base}${href}" class="${active === href ? "active" : ""}">${label}</a>`;
  return `<nav class="nav">
    <span class="logo">Workout Generator</span>
    ${link("/", "Generate")}
    ${link("/exercises", "Exercises")}
    ${link("/history", "History")}
  </nav>`;
}

function pageShell(base: string, active: string, title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - Workout Generator</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js"><\/script>
  ${STYLES}
</head>
<body>
  ${navHtml(base, active)}
  ${bodyContent}
</body>
</html>`;
}

function buildGeneratorPage(base: string): string {
  return pageShell(
    base,
    "/",
    "Generate",
    `
  <div class="container">
    <h1>Generate Workout</h1>
    <div id="auth-gate" class="loading">Checking authentication...</div>
    <div id="generator" style="display:none">
      <div class="card">
        <h2>Workout Type</h2>
        <div class="grid-2" style="margin-bottom: 16px">
          <div>
            <label>Split</label>
            <select id="split">
              <option value="push">Push (Chest/Shoulders/Triceps)</option>
              <option value="pull">Pull (Back/Biceps)</option>
              <option value="legs">Legs</option>
              <option value="upper">Upper Body</option>
              <option value="lower">Lower Body</option>
              <option value="full_body" selected>Full Body</option>
              <option value="chest_back">Chest &amp; Back</option>
              <option value="shoulders_arms">Shoulders &amp; Arms</option>
              <option value="chest_triceps">Chest &amp; Triceps</option>
              <option value="back_biceps">Back &amp; Biceps</option>
              <option value="core">Core</option>
            </select>
          </div>
          <div>
            <label>Goal</label>
            <select id="goal">
              <option value="hypertrophy" selected>Hypertrophy (Muscle Growth)</option>
              <option value="strength">Strength</option>
              <option value="endurance">Muscular Endurance</option>
              <option value="power">Power</option>
              <option value="general">General Fitness</option>
            </select>
          </div>
        </div>
        <div class="grid-2">
          <div>
            <label>Experience Level</label>
            <select id="experience">
              <option value="beginner">Beginner</option>
              <option value="intermediate" selected>Intermediate</option>
              <option value="expert">Advanced</option>
            </select>
          </div>
          <div>
            <label>Duration</label>
            <div class="slider-container">
              <input type="range" id="duration" min="20" max="120" value="60" step="5">
              <span class="slider-value" id="duration-val">60 min</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Available Equipment</h2>
        <div class="checkbox-grid" id="equipment-grid"></div>
      </div>

      <div style="display:flex; gap:12px; margin-bottom:20px">
        <button class="btn btn-primary" id="generate-btn" onclick="generatePlan()">Generate Workout</button>
        <button class="btn btn-secondary" id="save-prefs-btn" onclick="savePrefs()">Save Preferences</button>
      </div>

      <div id="plan-result"></div>
    </div>
  </div>

  <script>
    const BASE = "${base}";
    let currentUser = null;
    let currentPlanId = null;
    let currentPlan = null;

    const EQUIPMENT_LIST = [
      "barbell", "dumbbell", "body only", "cable", "machine",
      "kettlebells", "bands", "medicine ball", "e-z curl bar",
      "exercise ball", "other"
    ];

    async function init() {
      try {
        const res = await fetch(BASE + "/api/me");
        if (!res.ok) throw new Error("not authed");
        const data = await res.json();
        currentUser = data.username;
        document.getElementById("auth-gate").style.display = "none";
        document.getElementById("generator").style.display = "block";
        renderEquipment();
        loadPrefs();
      } catch {
        document.getElementById("auth-gate").innerHTML =
          '<p>You need to be logged in. <a href="/" style="color:var(--accent)">Log in via clung.us</a></p>';
      }
    }

    function renderEquipment() {
      const grid = document.getElementById("equipment-grid");
      const defaultEquip = ["barbell", "dumbbell", "body only"];
      grid.innerHTML = EQUIPMENT_LIST.map(e => {
        const checked = defaultEquip.includes(e);
        return '<label class="checkbox-item ' + (checked ? 'checked' : '') + '" onclick="toggleEquip(this)">' +
          '<input type="checkbox" value="' + e + '"' + (checked ? ' checked' : '') + '>' +
          e + '</label>';
      }).join("");
    }

    function toggleEquip(el) {
      const cb = el.querySelector("input");
      cb.checked = !cb.checked;
      el.classList.toggle("checked", cb.checked);
    }

    async function loadPrefs() {
      try {
        const res = await fetch(BASE + "/api/preferences");
        if (!res.ok) return;
        const data = await res.json();
        if (data.equipment) {
          document.querySelectorAll("#equipment-grid input").forEach(cb => {
            const checked = data.equipment.includes(cb.value);
            cb.checked = checked;
            cb.parentElement.classList.toggle("checked", checked);
          });
        }
        if (data.duration) {
          document.getElementById("duration").value = data.duration;
          document.getElementById("duration-val").textContent = data.duration + " min";
        }
      } catch (e) {
        console.warn("[workout] loadPrefs failed:", e);
      }
    }

    async function savePrefs() {
      const equipment = [...document.querySelectorAll("#equipment-grid input:checked")].map(c => c.value);
      const duration = parseInt(document.getElementById("duration").value);
      await fetch(BASE + "/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipment, duration })
      });
      document.getElementById("save-prefs-btn").textContent = "Saved!";
      setTimeout(() => document.getElementById("save-prefs-btn").textContent = "Save Preferences", 1500);
    }

    document.getElementById("duration").addEventListener("input", function() {
      document.getElementById("duration-val").textContent = this.value + " min";
    });

    async function generatePlan() {
      const btn = document.getElementById("generate-btn");
      btn.disabled = true;
      btn.textContent = "Generating...";

      const equipment = [...document.querySelectorAll("#equipment-grid input:checked")].map(c => c.value);
      if (equipment.length === 0) {
        alert("Select at least one equipment type");
        btn.disabled = false;
        btn.textContent = "Generate Workout";
        return;
      }

      try {
        const res = await fetch(BASE + "/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            split: document.getElementById("split").value,
            equipment,
            duration: parseInt(document.getElementById("duration").value),
            goal: document.getElementById("goal").value,
            experience: document.getElementById("experience").value
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "generation failed");
        }

        const plan = await res.json();
        currentPlanId = plan.id;
        currentPlan = plan;
        renderPlan(plan);
      } catch (e) {
        document.getElementById("plan-result").innerHTML =
          '<div class="card" style="color:var(--danger)">Error: ' + e.message + '</div>';
      } finally {
        btn.disabled = false;
        btn.textContent = "Generate Workout";
      }
    }

    function renderPlan(plan) {
      const result = document.getElementById("plan-result");
      let exHtml = "";
      for (let i = 0; i < plan.exercises.length; i++) {
        const ex = plan.exercises[i];
        const tags = ex.muscle_groups.slice(0, 3).map(m => '<span class="tag">' + m + '</span>').join("");
        const compoundTag = ex.is_compound ? '<span class="tag compound">compound</span>' : '';
        const escapedName = ex.name.replace(/'/g, "\\\\'");

        exHtml += '<li class="exercise-item" data-name="' + ex.name + '">' +
          '<div class="exercise-num">' + (i + 1) + '</div>' +
          '<div class="exercise-info">' +
            '<div class="exercise-name">' + ex.name + ' ' + compoundTag + '</div>' +
            '<div class="exercise-meta">' + tags + ' &middot; ' + ex.equipment + '</div>' +
            '<div class="exercise-params">' +
              '<span><strong>' + ex.sets + '</strong> sets</span>' +
              '<span><strong>' + ex.reps + '</strong> reps</span>' +
              '<span>Rest: <strong>' + ex.rest + '</strong></span>' +
            '</div>' +
            '<div id="alts-' + i + '"></div>' +
          '</div>' +
          '<button class="swap-btn" onclick="showAlternatives(\\'' + escapedName + '\\', ' + i + ')">Swap</button>' +
        '</li>';
      }

      result.innerHTML =
        '<div class="card">' +
          '<div class="plan-header">' +
            '<div>' +
              '<h2 style="margin-bottom:4px">' + plan.title + '</h2>' +
              '<div class="meta">' + plan.duration_minutes + ' min &middot; ' + plan.exercises.length + ' exercises</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px">' +
              '<button class="btn btn-secondary" onclick="generatePlan()" style="padding:8px 16px;font-size:13px">Regenerate</button>' +
              '<a href="' + BASE + '/view/' + plan.id + '" class="btn btn-secondary" style="padding:8px 16px;font-size:13px;text-decoration:none">Permalink</a>' +
            '</div>' +
          '</div>' +
          '<div style="margin-bottom:12px;padding:10px 14px;background:var(--accent-dim);border-radius:6px;font-size:13px">' +
            '<strong>Warmup:</strong> ' + plan.warmup +
          '</div>' +
          '<ul class="exercise-list" id="exercise-list">' + exHtml + '</ul>' +
          '<div style="margin-top:12px;padding:10px 14px;background:var(--accent-dim);border-radius:6px;font-size:13px">' +
            '<strong>Cooldown:</strong> ' + plan.cooldown +
          '</div>' +
        '</div>';

      new Sortable(document.getElementById("exercise-list"), {
        animation: 150,
        ghostClass: "dragging",
        onEnd: function() {
          updateNumbers();
          savePlanOrder();
        }
      });
    }

    function updateNumbers() {
      document.querySelectorAll(".exercise-item .exercise-num").forEach(function(el, i) {
        el.textContent = i + 1;
      });
    }

    async function savePlanOrder() {
      if (!currentPlanId || !currentPlan) return;
      var items = document.querySelectorAll(".exercise-item");
      var newOrder = [];
      items.forEach(function(item) {
        var name = item.dataset.name;
        var ex = currentPlan.exercises.find(function(e) { return e.name === name; });
        if (ex) newOrder.push(ex);
      });
      currentPlan.exercises = newOrder;
      await fetch(BASE + "/api/plan/" + currentPlanId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exercises: newOrder })
      });
    }

    async function showAlternatives(name, idx) {
      var container = document.getElementById("alts-" + idx);
      if (container.innerHTML) { container.innerHTML = ""; return; }

      container.innerHTML = '<div class="loading" style="padding:8px">Loading...</div>';
      var res = await fetch(BASE + "/api/exercises/alternatives?name=" + encodeURIComponent(name));
      var data = await res.json();

      if (!data.alternatives.length) {
        container.innerHTML = '<div class="alt-list"><div style="padding:8px;color:var(--text-muted)">No alternatives found</div></div>';
        return;
      }

      var html = '<div class="alt-list">';
      for (var i = 0; i < data.alternatives.length; i++) {
        var a = data.alternatives[i];
        var eName = a.name.replace(/'/g, "\\\\'");
        html += '<div class="alt-item" onclick="swapExercise(' + idx + ', \\'' + eName + '\\', \\'' + a.muscle_groups + '\\', \\'' + a.equipment + '\\', ' + a.is_compound + ')">' +
          a.name + ' <span style="color:var(--text-muted);font-size:11px">(' + a.equipment + ')</span></div>';
      }
      html += '</div>';
      container.innerHTML = html;
    }

    function swapExercise(idx, name, muscles, equip, isCompound) {
      if (!currentPlan) return;
      var ex = currentPlan.exercises[idx];
      ex.name = name;
      ex.muscle_groups = muscles.split(",").map(function(m) { return m.trim(); });
      ex.equipment = equip;
      ex.is_compound = !!isCompound;
      renderPlan(currentPlan);
      savePlanOrder();
    }

    init();
  <\/script>`
  );
}

function buildHistoryPage(base: string): string {
  return pageShell(
    base,
    "/history",
    "History",
    `
  <div class="container">
    <h1>Plan History</h1>
    <div id="history-content" class="loading">Loading...</div>
  </div>
  <script>
    const BASE = "${base}";
    async function loadHistory() {
      try {
        const res = await fetch(BASE + "/api/plans");
        if (!res.ok) {
          document.getElementById("history-content").innerHTML =
            '<p>You need to be logged in. <a href="/" style="color:var(--accent)">Log in via clung.us</a></p>';
          return;
        }
        const data = await res.json();
        if (!data.plans.length) {
          document.getElementById("history-content").innerHTML =
            '<div class="empty">No workouts generated yet. <a href="' + BASE + '/" style="color:var(--accent)">Generate one!</a></div>';
          return;
        }
        var html = "";
        for (var i = 0; i < data.plans.length; i++) {
          var p = data.plans[i];
          html += '<a class="history-item" href="' + BASE + '/view/' + p.id + '">' +
            '<div>' +
              '<div class="history-title">' + p.title + '</div>' +
              '<div class="history-meta">' + p.exercise_count + ' exercises &middot; ' + p.duration_minutes + ' min</div>' +
            '</div>' +
            '<div style="color:var(--text-muted);font-size:12px">' + new Date(p.created_at + 'Z').toLocaleDateString() + '</div>' +
          '</a>';
        }
        document.getElementById("history-content").innerHTML = html;
      } catch (e) {
        document.getElementById("history-content").innerHTML =
          '<div style="color:var(--danger)">Error loading history</div>';
      }
    }
    loadHistory();
  <\/script>`
  );
}

function buildExercisesPage(base: string): string {
  return pageShell(
    base,
    "/exercises",
    "Exercises",
    `
  <div class="container">
    <h1>Exercise Database</h1>
    <div class="card" style="margin-bottom:16px">
      <div class="grid-3">
        <div>
          <label>Search</label>
          <input type="text" id="search-input" placeholder="Search exercises..." style="width:100%;padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:14px;outline:none">
        </div>
        <div>
          <label>Muscle Group</label>
          <select id="filter-muscle">
            <option value="">All</option>
          </select>
        </div>
        <div>
          <label>Equipment</label>
          <select id="filter-equipment">
            <option value="">All</option>
          </select>
        </div>
      </div>
    </div>
    <div id="exercise-count" style="color:var(--text-muted);font-size:13px;margin-bottom:12px"></div>
    <div id="exercises-list"></div>
    <div style="text-align:center;margin-top:16px">
      <button class="btn btn-secondary" id="load-more" onclick="loadMore()" style="display:none">Load More</button>
    </div>
  </div>
  <script>
    const BASE = "${base}";
    let offset = 0;
    const limit = 50;

    async function loadFilters() {
      const [mgRes, eqRes] = await Promise.all([
        fetch(BASE + "/api/muscle-groups"),
        fetch(BASE + "/api/equipment")
      ]);
      const mg = await mgRes.json();
      const eq = await eqRes.json();

      const mSelect = document.getElementById("filter-muscle");
      mg.muscle_groups.forEach(function(m) {
        const opt = document.createElement("option");
        opt.value = m; opt.textContent = m;
        mSelect.appendChild(opt);
      });

      const eSelect = document.getElementById("filter-equipment");
      eq.equipment.forEach(function(e) {
        const opt = document.createElement("option");
        opt.value = e; opt.textContent = e;
        eSelect.appendChild(opt);
      });
    }

    async function searchExercises(append) {
      if (!append) { offset = 0; }
      const q = document.getElementById("search-input").value;
      const muscle = document.getElementById("filter-muscle").value;
      const equip = document.getElementById("filter-equipment").value;

      const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
      if (q) params.set("q", q);
      if (muscle) params.set("muscle_group", muscle);
      if (equip) params.set("equipment", equip);

      const res = await fetch(BASE + "/api/exercises?" + params);
      const data = await res.json();

      document.getElementById("exercise-count").textContent = data.total + " exercises found";

      var html = "";
      for (var i = 0; i < data.exercises.length; i++) {
        var ex = data.exercises[i];
        var muscles = ex.muscle_groups.split(",").map(function(m) { return m.trim(); });
        var tags = muscles.slice(0, 4).map(function(m) { return '<span class="tag">' + m + '</span>'; }).join("");
        var compound = ex.is_compound ? '<span class="tag compound">compound</span>' : '';
        var desc = ex.description ? '<div style="font-size:12px;color:var(--text-muted);margin-top:6px;line-height:1.4">' + ex.description.slice(0, 200) + (ex.description.length > 200 ? '...' : '') + '</div>' : '';
        html += '<div class="exercise-item" style="cursor:default">' +
          '<div class="exercise-info">' +
            '<div class="exercise-name">' + ex.name + ' ' + compound + '</div>' +
            '<div class="exercise-meta">' + tags + ' &middot; ' + ex.equipment + ' &middot; ' + ex.difficulty + '</div>' +
            desc +
          '</div></div>';
      }

      const container = document.getElementById("exercises-list");
      if (append) { container.innerHTML += html; }
      else { container.innerHTML = html; }

      offset += data.exercises.length;
      document.getElementById("load-more").style.display =
        offset < data.total ? "inline-block" : "none";
    }

    function loadMore() { searchExercises(true); }

    let searchTimeout;
    document.getElementById("search-input").addEventListener("input", function() {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(function() { searchExercises(false); }, 300);
    });
    document.getElementById("filter-muscle").addEventListener("change", function() { searchExercises(false); });
    document.getElementById("filter-equipment").addEventListener("change", function() { searchExercises(false); });

    loadFilters();
    searchExercises(false);
  <\/script>`
  );
}

function buildPlanViewerPage(base: string): string {
  return pageShell(
    base,
    "",
    "View Plan",
    `
  <div class="container">
    <div id="plan-content" class="loading">Loading plan...</div>
  </div>
  <script>
    const BASE = "${base}";
    const planId = window.location.pathname.split("/view/")[1];

    async function loadPlan() {
      try {
        const res = await fetch(BASE + "/api/plan/" + planId);
        if (!res.ok) throw new Error("Plan not found");
        const plan = await res.json();

        var exHtml = "";
        for (var i = 0; i < plan.exercises.length; i++) {
          var ex = plan.exercises[i];
          var tags = ex.muscle_groups.slice(0, 3).map(function(m) { return '<span class="tag">' + m + '</span>'; }).join("");
          var compoundTag = ex.is_compound ? '<span class="tag compound">compound</span>' : '';
          exHtml += '<li class="exercise-item" style="cursor:default">' +
            '<div class="exercise-num">' + (i + 1) + '</div>' +
            '<div class="exercise-info">' +
              '<div class="exercise-name">' + ex.name + ' ' + compoundTag + '</div>' +
              '<div class="exercise-meta">' + tags + ' &middot; ' + ex.equipment + '</div>' +
              '<div class="exercise-params">' +
                '<span><strong>' + ex.sets + '</strong> sets</span>' +
                '<span><strong>' + ex.reps + '</strong> reps</span>' +
                '<span>Rest: <strong>' + ex.rest + '</strong></span>' +
              '</div>' +
            '</div>' +
          '</li>';
        }

        document.getElementById("plan-content").innerHTML =
          '<div class="plan-header">' +
            '<div>' +
              '<h1 style="margin-bottom:4px">' + plan.title + '</h1>' +
              '<div class="meta">' + plan.duration_minutes + ' min &middot; ' + plan.exercises.length + ' exercises &middot; ' + new Date(plan.created_at + 'Z').toLocaleString() + '</div>' +
            '</div>' +
            '<a href="' + BASE + '/" class="btn btn-secondary" style="padding:8px 16px;font-size:13px;text-decoration:none">New Workout</a>' +
          '</div>' +
          '<div class="card">' +
            '<div style="margin-bottom:12px;padding:10px 14px;background:var(--accent-dim);border-radius:6px;font-size:13px">' +
              '<strong>Warmup:</strong> ' + plan.warmup +
            '</div>' +
            '<ul class="exercise-list">' + exHtml + '</ul>' +
            '<div style="margin-top:12px;padding:10px 14px;background:var(--accent-dim);border-radius:6px;font-size:13px">' +
              '<strong>Cooldown:</strong> ' + plan.cooldown +
            '</div>' +
          '</div>';
      } catch (e) {
        document.getElementById("plan-content").innerHTML =
          '<div class="card" style="color:var(--danger)">Plan not found</div>';
      }
    }
    loadPlan();
  <\/script>`
  );
}
