// Loot registry — designed to be swappable with LLM-generated loot later.
// Currently loads from SQLite powerups table.
// Future: pre-generate loot via knowledge graph before round starts.

import { Database } from "bun:sqlite";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LootItem {
  id: number;
  slug: string;
  name: string;
  description: string;
  statModifier: Record<string, number>; // e.g. { hp: 20, atk: 3, def: -1 }
  rarity: "common" | "uncommon" | "rare" | "cursed";
  /** Cursed items have better stats but a painful side effect applied to the player. */
  cursed?: boolean;
  /** Human-readable description of the curse (shown on the card). */
  curseDescription?: string;
  /**
   * Machine-readable curse effect applied at loot-pick time.
   * Keys map to flags on DungeonPlayer's cursedEffects bag.
   * Values are additive modifiers (e.g. enemyHpMult: 0.4 → enemies get +40% HP on the next floor).
   */
  curseEffect?: Record<string, number>;
}

// ─── Registry ───────────────────────────────────────────────────────────────

const RARITY_WEIGHTS: Record<string, number> = {
  common: 60,
  uncommon: 30,
  rare: 10,
};

// Per-floor rarity bonus: higher floors shift weight toward better rarity.
// Floor 1 = 0 shift, floor 2 = +5 uncommon / +3 rare, floor 3 = +10/+6, etc.
const FLOOR_UNCOMMON_BONUS = 5;
const FLOOR_RARE_BONUS = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface RarityPools {
  common: LootItem[];
  uncommon: LootItem[];
  rare: LootItem[];
  cursed: LootItem[];
}

interface RarityWeights {
  common: number;
  uncommon: number;
  rare: number;
}

function buildRarityPools(items: LootItem[]): RarityPools {
  const pools: RarityPools = { common: [], uncommon: [], rare: [], cursed: [] };
  for (const item of items) {
    if (item.rarity === "cursed") {
      pools.cursed.push(item);
    } else {
      pools[item.rarity].push(item);
    }
  }
  return pools;
}

function calcAdjustedWeights(floorNumber: number): RarityWeights {
  const floorBonus = Math.max(0, floorNumber - 1);
  return {
    common: Math.max(10, RARITY_WEIGHTS.common - floorBonus * (FLOOR_UNCOMMON_BONUS + FLOOR_RARE_BONUS)),
    uncommon: RARITY_WEIGHTS.uncommon + floorBonus * FLOOR_UNCOMMON_BONUS,
    rare: RARITY_WEIGHTS.rare + floorBonus * FLOOR_RARE_BONUS,
  };
}

function rollRarity(roll: number, weights: RarityWeights): keyof RarityPools {
  if (roll < weights.common) return "common";
  if (roll < weights.common + weights.uncommon) return "uncommon";
  return "rare";
}

function fillRemainingChoices(chosen: LootItem[], allItems: LootItem[], usedIds: Set<number>, count: number): void {
  for (const item of allItems) {
    if (chosen.length >= count) break;
    if (!usedIds.has(item.id)) {
      usedIds.add(item.id);
      chosen.push(item);
    }
  }
}

// ─── Registry ────────────────────────────────────────────────────────────────

class LootRegistry {
  private items: LootItem[] = [];

