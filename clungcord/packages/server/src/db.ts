import { Database } from "bun:sqlite";
import path from "node:path";
import { mkdirSync } from "node:fs";

const DB_PATH = process.env.CLUNGCORD_DB ?? path.join(import.meta.dir, "../../data/clungcord.db");

// Ensure data directory exists
const dir = path.dirname(DB_PATH);
mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH, { create: true });

// WAL mode for better concurrent read/write
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      github_id INTEGER UNIQUE NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      status TEXT DEFAULT 'offline',
      last_seen INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (channel_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      edited_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);

    CREATE TABLE IF NOT EXISTS reactions (
      id INTEGER PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(message_id, user_id, emoji)
    );

    CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);

    CREATE TABLE IF NOT EXISTS custom_emojis (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS pinned_messages (
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      pinned_by INTEGER NOT NULL REFERENCES users(id),
      pinned_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (message_id)
    );

    CREATE INDEX IF NOT EXISTS idx_pinned_channel ON pinned_messages(channel_id, pinned_at);
  `);

  // Add reply_to_id column if missing (migration for existing DBs)
  try {
    db.exec("ALTER TABLE messages ADD COLUMN reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL");
  } catch (_) {
    // Column already exists
  }

  // Add use_count column to custom_emojis if missing
  try {
    db.exec("ALTER TABLE custom_emojis ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0");
  } catch (_) {
    // Column already exists
  }

  // Seed a default #general channel if none exist
  const row = db.query("SELECT COUNT(*) as c FROM channels").get() as { c: number };
  if (row.c === 0) {
    db.query("INSERT INTO channels (name, type) VALUES ('general', 'text')").run();
  }
}

migrate();

export default db;
