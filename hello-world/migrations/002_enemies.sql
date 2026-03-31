-- Clungiverse Enemy System
-- Migration 002: Enemy types, variants, and boss types

-- Enemy types (archetypes that determine behavior/attacks)
CREATE TABLE IF NOT EXISTS enemy_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    behavior TEXT NOT NULL CHECK (behavior IN ('melee_chase', 'ranged_pattern', 'slow_charge')),
    base_hp INTEGER NOT NULL,
    base_atk INTEGER NOT NULL,
    base_def INTEGER NOT NULL,
    base_spd INTEGER NOT NULL,
    attack_pattern TEXT NOT NULL DEFAULT '{}', -- JSON: describes attack behavior
    description TEXT
);

-- Enemy variants (concrete mobs that map onto an archetype)
CREATE TABLE IF NOT EXISTS enemy_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    enemy_type_id INTEGER NOT NULL REFERENCES enemy_types(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sprite_key TEXT,
    hp_modifier REAL NOT NULL DEFAULT 1.0,
    atk_modifier REAL NOT NULL DEFAULT 1.0,
    def_modifier REAL NOT NULL DEFAULT 1.0,
    spd_modifier REAL NOT NULL DEFAULT 1.0,
    floor_min INTEGER NOT NULL DEFAULT 1
);

-- Boss types (floor bosses with phased encounters)
CREATE TABLE IF NOT EXISTS boss_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phase_count INTEGER NOT NULL DEFAULT 1,
    base_hp INTEGER NOT NULL,
    base_atk INTEGER NOT NULL,
    base_def INTEGER NOT NULL,
    description TEXT,
    phases TEXT NOT NULL DEFAULT '[]' -- JSON: array of phase descriptions with mechanics
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_enemy_variants_type ON enemy_variants(enemy_type_id);
CREATE INDEX IF NOT EXISTS idx_enemy_variants_floor ON enemy_variants(floor_min);
CREATE INDEX IF NOT EXISTS idx_boss_types_slug ON boss_types(slug);

-- Seed: Enemy Types
INSERT INTO enemy_types (slug, name, behavior, base_hp, base_atk, base_def, base_spd, attack_pattern, description) VALUES
    ('crawler', 'Crawler', 'melee_chase', 30, 8, 4, 10,
     '{"type": "melee", "range": 1, "cooldown_ms": 800, "damage_type": "physical", "pattern": "charge_nearest"}',
     'Charges at the nearest player for basic melee attacks. Fast and relentless but fragile.'),
    ('spitter', 'Spitter', 'ranged_pattern', 20, 12, 2, 6,
     '{"type": "ranged", "range": 8, "cooldown_ms": 1200, "damage_type": "acid", "pattern": "keep_distance", "projectile_count": 1, "spread_angle": 0}',
     'Keeps distance from players and fires projectile patterns. High damage but paper-thin defenses.'),
    ('brute', 'Brute', 'slow_charge', 60, 15, 10, 3,
     '{"type": "melee", "range": 2, "cooldown_ms": 2000, "damage_type": "physical", "pattern": "telegraphed_charge", "telegraph_ms": 1000, "charge_distance": 5}',
     'Telegraphed charge attack with high damage. Slow but heavily armored.');

-- Seed: Enemy Variants
-- Crawler variants
INSERT INTO enemy_variants (enemy_type_id, name, sprite_key, hp_modifier, atk_modifier, def_modifier, spd_modifier, floor_min) VALUES
    (1, 'Cave Rat', 'cave-rat', 1.0, 1.0, 1.0, 1.0, 1),
    (1, 'Shadow Hound', 'shadow-hound', 1.3, 1.3, 1.0, 1.0, 2),
    (1, 'Feral Stalker', 'feral-stalker', 1.6, 1.6, 1.6, 1.6, 3);

-- Spitter variants
INSERT INTO enemy_variants (enemy_type_id, name, sprite_key, hp_modifier, atk_modifier, def_modifier, spd_modifier, floor_min) VALUES
    (2, 'Fungal Spore', 'fungal-spore', 1.0, 1.0, 1.0, 1.0, 1),
    (2, 'Acid Sprayer', 'acid-sprayer', 1.0, 1.3, 1.0, 1.0, 2),
    (2, 'Chaos Weaver', 'chaos-weaver', 1.0, 1.5, 1.0, 1.5, 3);

-- Brute variants
INSERT INTO enemy_variants (enemy_type_id, name, sprite_key, hp_modifier, atk_modifier, def_modifier, spd_modifier, floor_min) VALUES
    (3, 'Stone Golem', 'stone-golem', 1.0, 1.0, 1.0, 1.0, 1),
    (3, 'Iron Behemoth', 'iron-behemoth', 1.4, 1.0, 1.4, 1.0, 2),
    (3, 'Abyssal Titan', 'abyssal-titan', 1.8, 1.8, 1.8, 1.8, 3);

-- Seed: Boss Types
INSERT INTO boss_types (slug, name, phase_count, base_hp, base_atk, base_def, description, phases) VALUES
    ('hive-mother', 'Hive Mother', 2, 200, 12, 8,
     'Queen of the crawlers. Her brood is endless.',
     '[{"phase": 1, "trigger": "start", "mechanics": ["spawns_crawler_swarms", "slow_movement"], "spawn_interval_ms": 3000, "max_spawns": 6}, {"phase": 2, "trigger": "hp_below_50", "mechanics": ["enrage", "faster_spawns", "increased_speed"], "spawn_interval_ms": 1500, "max_spawns": 10}]'),
    ('spore-lord', 'Spore Lord', 2, 180, 16, 6,
     'Master of toxic projectiles. The arena itself becomes a weapon.',
     '[{"phase": 1, "trigger": "start", "mechanics": ["bullet_hell_patterns", "rotating_projectile_rings"], "pattern_interval_ms": 2000}, {"phase": 2, "trigger": "hp_below_50", "mechanics": ["poison_zones", "expanding_toxic_pools", "faster_patterns"], "zone_tick_damage": 5, "zone_expand_rate": 1.2}]'),
    ('the-architect', 'The Architect', 3, 300, 20, 12,
     'Builder and destroyer. Reshapes reality to crush intruders.',
     '[{"phase": 1, "trigger": "start", "mechanics": ["summons_all_enemy_types", "arena_traps"], "summon_interval_ms": 4000}, {"phase": 2, "trigger": "hp_below_60", "mechanics": ["direct_combat", "telegraphed_combos", "ground_slam"], "combo_chain": 3, "telegraph_ms": 800}, {"phase": 3, "trigger": "hp_below_30", "mechanics": ["arena_reshape", "all_mechanics_combined", "enrage"], "reshape_interval_ms": 10000}]');
