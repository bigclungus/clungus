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
);

CREATE TABLE IF NOT EXISTS run_mob_selections (
    run_id TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    PRIMARY KEY (run_id, entity_name)
);
