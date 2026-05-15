-- Add missing flag to asset table.
-- Tracks whether the linked file still exists on disk.
-- Default 0 (not missing) for all existing rows.

ALTER TABLE asset ADD COLUMN missing INTEGER NOT NULL DEFAULT 0;
