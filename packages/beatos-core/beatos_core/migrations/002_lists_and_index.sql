-- Lists are global in v0.0.4 (Steam-style unified catalog).
-- No source/library FK. Lists organize tracks regardless of where their audio lives.

CREATE TABLE list (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    kind       TEXT    NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL
);
CREATE INDEX idx_list_position ON list(position);

CREATE TABLE track_list (
    list_id  INTEGER NOT NULL REFERENCES list(id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    added_at TEXT    NOT NULL,
    PRIMARY KEY (list_id, track_id)
);
CREATE INDEX idx_track_list_track ON track_list(track_id);
