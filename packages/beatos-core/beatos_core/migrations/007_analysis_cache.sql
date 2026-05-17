-- v0.0.13: Cache audio analysis results, keyed by asset.
-- Re-analyze only when asset.sha256 changes (file replaced).
CREATE TABLE IF NOT EXISTS analysis_cache (
  asset_id INTEGER PRIMARY KEY REFERENCES asset(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL,
  bpm REAL,
  bpm_confidence REAL,
  key_signature TEXT,
  key_confidence REAL,
  duration_seconds REAL,
  analyzed_at TEXT NOT NULL
);
