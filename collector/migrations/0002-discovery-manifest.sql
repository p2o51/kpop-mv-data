-- One-shot migration for existing DBs (fresh installs get all of this from schema.sql).
-- ALTER TABLE ADD COLUMN fails if the column exists — do not run twice.

ALTER TABLE tracked_videos ADD COLUMN title TEXT;
ALTER TABLE tracked_videos ADD COLUMN duration_seconds INTEGER;
ALTER TABLE tracked_videos ADD COLUMN discovered_by TEXT NOT NULL DEFAULT 'registry';
ALTER TABLE tracked_videos ADD COLUMN discovered_at TEXT;

ALTER TABLE tracked_channels ADD COLUMN kind TEXT NOT NULL DEFAULT 'artist';
ALTER TABLE tracked_channels ADD COLUMN track_groups TEXT NOT NULL DEFAULT '[]';

-- Registry mirror of acts, used by in-worker discovery for title matching.
CREATE TABLE IF NOT EXISTS act_groups (
  group_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_ko TEXT,
  aliases TEXT NOT NULL DEFAULT '[]'
);

-- Ledger of R2 snapshot objects (sha256 computed at write time) — feeds /manifest.
CREATE TABLE IF NOT EXISTS r2_objects (
  object_key TEXT PRIMARY KEY,
  records INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  collector_version TEXT,
  updated_at TEXT NOT NULL
);