  /** Load all powerups from the SQLite powerups table. */
  loadFromDB(db: Database): void {
    const rows = db.query("SELECT id, slug, name, description, stat_modifier, rarity, curse_description, curse_effect FROM powerups").all() as {
      id: number;
      slug: string;
      name: string;
      description: string | null;
      stat_modifier: string;
      rarity: string;
      curse_description: string | null;
      curse_effect: string | null;
    }[];

    this.items = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description ?? "",
      statModifier: JSON.parse(row.stat_modifier) as Record<string, number>,
      rarity: row.rarity as LootItem["rarity"],
      cursed: row.rarity === "cursed",
      curseDescription: row.curse_description ?? undefined,
      curseEffect: row.curse_effect ? (JSON.parse(row.curse_effect) as Record<string, number>) : undefined,
    }));

    console.log(`[loot] Loaded ${String(this.items.length)} powerups from DB`);
  }

  /** Register a single item (for LLM-generated loot). */
  registerItem(item: LootItem): void {
    // Avoid duplicate IDs
    const existing = this.items.findIndex((i) => i.id === item.id);
    if (existing >= 0) {
      this.items[existing] = item;
    } else {
      this.items.push(item);
    }
  }

  /** Swap the entire registry contents (for batch LLM generation). */
  clearAndReplace(items: LootItem[]): void {
    this.items = [...items];
    console.log(`[loot] Registry replaced with ${String(this.items.length)} items`);
  }

  /** How many items are registered. */
  get size(): number {
    return this.items.length;
  }

  /** Look up a single item by ID. */
  getById(id: number): LootItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  /**
   * Generate `count` distinct normal powerup choices, weighted by rarity.
   * Higher floors slightly bias toward better rarity.
   * Uses a seeded-ish approach via the provided RNG function (Math.random or similar).
   */
  generateChoices(count: number, floorNumber: number, rng: () => number = Math.random): LootItem[] {
    const normalItems = this.items.filter((i) => i.rarity !== "cursed");
    if (normalItems.length === 0) return [];
    if (normalItems.length <= count) return [...normalItems];

    const pools = buildRarityPools(normalItems);
    const weights = calcAdjustedWeights(floorNumber);
    const totalWeight = weights.common + weights.uncommon + weights.rare;

    const chosen: LootItem[] = [];
    const usedIds = new Set<number>();

    let attempts = 0;
    while (chosen.length < count && attempts < count * 20) {
      attempts++;
      const rarity = rollRarity(rng() * totalWeight, weights);
      const pool = pools[rarity];
      if (pool.length === 0) continue;
      const item = pool[Math.floor(rng() * pool.length)];
      if (usedIds.has(item.id)) continue;
      usedIds.add(item.id);
      chosen.push(item);
    }

    fillRemainingChoices(chosen, normalItems, usedIds, count);
    return chosen;
  }

  /** Pick one random cursed item. Returns null if no cursed items exist. */
  generateCursedChoice(rng: () => number = Math.random): LootItem | null {
    const cursedItems = this.items.filter((i) => i.rarity === "cursed");
    if (cursedItems.length === 0) return null;
    return cursedItems[Math.floor(rng() * cursedItems.length)];
  }
}

// ─── Singleton + DB bootstrap ───────────────────────────────────────────────

export const lootRegistry = new LootRegistry();

const SEED_POWERUPS = [
  { slug: "minor-heal", name: "Minor Heal", description: "A small restorative blessing.", stat_modifier: '{"hp": 20}', rarity: "common", curse_description: null, curse_effect: null },
  { slug: "quick-feet", name: "Quick Feet", description: "Light boots that make you nimble.", stat_modifier: '{"spd": 3}', rarity: "common", curse_description: null, curse_effect: null },
  { slug: "iron-skin", name: "Iron Skin", description: "Your skin hardens against blows.", stat_modifier: '{"def": 3}', rarity: "common", curse_description: null, curse_effect: null },
  { slug: "berserkers-rage", name: "Berserker's Rage", description: "Trade protection for raw power.", stat_modifier: '{"atk": 5, "def": -2}', rarity: "uncommon", curse_description: null, curse_effect: null },
  { slug: "lucky-charm", name: "Lucky Charm", description: "Fortune smiles upon you.", stat_modifier: '{"lck": 5}', rarity: "uncommon", curse_description: null, curse_effect: null },
  { slug: "vitality", name: "Vitality", description: "A surge of life force.", stat_modifier: '{"hp": 30}', rarity: "uncommon", curse_description: null, curse_effect: null },
  { slug: "glass-cannon", name: "Glass Cannon", description: "Devastating power at a terrible cost.", stat_modifier: '{"atk": 10, "hp": -20}', rarity: "rare", curse_description: null, curse_effect: null },
  { slug: "fortunes-favor", name: "Fortune's Favor", description: "Luck and speed in equal measure.", stat_modifier: '{"lck": 8, "spd": 3}', rarity: "rare", curse_description: null, curse_effect: null },
  { slug: "juggernaut", name: "Juggernaut", description: "An immovable object. Slow but nearly indestructible.", stat_modifier: '{"def": 8, "hp": 20, "spd": -3}', rarity: "rare", curse_description: null, curse_effect: null },
  // ─── Cursed loot ─────────────────────────────────────────────────────────
  {
    slug: "blood-pact",
    name: "Blood Pact",
    description: "+25 ATK. Enemies on the next floor spawn with 40% more HP.",
    stat_modifier: '{"atk": 25}',
    rarity: "cursed",
    curse_description: "Enemies spawn with +40% HP",
    curse_effect: '{"enemyHpMult": 0.4}',
  },
  {
    slug: "devils-bargain",
    name: "Devil's Bargain",
    description: "+50 max HP. Your spacebar power cooldown is doubled.",
    stat_modifier: '{"hp": 50}',
    rarity: "cursed",
    curse_description: "Power cooldown x2",
    curse_effect: '{"powerCooldownMult": 1.0}',
  },
  {
    slug: "adrenaline-curse",
    name: "Adrenaline Curse",
    description: "+4 SPD, +8 ATK. You take 30% more damage from all sources.",
    stat_modifier: '{"spd": 4, "atk": 8}',
    rarity: "cursed",
    curse_description: "Take +30% damage from all hits",
    curse_effect: '{"damageTakenMult": 0.3}',
  },
  {
    slug: "iron-hubris",
    name: "Iron Hubris",
    description: "+10 DEF, +12 ATK. You start the next floor at half HP.",
    stat_modifier: '{"def": 10, "atk": 12}',
    rarity: "cursed",
    curse_description: "Start next floor at 50% HP",
    curse_effect: '{"halfHpOnFloor": 1}',
  },
  {
    slug: "venom-soul",
    name: "Venom Soul",
    description: "+10 ATK, +8 LCK. Enemies deal +25% ATK on every hit.",
    stat_modifier: '{"atk": 10, "lck": 8}',
    rarity: "cursed",
    curse_description: "Enemy ATK +25%",
    curse_effect: '{"enemyAtkMult": 0.25}',
  },
];

