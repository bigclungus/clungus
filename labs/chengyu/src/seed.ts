// Seed the chengyu database from the public chinese-xinhua dataset
// Run once: bun run src/seed.ts

import { Database } from "bun:sqlite";

const DB_PATH = "/mnt/data/labs/chengyu/data.db";
const DATASET_URL =
  "https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/master/data/idiom.json";

console.log("Opening database...");
const db = new Database(DB_PATH);

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
db.run(`CREATE INDEX IF NOT EXISTS idx_pinyin ON chengyu(pinyin)`);

// Check if already seeded
const existing = (db.query("SELECT COUNT(*) as c FROM chengyu").get() as { c: number }).c;
if (existing > 0) {
  console.log(`Already seeded: ${existing} entries. Run with --force to reseed.`);
  if (!process.argv.includes("--force")) process.exit(0);
  db.run("DELETE FROM chengyu");
}

console.log(`Fetching dataset from ${DATASET_URL}...`);
const res = await fetch(DATASET_URL);
if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);

const data = (await res.json()) as {
  word: string;
  pinyin: string;
  explanation: string;
  derivation: string;
  example: string;
  abbreviation: string;
}[];

console.log(`Inserting ${data.length} entries...`);

const insert = db.prepare(
  `INSERT INTO chengyu (word, pinyin, explanation, derivation, example, abbreviation)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const insertAll = db.transaction((entries: typeof data) => {
  for (const e of entries) {
    insert.run(e.word, e.pinyin, e.explanation || "", e.derivation || "", e.example || "", e.abbreviation || "");
  }
});

insertAll(data);

const count = (db.query("SELECT COUNT(*) as c FROM chengyu").get() as { c: number }).c;
console.log(`Done. ${count} chengyu seeded.`);
