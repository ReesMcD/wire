-- Fantasy Football Data – Neon Postgres Schema
-- Run this migration against your Neon database to create the required tables.
--
-- You can execute it via:
--   psql $DATABASE_URL -f scripts/migrations/001_initial_schema.sql
-- Or through the Neon Console SQL Editor.

BEGIN;

-- Players table (Sleeper NFL roster)
CREATE TABLE IF NOT EXISTS players (
  player_id     TEXT PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  team          TEXT,
  position      TEXT,
  age           INTEGER,
  years_exp     INTEGER,
  search_full_name TEXT NOT NULL,
  status        TEXT
);

-- Player values (trade/dynasty values from all sources)
CREATE TABLE IF NOT EXISTS player_values (
  id                  TEXT PRIMARY KEY,
  sleeper_id          TEXT NOT NULL,
  source_id           TEXT NOT NULL,
  value               INTEGER NOT NULL,
  normalized_value    INTEGER NOT NULL,
  normalized_value_qm INTEGER,
  overall_rank        INTEGER,
  position_rank       INTEGER,
  trend               INTEGER,
  tier_avg            INTEGER,
  tier_fc             INTEGER,
  tier_ktc            INTEGER,
  tier_dd             INTEGER,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_player_values_sleeper_id ON player_values(sleeper_id);
CREATE INDEX IF NOT EXISTS idx_player_values_source_id ON player_values(source_id);

-- Sync metadata (per-source sync status)
CREATE TABLE IF NOT EXISTS sync_metadata (
  source_id       TEXT PRIMARY KEY,
  last_synced_at  TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('idle', 'syncing', 'error', 'success')),
  error           TEXT,
  record_count    INTEGER NOT NULL DEFAULT 0
);

COMMIT;
