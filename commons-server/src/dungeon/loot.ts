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
  rarity: "common" | "uncommon" | "rare";
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

class LootRegistry {
  private items: LootItem[] = [];

  /** Load all powerups from the SQLite powerups table. */
  loadFromDB(db: Database): void {
    const rows = db.query("SELECT id, slug, name, description, stat_modifier, rarity FROM powerups").all() as Array<{
      id: number;
      slug: string;
      name: string;
      description: string | null;
      stat_modifier: string;
      rarity: string;
    }>;

    this.items = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description ?? "",
      statModifier: JSON.parse(row.stat_modifier) as Record<string, number>,
      rarity: row.rarity as LootItem["rarity"],
    }));

    console.log(`[loot] Loaded ${this.items.length} powerups from DB`);
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
    console.log(`[loot] Registry replaced with ${this.items.length} items`);
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
   * Generate `count` distinct powerup choices, weighted by rarity.
   * Higher floors slightly bias toward better rarity.
   * Uses a seeded-ish approach via the provided RNG function (Math.random or similar).
   */
  generateChoices(count: number, floorNumber: number, rng: () => number = Math.random): LootItem[] {
    if (this.items.length === 0) return [];
    if (this.items.length <= count) return [...this.items];

    // Build per-rarity pools
    const pools: Record<string, LootItem[]> = { common: [], uncommon: [], rare: [] };
    for (const item of this.items) {
      const pool = pools[item.rarity];
      if (pool) pool.push(item);
    }

    // Adjusted weights for this floor
    const floorBonus = Math.max(0, floorNumber - 1);
    const weights = {
      common: Math.max(10, RARITY_WEIGHTS.common - floorBonus * (FLOOR_UNCOMMON_BONUS + FLOOR_RARE_BONUS)),
      uncommon: RARITY_WEIGHTS.uncommon + floorBonus * FLOOR_UNCOMMON_BONUS,
      rare: RARITY_WEIGHTS.rare + floorBonus * FLOOR_RARE_BONUS,
    };
    const totalWeight = weights.common + weights.uncommon + weights.rare;

    const chosen: LootItem[] = [];
    const usedIds = new Set<number>();

    let attempts = 0;
    while (chosen.length < count && attempts < count * 20) {
      attempts++;

      // Roll rarity
      const roll = rng() * totalWeight;
      let rarity: string;
      if (roll < weights.common) {
        rarity = "common";
      } else if (roll < weights.common + weights.uncommon) {
        rarity = "uncommon";
      } else {
        rarity = "rare";
      }

      const pool = pools[rarity];
      if (!pool || pool.length === 0) continue;

      // Pick random item from pool
      const item = pool[Math.floor(rng() * pool.length)];
      if (usedIds.has(item.id)) continue;

      usedIds.add(item.id);
      chosen.push(item);
    }

    // If we couldn't fill enough from weighted selection, fill from remaining items
    if (chosen.length < count) {
      for (const item of this.items) {
        if (chosen.length >= count) break;
        if (!usedIds.has(item.id)) {
          usedIds.add(item.id);
          chosen.push(item);
        }
      }
    }

    return chosen;
  }
}

// ─── Singleton + DB bootstrap ───────────────────────────────────────────────

export const lootRegistry = new LootRegistry();

const SEED_POWERUPS = [
  { slug: "minor-heal", name: "Minor Heal", description: "A small restorative blessing.", stat_modifier: '{"hp": 20}', rarity: "common" },
  { slug: "quick-feet", name: "Quick Feet", description: "Light boots that make you nimble.", stat_modifier: '{"spd": 3}', rarity: "common" },
  { slug: "iron-skin", name: "Iron Skin", description: "Your skin hardens against blows.", stat_modifier: '{"def": 3}', rarity: "common" },
  { slug: "berserkers-rage", name: "Berserker's Rage", description: "Trade protection for raw power.", stat_modifier: '{"atk": 5, "def": -2}', rarity: "uncommon" },
  { slug: "lucky-charm", name: "Lucky Charm", description: "Fortune smiles upon you.", stat_modifier: '{"lck": 5}', rarity: "uncommon" },
  { slug: "vitality", name: "Vitality", description: "A surge of life force.", stat_modifier: '{"hp": 30}', rarity: "uncommon" },
  { slug: "glass-cannon", name: "Glass Cannon", description: "Devastating power at a terrible cost.", stat_modifier: '{"atk": 10, "hp": -20}', rarity: "rare" },
  { slug: "fortunes-favor", name: "Fortune's Favor", description: "Luck and speed in equal measure.", stat_modifier: '{"lck": 8, "spd": 3}', rarity: "rare" },
  { slug: "juggernaut", name: "Juggernaut", description: "An immovable object. Slow but nearly indestructible.", stat_modifier: '{"def": 8, "hp": 20, "spd": -3}', rarity: "rare" },
];

/**
 * Create the powerups table if it doesn't exist and seed it.
 * Then load everything into the registry.
 */
export function initLootSystem(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS powerups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      stat_modifier TEXT NOT NULL DEFAULT '{}',
      rarity TEXT NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare'))
    )
  `);

  // Seed if empty
  const count = db.query("SELECT COUNT(*) as cnt FROM powerups").get() as { cnt: number };
  if (count.cnt === 0) {
    const insert = db.prepare(
      "INSERT INTO powerups (slug, name, description, stat_modifier, rarity) VALUES (?, ?, ?, ?, ?)"
    );
    for (const p of SEED_POWERUPS) {
      insert.run(p.slug, p.name, p.description, p.stat_modifier, p.rarity);
    }
    console.log(`[loot] Seeded ${SEED_POWERUPS.length} powerups into DB`);
  }

  lootRegistry.loadFromDB(db);
}
