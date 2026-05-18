-- 009_tokens: two-phase commit token store.
-- A write-intent tool stores its prepared payload here under a fresh token;
-- the user-driven confirm tool verifies + consumes the token in the same
-- transaction as the actual write. v0.0.20 lays down the table + helpers
-- without exposing any write tool yet.

CREATE TABLE tokens (
  token       TEXT PRIMARY KEY,
  tool_name   TEXT NOT NULL,
  payload     TEXT NOT NULL,           -- JSON-encoded prepared args
  created_at  REAL NOT NULL,           -- unix epoch seconds
  expires_at  REAL NOT NULL,           -- created_at + ttl
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | consumed | expired
  consumed_at REAL                      -- NULL until consumed
);

CREATE INDEX idx_tokens_expires ON tokens(expires_at) WHERE status='pending';
