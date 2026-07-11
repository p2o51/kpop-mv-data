-- Latest public stats per video (facts only)
CREATE TABLE IF NOT EXISTS video_latest (
  video_id TEXT PRIMARY KEY,
  channel_id TEXT,
  view_count INTEGER NOT NULL,
  like_count INTEGER,
  comment_count INTEGER,
  snapshot_at TEXT NOT NULL,
  collector_version TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Short rolling window for recent high-frequency points
CREATE TABLE IF NOT EXISTS video_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,
  channel_id TEXT,
  view_count INTEGER NOT NULL,
  like_count INTEGER,
  comment_count INTEGER,
  snapshot_at TEXT NOT NULL,
  collector_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_video_snapshots_video_time
  ON video_snapshots (video_id, snapshot_at);

-- Supports the daily retention purge (DELETE ... WHERE snapshot_at < ?)
CREATE INDEX IF NOT EXISTS idx_video_snapshots_time
  ON video_snapshots (snapshot_at);

-- Registry mirror used by the worker (synced from repo YAML / admin import).
-- discovered_by: 'registry' (synced from YAML) or 'worker-auto' (in-worker
-- hourly discovery; adopted into the registry on the next manual sync).
CREATE TABLE IF NOT EXISTS tracked_videos (
  video_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  group_id TEXT,
  video_class TEXT NOT NULL DEFAULT 'other',
  published_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  priority_boost INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  duration_seconds INTEGER,
  discovered_by TEXT NOT NULL DEFAULT 'registry',
  discovered_at TEXT
);

CREATE TABLE IF NOT EXISTS tracked_channels (
  channel_id TEXT PRIMARY KEY,
  registry_id TEXT NOT NULL,
  uploads_playlist_id TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  active INTEGER NOT NULL DEFAULT 1,
  kind TEXT NOT NULL DEFAULT 'artist',
  track_groups TEXT NOT NULL DEFAULT '[]'
);

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

CREATE TABLE IF NOT EXISTS job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  tier TEXT,
  videos_attempted INTEGER DEFAULT 0,
  videos_ok INTEGER DEFAULT 0,
  quota_units INTEGER DEFAULT 0,
  error TEXT
);
