// Mob registry — cache layer for LLM-generated (and seed) enemies.
// Loads from SQLite mob_cache table. selectForRun() produces EnemyVariant[]
// compatible with the existing dungeon generation pipeline.

import { Database } from "bun:sqlite";
import { readdirSync } from "fs";
import type { EnemyVariant } from "./dungeon-generation.ts";

// ─── Image availability ──────────────────────────────────────────────────────

const MOB_IMAGES_DIR = "/mnt/data/hello-world/static/mob-images";

/** Convert a display name to the slug used for PNG filenames.
 *  Must match the mobSlug() function in the client JS.
 */
function displayNameToSlug(displayName: string): string {
  return displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Return the set of slugs that have a PNG in MOB_IMAGES_DIR. */
function loadAvailableImageSlugs(): Set<string> {
  try {
    const files = readdirSync(MOB_IMAGES_DIR);
    return new Set(
      files
        .filter((f) => f.endsWith(".png"))
        .map((f) => f.slice(0, -4))
    );
  } catch {
    return new Set();
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type MobBehavior = "melee_chase" | "ranged_pattern" | "slow_charge";

export interface MobRegistryItem {
  entityName: string;
  displayName: string;
  behavior: MobBehavior;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  budgetCost: number;
  flavorText: string | null;
  spritePng: Buffer | null;
  spriteHash: string | null;
}

// ─── Behavior mapping ───────────────────────────────────────────────────────

// Map mob_cache behaviors to the EnemyVariant behavior field used by dungeon-generation.
const BEHAVIOR_TO_VARIANT: Record<MobBehavior, "crawler" | "spitter" | "brute"> = {
  melee_chase: "crawler",
  ranged_pattern: "spitter",
  slow_charge: "brute",
};

// ─── Registry ───────────────────────────────────────────────────────────────

class MobRegistry {
  private items = new Map<string, MobRegistryItem>();

  /** Load all mobs from the mob_cache table. */
  loadFromDB(db: Database): void {
    const rows = db
      .query(
        `SELECT entity_name, display_name, behavior, hp, atk, def, spd,
                budget_cost, flavor_text, sprite_png, sprite_hash
         FROM mob_cache`
      )
      .all() as {
        entity_name: string;
        display_name: string;
        behavior: string;
        hp: number;
        atk: number;
        def: number;
        spd: number;
        budget_cost: number;
        flavor_text: string | null;
        sprite_png: Buffer | null;
        sprite_hash: string | null;
      }[];

    this.items.clear();
    for (const row of rows) {
      this.items.set(row.entity_name, {
        entityName: row.entity_name,
        displayName: row.display_name,
        behavior: row.behavior as MobBehavior,
        hp: row.hp,
        atk: row.atk,
        def: row.def,
        spd: row.spd,
        budgetCost: row.budget_cost,
        flavorText: row.flavor_text,
        spritePng: row.sprite_png,
        spriteHash: row.sprite_hash,
      });
    }

    console.log(`[mob-registry] Loaded ${String(this.items.size)} mobs from DB`);
  }

  /** Register a single mob. */
  registerMob(item: MobRegistryItem): void {
    this.items.set(item.entityName, item);
  }

  /** Register multiple mobs at once. */
  bulkRegister(items: MobRegistryItem[]): void {
    for (const item of items) {
      this.items.set(item.entityName, item);
    }
  }

  /** Get a cached mob by entity name. */
  getMob(entityName: string): MobRegistryItem | undefined {
    return this.items.get(entityName);
  }

  /** Check if a mob is cached. */
  hasMob(entityName: string): boolean {
    return this.items.has(entityName);
  }

  /** Return all cached items. */
  getAll(): MobRegistryItem[] {
    return Array.from(this.items.values());
  }

  /** How many mobs are registered. */
  get size(): number {
    return this.items.size;
  }

  /** Look up a mob by its display name (case-insensitive exact match). */
  getByDisplayName(displayName: string): MobRegistryItem | undefined {
    const lower = displayName.toLowerCase();
    for (const item of this.items.values()) {
      if (item.displayName.toLowerCase() === lower) return item;
    }
    return undefined;
  }

  /** Public wrapper around toVariant for use outside the class (e.g. dungeon-loop). */
  toVariantPublic(mob: MobRegistryItem, id: number): EnemyVariant {
    return this.toVariant(mob, id);
  }

  /** Check whether a mob has a rendered PNG image available. */
  hasImage(mob: MobRegistryItem): boolean {
    const slug = displayNameToSlug(mob.displayName);
    const available = loadAvailableImageSlugs();
    return available.has(slug);
  }

  /**
   * Select N mobs uniformly at random, returning them as EnemyVariant[]
   * compatible with the dungeon generation pipeline.
   * Assigns sequential IDs starting at 1 and floor_min = 1 for all.
   *
   * @param count    How many mobs to select.
   * @param rng      Optional seeded RNG (defaults to Math.random).
   * @param imageOnly When true, only mobs with a corresponding PNG in
   *                  MOB_IMAGES_DIR are eligible. If fewer image-backed mobs
   *                  exist than `count`, all available image-backed mobs are
   *                  returned (no fallback to image-less mobs).
   */
  selectForRun(count: number, rng: () => number = Math.random, imageOnly = false): EnemyVariant[] {
    let all = Array.from(this.items.values());

    if (imageOnly) {
      const available = loadAvailableImageSlugs();
      const before = all.length;
      all = all.filter((m) => available.has(displayNameToSlug(m.displayName)));
      console.log(`[mob-registry] selectForRun imageOnly: ${String(all.length)}/${String(before)} mobs have images`);
    }

    if (all.length === 0) return [];
    if (all.length <= count) return all.map((m, i) => this.toVariant(m, i + 1));

    // Fisher-Yates partial shuffle to pick `count` items
    const pool = [...all];
    const selected: MobRegistryItem[] = [];
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(rng() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      selected.push(pool[i]);
    }

    return selected.map((m, i) => this.toVariant(m, i + 1));
  }

  /** Convert a MobRegistryItem to an EnemyVariant for the dungeon pipeline. */
  private toVariant(mob: MobRegistryItem, id: number): EnemyVariant {
    return {
      id,
      name: mob.displayName,
      behavior: BEHAVIOR_TO_VARIANT[mob.behavior],
      hp: mob.hp,
      atk: mob.atk,
      def: mob.def,
      spd: mob.spd,
      floor_min: 1,
      budget_cost: mob.budgetCost,
    };
  }
}

// ─── Singleton + DB bootstrap ───────────────────────────────────────────────

export const mobRegistry = new MobRegistry();

const SEED_MOBS: {
  entity_name: string;
  display_name: string;
  behavior: MobBehavior;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  budget_cost: number;
  flavor_text: string;
}[] = [
  // melee_chase tier
  { entity_name: "cave_rat", display_name: "Cave Rat", behavior: "melee_chase", hp: 30, atk: 8, def: 4, spd: 10, budget_cost: 5, flavor_text: "Gnaws at anything that moves." },
  { entity_name: "shadow_hound", display_name: "Shadow Hound", behavior: "melee_chase", hp: 39, atk: 10, def: 5, spd: 13, budget_cost: 7, flavor_text: "Hunts by scent in total darkness." },
  { entity_name: "feral_stalker", display_name: "Feral Stalker", behavior: "melee_chase", hp: 48, atk: 13, def: 6, spd: 16, budget_cost: 9, flavor_text: "Once human, now something far worse." },
  // ranged_pattern tier
  { entity_name: "fungal_spore", display_name: "Fungal Spore", behavior: "ranged_pattern", hp: 20, atk: 12, def: 2, spd: 6, budget_cost: 5, flavor_text: "Bursts into a toxic cloud when threatened." },
  { entity_name: "acid_sprayer", display_name: "Acid Sprayer", behavior: "ranged_pattern", hp: 26, atk: 16, def: 3, spd: 8, budget_cost: 7, flavor_text: "Corrosive jets melt through armor." },
  { entity_name: "chaos_weaver", display_name: "Chaos Weaver", behavior: "ranged_pattern", hp: 30, atk: 18, def: 3, spd: 9, budget_cost: 9, flavor_text: "Threads of arcane energy lash out unpredictably." },
  // slow_charge tier
  { entity_name: "stone_golem", display_name: "Stone Golem", behavior: "slow_charge", hp: 60, atk: 15, def: 10, spd: 3, budget_cost: 5, flavor_text: "Ancient stone given terrible purpose." },
  { entity_name: "iron_behemoth", display_name: "Iron Behemoth", behavior: "slow_charge", hp: 84, atk: 21, def: 14, spd: 4, budget_cost: 7, flavor_text: "Each step shakes the ground beneath you." },
  { entity_name: "abyssal_titan", display_name: "Abyssal Titan", behavior: "slow_charge", hp: 108, atk: 27, def: 18, spd: 5, budget_cost: 9, flavor_text: "Born in the deepest crevice, it knows nothing but destruction." },
];

/**
 * Create the mob_cache table if it doesn't exist, seed defaults if empty,
 * and load everything into the registry.
 */
export function initMobRegistry(db: Database): void {
  // Table should already exist from migration, but ensure it does
  db.run(`
    CREATE TABLE IF NOT EXISTS mob_cache (
      entity_name TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      behavior TEXT NOT NULL CHECK (behavior IN ('melee_chase', 'ranged_pattern', 'slow_charge')),
      hp INTEGER NOT NULL,
      atk INTEGER NOT NULL,
      def INTEGER NOT NULL,
      spd REAL NOT NULL,
      budget_cost INTEGER NOT NULL DEFAULT 5,
      flavor_text TEXT,
      sprite_png BLOB,
      sprite_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS run_mob_selections (
      run_id TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      PRIMARY KEY (run_id, entity_name)
    )
  `);

  // Seed if empty
  const count = db.query("SELECT COUNT(*) as cnt FROM mob_cache").get() as { cnt: number };
  if (count.cnt === 0) {
    const insert = db.prepare(
      `INSERT INTO mob_cache (entity_name, display_name, behavior, hp, atk, def, spd, budget_cost, flavor_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const m of SEED_MOBS) {
      insert.run(m.entity_name, m.display_name, m.behavior, m.hp, m.atk, m.def, m.spd, m.budget_cost, m.flavor_text);
    }
    console.log(`[mob-registry] Seeded ${String(SEED_MOBS.length)} mobs into DB`);
  }

  mobRegistry.loadFromDB(db);
}
