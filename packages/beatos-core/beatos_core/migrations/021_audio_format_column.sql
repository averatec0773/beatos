-- Decouple audio format from role. Add a normalized `format`; split the
-- format-encoded audio roles (audio_{tagged,untagged}_{wav,mp3}) into a semantic
-- role + format; switch uniqueness (track_id, role) -> (track_id, role, format).
-- First table-rebuild migration: SQLite cannot alter a table-level UNIQUE in
-- place. FK enforcement is OFF on the runner connection and asset ids are
-- preserved, so analysis_cache(asset_id) references survive the rebuild.
BEGIN;

CREATE TABLE asset_new (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id   INTEGER NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    role       TEXT    NOT NULL,
    mode       TEXT    NOT NULL DEFAULT 'linked',
    abs_path   TEXT    NOT NULL,
    rel_path   TEXT,
    sha256     TEXT,
    size_bytes INTEGER,
    mime       TEXT,
    format     TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL,
    missing    INTEGER NOT NULL DEFAULT 0,
    UNIQUE(track_id, role, format)
);

INSERT INTO asset_new
    (id, track_id, role, mode, abs_path, rel_path, sha256, size_bytes, mime, format, created_at, updated_at, missing)
SELECT
    id, track_id,
    CASE
        WHEN role IN ('audio_tagged_wav','audio_tagged_mp3')     THEN 'audio_tagged'
        WHEN role IN ('audio_untagged_wav','audio_untagged_mp3') THEN 'audio_untagged'
        WHEN role = 'audio'                                      THEN 'audio_untagged'
        ELSE role
    END,
    mode, abs_path, rel_path, sha256, size_bytes, mime,
    CASE
        WHEN role IN ('audio_tagged_wav','audio_untagged_wav') THEN 'wav'
        WHEN role IN ('audio_tagged_mp3','audio_untagged_mp3') THEN 'mp3'
        WHEN role IN ('audio','loop') THEN
            CASE
                WHEN lower(abs_path) LIKE '%.wav'  THEN 'wav'
                WHEN lower(abs_path) LIKE '%.mp3'  THEN 'mp3'
                WHEN lower(abs_path) LIKE '%.flac' THEN 'flac'
                ELSE ''
            END
        ELSE ''
    END,
    created_at, updated_at, missing
FROM asset;

DROP TABLE asset;
ALTER TABLE asset_new RENAME TO asset;

CREATE INDEX idx_asset_track ON asset(track_id);
CREATE INDEX idx_asset_abs_path ON asset(abs_path);

COMMIT;
