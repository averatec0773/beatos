-- 020_publish_job.sql — publish job history + status (polled by UI)
CREATE TABLE IF NOT EXISTS publish_job (
    job_id      TEXT PRIMARY KEY,
    track_id    INTEGER NOT NULL,
    platform    TEXT NOT NULL,
    account     TEXT NOT NULL DEFAULT 'default',
    stage       TEXT NOT NULL,
    message     TEXT NOT NULL DEFAULT '',
    result_json TEXT,
    request_json TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_publish_job_track ON publish_job(track_id);
