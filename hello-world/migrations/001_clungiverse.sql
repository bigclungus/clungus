-- Clungiverse Roguelite Database Schema
-- Migration 001: Initial schema + seed data

-- Personas (playable Congress characters)
CREATE TABLE IF NOT EXISTS personas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    role TEXT NOT NULL CHECK (role IN ('tank', 'dps', 'support', 'wildcard')),
    base_hp INTEGER NOT NULL,
    base_atk INTEGER NOT NULL,
    base_def INTEGER NOT NULL,
    base_spd INTEGER NOT NULL,
    base_lck INTEGER NOT NULL,
    power_name TEXT NOT NULL,
    power_description TEXT,
    power_cooldown_ms INTEGER NOT NULL DEFAULT 8000,
    sprite_key TEXT,
    unlocked_by_default INTEGER NOT NULL DEFAULT 0
);

-- Players (tied to GitHub OAuth)
CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_username TEXT NOT NULL UNIQUE,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    total_runs INTEGER NOT NULL DEFAULT 0,
    best_floor INTEGER NOT NULL DEFAULT 0,
    total_kills INTEGER NOT NULL DEFAULT 0
);

-- Runs (individual dungeon attempts)
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    floor_reached INTEGER NOT NULL DEFAULT 1,
    outcome TEXT CHECK (outcome IN ('victory', 'death', 'abandoned')),
    seed TEXT NOT NULL
);

-- Run players (which players participated in a run)
CREATE TABLE IF NOT EXISTS run_players (
    run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id),
    persona_id INTEGER NOT NULL REFERENCES personas(id),
    damage_dealt INTEGER NOT NULL DEFAULT 0,
    damage_taken INTEGER NOT NULL DEFAULT 0,
    kills INTEGER NOT NULL DEFAULT 0,
    died_on_floor INTEGER,
    PRIMARY KEY (run_id, player_id)
);

-- Powerups (permanent catalog of available buffs)
CREATE TABLE IF NOT EXISTS powerups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    stat_modifier TEXT NOT NULL DEFAULT '{}', -- JSON: {"hp": 20, "atk": -2, ...}
    rarity TEXT NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare'))
);

-- Run powerups (powerups acquired during a run)
CREATE TABLE IF NOT EXISTS run_powerups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id),
    powerup_id INTEGER NOT NULL REFERENCES powerups(id),
    acquired_on_floor INTEGER NOT NULL
);

-- Lobbies (multiplayer matchmaking)
CREATE TABLE IF NOT EXISTS lobbies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    host_player_id INTEGER NOT NULL REFERENCES players(id),
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'completed')),
    dungeon_seed TEXT
);

-- Lobby players (who's in a lobby)
CREATE TABLE IF NOT EXISTS lobby_players (
    lobby_id INTEGER NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id),
    persona_id INTEGER REFERENCES personas(id),
    ready INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (lobby_id, player_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_players_github ON players(github_username);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);
CREATE INDEX IF NOT EXISTS idx_run_players_run ON run_players(run_id);
CREATE INDEX IF NOT EXISTS idx_run_players_player ON run_players(player_id);
CREATE INDEX IF NOT EXISTS idx_lobbies_status ON lobbies(status);
CREATE INDEX IF NOT EXISTS idx_lobby_players_lobby ON lobby_players(lobby_id);
CREATE INDEX IF NOT EXISTS idx_run_powerups_run ON run_powerups(run_id);

-- Seed: Starter Personas
INSERT INTO personas (slug, display_name, description, role, base_hp, base_atk, base_def, base_spd, base_lck, power_name, power_description, power_cooldown_ms, sprite_key, unlocked_by_default) VALUES
    ('holden-bloodfeast', 'Holden Bloodfeast', 'An unstoppable wall of muscle and rage. Holds the line so nobody else has to.', 'tank', 140, 10, 14, 5, 6, 'Overwhelming Force', 'Cone stun that staggers all enemies in front for 1.5 seconds.', 8000, 'holden-bloodfeast', 1),
    ('broseidon', 'Broseidon', 'God of the Brocean. Every kill makes the next hit harder.', 'dps', 90, 16, 7, 12, 8, 'Progressive Overload', 'Each kill within the buff window stacks +2 ATK for the current room.', 10000, 'broseidon', 1),
    ('deckard-cain', 'Deckard Cain', 'The last Horadrim. Prefers talking to fighting, but his words carry weight.', 'support', 100, 8, 10, 8, 14, 'Stay Awhile and Listen', 'Creates a zone that slows enemies by 40% and reveals hidden traps for 4 seconds.', 12000, 'deckard-cain', 1),
    ('galactus', 'Galactus', 'Devourer of Worlds. Fragile but ferocious — consumes the weak to sustain himself.', 'wildcard', 70, 14, 5, 15, 10, 'Consume', 'Execute enemies below 20% HP instantly, recovering 15% of your max HP per kill.', 6000, 'galactus', 1);

-- Seed: Powerups
INSERT INTO powerups (slug, name, description, stat_modifier, rarity) VALUES
    ('minor-heal', 'Minor Heal', 'A small restorative blessing.', '{"hp": 20}', 'common'),
    ('quick-feet', 'Quick Feet', 'Light boots that make you nimble.', '{"spd": 3}', 'common'),
    ('iron-skin', 'Iron Skin', 'Your skin hardens against blows.', '{"def": 3}', 'common'),
    ('berserkers-rage', 'Berserker''s Rage', 'Trade protection for raw power.', '{"atk": 5, "def": -2}', 'uncommon'),
    ('lucky-charm', 'Lucky Charm', 'Fortune smiles upon you.', '{"lck": 5}', 'uncommon'),
    ('vitality', 'Vitality', 'A surge of life force.', '{"hp": 30}', 'uncommon'),
    ('glass-cannon', 'Glass Cannon', 'Devastating power at a terrible cost.', '{"atk": 10, "hp": -20}', 'rare'),
    ('fortunes-favor', 'Fortune''s Favor', 'Luck and speed in equal measure.', '{"lck": 8, "spd": 3}', 'rare'),
    ('juggernaut', 'Juggernaut', 'An immovable object. Slow but nearly indestructible.', '{"def": 8, "hp": 20, "spd": -3}', 'rare');