/**
 * Create the powerups table if it doesn't exist and seed it.
 * Then load everything into the registry.
 */
export function initLootSystem(db: Database): void {
  // ── Migration: ensure the powerups table exists with the current schema ──────
  // If the table already exists with the old CHECK constraint (no 'cursed'),
  // recreate it via the rename-copy-drop pattern (SQLite can't ALTER constraints).
  const tableInfo = db.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='powerups'").get() as { sql: string } | null;
  const needsMigration = tableInfo && !tableInfo.sql.includes("'cursed'") && !tableInfo.sql.includes('"cursed"');

  if (needsMigration) {
    console.log("[loot] Migrating powerups table to add 'cursed' rarity support...");
    db.run("ALTER TABLE powerups RENAME TO powerups_old");
    db.run(`
      CREATE TABLE powerups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        stat_modifier TEXT NOT NULL DEFAULT '{}',
        rarity TEXT NOT NULL,
        curse_description TEXT,
        curse_effect TEXT
      )
    `);
    // Copy existing rows (old columns only — curse columns default to NULL)
    try {
      db.run("INSERT INTO powerups (id, slug, name, description, stat_modifier, rarity) SELECT id, slug, name, description, stat_modifier, rarity FROM powerups_old");
    } catch (e) {
      // Try with curse columns if they existed
      db.run("INSERT INTO powerups SELECT * FROM powerups_old");
    }
    db.run("DROP TABLE powerups_old");
    console.log("[loot] Migration complete.");
  } else if (!tableInfo) {
    // Table doesn't exist yet — create fresh
    db.run(`
      CREATE TABLE IF NOT EXISTS powerups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        stat_modifier TEXT NOT NULL DEFAULT '{}',
        rarity TEXT NOT NULL,
        curse_description TEXT,
        curse_effect TEXT
      )
    `);
  }

  // Add curse columns to existing tables that predate them (idempotent)
  try { db.run("ALTER TABLE powerups ADD COLUMN curse_description TEXT"); } catch { /* already exists */ }
  try { db.run("ALTER TABLE powerups ADD COLUMN curse_effect TEXT"); } catch { /* already exists */ }

  // Seed if empty
  const count = db.query("SELECT COUNT(*) as cnt FROM powerups").get() as { cnt: number };
  if (count.cnt === 0) {
    const insert = db.prepare(
      "INSERT INTO powerups (slug, name, description, stat_modifier, rarity, curse_description, curse_effect) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const p of SEED_POWERUPS) {
      insert.run(p.slug, p.name, p.description, p.stat_modifier, p.rarity, p.curse_description ?? null, p.curse_effect ?? null);
    }
    console.log(`[loot] Seeded ${String(SEED_POWERUPS.length)} powerups into DB`);
  } else {
    // Upsert cursed items in case they were added after initial seed
    const upsert = db.prepare(
      "INSERT OR IGNORE INTO powerups (slug, name, description, stat_modifier, rarity, curse_description, curse_effect) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const p of SEED_POWERUPS.filter((s) => s.rarity === "cursed")) {
      upsert.run(p.slug, p.name, p.description, p.stat_modifier, p.rarity, p.curse_description ?? null, p.curse_effect ?? null);
    }
  }

  lootRegistry.loadFromDB(db);
}
