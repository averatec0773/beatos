ALTER TABLE track ADD COLUMN deleted_at TEXT NULL;
CREATE INDEX idx_track_deleted_at ON track(deleted_at);
