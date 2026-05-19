-- 010_tokens_result: add result column for 2PC confirm-side outcomes.
-- JSON-encoded so the same tokens table serves every future write tool
-- without per-tool schema changes (list_id, track_id, external_id, ...).

ALTER TABLE tokens ADD COLUMN result TEXT;
