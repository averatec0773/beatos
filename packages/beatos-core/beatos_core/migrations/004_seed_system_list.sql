-- Seed the "All Beats" system list. v0.0.3 seeded this in init_library_root
-- (now removed). In v0.0.4 lists are global, so the seed lives in the schema.
-- Idempotent: only inserts if no system list already exists.

INSERT INTO list (name, kind, position, created_at)
SELECT 'All Beats', 'system', 0, '2026-05-15T00:00:00+00:00'
WHERE NOT EXISTS (SELECT 1 FROM list WHERE kind = 'system');
