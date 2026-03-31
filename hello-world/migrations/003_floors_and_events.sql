-- Clungiverse Floor & Event System
-- Migration 003: Floor templates, run events, leaderboard cache, runs columns

-- Floor templates define scaling per floor
CREATE TABLE IF NOT EXISTS floor_templates (
    floor_number INTEGER PRIMARY KEY,
    room_count_min INTEGER NOT NULL,
    room_count_max INTEGER NOT NULL,
    enemy_budget INTEGER NOT NULL,
    boss_type_id INTEGER REFERENCES boss_types(id),
    powerup_choices INTEGER NOT NULL DEFAULT 3,
    enemy_scaling REAL NOT NULL DEFAULT 1.0
);

-- Run events for replay and analytics
CREATE TABLE IF NOT EXISTS run_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    tick INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    player_id INTEGER REFERENCES players(id),
    payload TEXT NOT NULL DEFAULT '{}'
);

-- Leaderboard cache for fast queries
CREATE TABLE IF NOT EXISTS leaderboard_cache (
    player_id INTEGER PRIMARY KEY REFERENCES players(id),
    fastest_clear_ms INTEGER,
    most_kills_run INTEGER,
    highest_floor INTEGER,
    total_victories INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Add columns to runs table
ALTER TABLE runs ADD COLUMN duration_ms INTEGER;
ALTER TABLE runs ADD COLUMN lobby_id INTEGER REFERENCES lobbies(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id);
CREATE INDEX IF NOT EXISTS idx_run_events_type ON run_events(event_type);
CREATE INDEX IF NOT EXISTS idx_leaderboard_victories ON leaderboard_cache(total_victories DESC);

-- Seed: Floor templates (3 floors)
INSERT INTO floor_templates VALUES
    (1, 5, 7, 30, 1, 3, 1.0),
    (2, 6, 9, 50, 2, 3, 1.4),
    (3, 7, 10, 70, 3, 2, 1.8);
