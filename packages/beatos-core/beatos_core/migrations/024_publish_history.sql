-- 024_publish_history.sql — durable publish history (P4).
--
-- publish_job (020) is a WRITE-THROUGH CACHE of live jobs: it is hard-deleted by
-- "Clear all" / DELETE /api/publish/{job_id} and holds only opaque pydantic
-- blobs. This adds the real record: one append-only `publish_attempt` per staged
-- publish plus a `publish_field_report` row per field, so a producer can answer
-- "what did I send to which platform, when, and which fields did I have to fix
-- myself?" long after the job row is gone.
--
-- Retention: rows are NEVER hard-deleted by the UI — "clear" flips `hidden`.
-- They do cascade with their track (a purged track takes its history with it);
-- rule 9 — the deleting connection must PRAGMA foreign_keys = ON or the cascade
-- silently no-ops and rows orphan.

CREATE TABLE IF NOT EXISTS publish_attempt (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    -- The engine/ticket job that produced this attempt. UNIQUE: one attempt row
    -- per job, upserted as the job progresses.
    job_id       TEXT    NOT NULL,
    track_id     INTEGER NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    platform     TEXT    NOT NULL,
    account      TEXT    NOT NULL DEFAULT 'default',
    -- 'engine' (patchright) | 'extension' (browser extension arm).
    mode         TEXT    NOT NULL DEFAULT 'engine',
    dry_run      INTEGER NOT NULL DEFAULT 0,
    -- '' while the attempt is still live; then success|dry_run|expired|failed
    -- (PublishOutcome). NOT NULL + '' default so the column is never NULL-ish.
    outcome      TEXT    NOT NULL DEFAULT '',
    -- Last PublishStage seen (staged/claimed/filling_metadata/awaiting_review/…).
    stage        TEXT    NOT NULL,
    message      TEXT    NOT NULL DEFAULT '',
    -- Platform listing URL once a publish is confirmed (NULL until then).
    listing_url  TEXT,
    -- Soft-hide for UI clearing; history is never hard-deleted here.
    hidden       INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL,
    finished_at  TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_publish_attempt_job ON publish_attempt(job_id);
CREATE INDEX IF NOT EXISTS idx_publish_attempt_track ON publish_attempt(track_id);
CREATE INDEX IF NOT EXISTS idx_publish_attempt_created ON publish_attempt(created_at);

CREATE TABLE IF NOT EXISTS publish_field_report (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id  INTEGER NOT NULL REFERENCES publish_attempt(id) ON DELETE CASCADE,
    -- Wizard page tag ('' for single-page forms). NOT NULL + '' default is
    -- load-bearing: it is part of the UNIQUE key below, and SQLite treats NULLs
    -- as DISTINCT in a UNIQUE index (rule 18's trap), which would let the same
    -- field accumulate duplicate rows on every cumulative re-report.
    page        TEXT    NOT NULL DEFAULT '',
    field_key   TEXT    NOT NULL,
    label       TEXT    NOT NULL DEFAULT '',
    -- filled | skipped | needs-user | failed
    outcome     TEXT    NOT NULL DEFAULT '',
    -- Where the value came from: ticket | vocab | ai | memory | human.
    source      TEXT    NOT NULL DEFAULT '',
    value       TEXT    NOT NULL DEFAULT '',
    reason      TEXT    NOT NULL DEFAULT '',
    -- Per-field wall time, for tuning the driver timeouts (offeros lacks this).
    duration_ms INTEGER,
    updated_at  TEXT    NOT NULL
);

-- The cumulative-report protocol re-sends the FULL list on every POST; this
-- makes the upsert idempotent instead of appending duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_publish_field_report_key
    ON publish_field_report(attempt_id, page, field_key);
