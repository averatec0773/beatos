-- BeatOS schema v1 (v0.0.4: rewritten as one-time exception to append-only rule;
-- v0.0.3 was never released. Charter §18 rule 9 has the explicit exception note.)

CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

-- A Source is a folder on disk that BeatOS watches.
CREATE TABLE source (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    root_path  TEXT    NOT NULL UNIQUE,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL
);
CREATE INDEX idx_source_position ON source(position);

-- A Track is a catalog entry. Global; not bound to any Source.
CREATE TABLE track (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    title             TEXT    NOT NULL DEFAULT 'Untitled',
    bpm               INTEGER,
    key_signature     TEXT,
    genre             TEXT,
    mood              TEXT,
    tags              TEXT,
    description       TEXT,
    description_draft TEXT,
    license_type      TEXT    NOT NULL DEFAULT 'lease_basic',
    price             REAL,
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL
);
CREATE INDEX idx_track_updated_at ON track(updated_at DESC);
CREATE INDEX idx_track_title ON track(title);

-- An Asset is a file on disk attached to a Track.
CREATE TABLE asset (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id   INTEGER NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    role       TEXT    NOT NULL,
    mode       TEXT    NOT NULL DEFAULT 'linked',
    abs_path   TEXT    NOT NULL,
    rel_path   TEXT,
    sha256     TEXT,
    size_bytes INTEGER,
    mime       TEXT,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL,
    UNIQUE(track_id, role)
);
CREATE INDEX idx_asset_track ON asset(track_id);
CREATE INDEX idx_asset_abs_path ON asset(abs_path);
