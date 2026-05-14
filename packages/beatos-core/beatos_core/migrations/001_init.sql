CREATE TABLE library (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    root_path       TEXT NOT NULL UNIQUE,       -- absolute path to library root
    created_at      TEXT NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE track (
    id                  INTEGER PRIMARY KEY,
    library_id          INTEGER NOT NULL REFERENCES library(id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    bpm                 INTEGER,
    key_signature       TEXT,                   -- e.g. "C minor", "F# major"
    genre               TEXT,
    mood                TEXT,
    tags                TEXT,                   -- JSON array
    description         TEXT,                   -- user-authored, sacred
    description_draft   TEXT,                   -- AI-generated, awaits approval
    license_type        TEXT NOT NULL DEFAULT 'lease_basic',
    price               REAL,
    platform_data       TEXT,                   -- JSON {platform: {field: value}}
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

CREATE TABLE asset (
    id              INTEGER PRIMARY KEY,
    track_id        INTEGER NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,              -- 'audio' | 'stems' | 'cover'
    mode            TEXT NOT NULL,              -- 'referenced' | 'managed'
    abs_path        TEXT NOT NULL,              -- always absolute
    rel_path        TEXT,                       -- relative to library.root_path when managed
    sha256          TEXT,                       -- content hash for missing-file recovery
    size_bytes      INTEGER,
    mime_type       TEXT,
    missing         INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL
);

CREATE TABLE watch_folder (
    id              INTEGER PRIMARY KEY,
    library_id      INTEGER NOT NULL REFERENCES library(id) ON DELETE CASCADE,
    path            TEXT NOT NULL,
    auto_import     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL
);

CREATE TABLE schema_version (
    version         INTEGER PRIMARY KEY,
    applied_at      TEXT NOT NULL
);

CREATE INDEX idx_track_library ON track(library_id);
CREATE INDEX idx_asset_track ON asset(track_id);
CREATE INDEX idx_asset_missing ON asset(missing) WHERE missing = 1;
