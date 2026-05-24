-- v0.0.27: key/value catalog-level settings table.
--
-- Persists producer-level configuration that should travel with the catalog
-- (not the machine). First consumer: default license tier templates applied
-- to newly-created tracks. Future uses: any preference that the renderer
-- wants to share with the sidecar / MCP layer without baking it into
-- code-level constants.
--
-- Schema:
--   key         — short stable identifier (e.g. 'default_license_tiers')
--   value_json  — TEXT-encoded JSON (any shape; producers store dicts/arrays)
--   updated_at  — ISO-8601 timestamp; lets the UI surface "last saved" hints

CREATE TABLE app_setting (
    key        TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
