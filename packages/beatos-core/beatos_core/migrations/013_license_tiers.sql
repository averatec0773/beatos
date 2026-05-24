-- v0.0.26: replace the placeholder track.license_type + track.price with a
-- proper one-to-many license_tier table. Each track now carries 0..N tiers,
-- each with a freeform name, a JSON array of deliverable strings (recommended
-- vocab: "mp3", "wav", "stem", but adapters may push custom values), a price
-- in a chosen currency, and a free notes field.
--
-- v0.0.25 already hid license_type + price from the UI, so most rows have
-- license_type='lease_basic' (the default) and price=NULL — those don't need
-- a tier. Only tracks where the user actually set price or a non-default
-- license_type get a single backfill tier so no field data is silently lost.

CREATE TABLE license_tier (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id     INTEGER NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL DEFAULT 0,
    name         TEXT    NOT NULL,
    deliverables TEXT    NOT NULL DEFAULT '[]',
    price        REAL,
    currency     TEXT    NOT NULL DEFAULT 'CNY',
    notes        TEXT,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
);
CREATE INDEX idx_license_tier_track ON license_tier(track_id, position);

-- Backfill: only for tracks that carried meaningful pre-v0.0.26 license data.
INSERT INTO license_tier (track_id, position, name, deliverables, price, created_at, updated_at)
SELECT
    id,
    0,
    COALESCE(NULLIF(license_type, ''), 'lease_basic'),
    '[]',
    price,
    updated_at,
    updated_at
FROM track
WHERE price IS NOT NULL
   OR (license_type IS NOT NULL AND license_type != '' AND license_type != 'lease_basic');

ALTER TABLE track DROP COLUMN license_type;
ALTER TABLE track DROP COLUMN price;
