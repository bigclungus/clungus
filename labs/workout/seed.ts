/**
 * seed.ts — Seed the exercises DB from the free-exercise-db JSON.
 * Run: bun run seed.ts
 */
import { Database } from "bun:sqlite";

const DB_PATH = "/mnt/data/labs/workout/data.db";
const EXERCISES_JSON = "/tmp/exercises-raw.json";

const db = new Database(DB_PATH);

// Create tables
db.run(`DROP TABLE IF EXISTS exercises`);
db.run(`DROP TABLE IF EXISTS plans`);
db.run(`DROP TABLE IF EXISTS user_preferences`);

db.run(`CREATE TABLE exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  muscle_groups TEXT NOT NULL,
  equipment TEXT NOT NULL,
  difficulty TEXT DEFAULT 'intermediate',
  description TEXT,
  is_compound BOOLEAN DEFAULT 0,
  source TEXT DEFAULT 'scraped'
)`);

db.run(`CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  inputs TEXT NOT NULL,
  plan TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
)`);

db.run(`CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY,
  equipment TEXT,
  duration INTEGER,
  updated_at TEXT DEFAULT (datetime('now'))
)`);

// Load exercises
const raw = JSON.parse(await Bun.file(EXERCISES_JSON).text()) as Array<{
  name: string;
  force?: string;
  level: string;
  mechanic?: string;
  equipment?: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions?: string[];
  category: string;
}>;

const compoundCategories = new Set(["powerlifting", "strongman", "olympic weightlifting"]);
const compoundMechanics = new Set(["compound"]);

const insert = db.prepare(
  `INSERT OR IGNORE INTO exercises (name, muscle_groups, equipment, difficulty, description, is_compound, source)
   VALUES (?, ?, ?, ?, ?, ?, 'scraped')`
);

let count = 0;
const txn = db.transaction(() => {
  for (const ex of raw) {
    // Skip stretching/cardio for workout generation (keep strength/plyo/powerlifting/strongman)
    if (ex.category === "stretching" || ex.category === "cardio") continue;

    const allMuscles = [...new Set([...ex.primaryMuscles, ...ex.secondaryMuscles])];
    const muscleGroups = allMuscles.join(",");
    const equipment = (ex.equipment || "body only").toLowerCase();
    const difficulty = ex.level || "intermediate";
    const description = ex.instructions ? ex.instructions.join(" ") : "";
    const isCompound =
      compoundMechanics.has(ex.mechanic || "") ||
      compoundCategories.has(ex.category) ||
      allMuscles.length >= 3
        ? 1
        : 0;

    insert.run(ex.name, muscleGroups, equipment, difficulty, description, isCompound);
    count++;
  }
});

txn();

console.log(`Seeded ${count} exercises into ${DB_PATH}`);

// Print some stats
const total = (db.query("SELECT COUNT(*) as c FROM exercises").get() as { c: number }).c;
const compounds = (db.query("SELECT COUNT(*) as c FROM exercises WHERE is_compound = 1").get() as { c: number }).c;
const byEquip = db.query("SELECT equipment, COUNT(*) as c FROM exercises GROUP BY equipment ORDER BY c DESC").all();

console.log(`Total in DB: ${total} (${compounds} compound)`);
console.log("By equipment:");
for (const row of byEquip as Array<{ equipment: string; c: number }>) {
  console.log(`  ${row.equipment}: ${row.c}`);
}
