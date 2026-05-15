-- v0.0.3: User-created lists + many-to-many track membership.

CREATE TABLE list (
    id              INTEGER PRIMARY KEY,
    library_id      INTEGER NOT NULL REFERENCES library(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'user',
    position        INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL
);

CREATE TABLE track_list (
    track_id        INTEGER NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    list_id         INTEGER NOT NULL REFERENCES list(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL DEFAULT 0,
    added_at        TEXT NOT NULL,
    PRIMARY KEY (track_id, list_id)
);

CREATE INDEX idx_list_library ON list(library_id);
CREATE INDEX idx_track_list_list ON track_list(list_id);
CREATE INDEX idx_track_list_track ON track_list(track_id);
