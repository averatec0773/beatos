-- Add producer field to track table. v0.0.9 displays this in the bottom
-- player subtitle. NULL default so existing rows need no backfill.
ALTER TABLE track ADD COLUMN producer TEXT NULL;
