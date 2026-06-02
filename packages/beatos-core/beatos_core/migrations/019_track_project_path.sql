-- v0.0.46: per-track project folder. Points at the DAW project directory for
-- the beat (FL Studio / Ableton / Logic project, stems-in-progress, etc.) so
-- the editor can open it in Finder. Local convenience only — never published
-- to any platform. Nullable TEXT, NULL = unset. Append-only per rule 1.
ALTER TABLE track ADD COLUMN project_path TEXT;
