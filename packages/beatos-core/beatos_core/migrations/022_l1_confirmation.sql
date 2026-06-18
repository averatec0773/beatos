-- 022: retire 2PC tokens; add agent action audit log (L1 confirmation redesign).
-- Writes now apply directly under client consent (L1); this table records what the
-- agent did, for the in-app dashboard. Append-only.
DROP TABLE IF EXISTS tokens;

CREATE TABLE agent_action_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          REAL    NOT NULL,
  tool_name   TEXT    NOT NULL,
  summary     TEXT    NOT NULL DEFAULT '',   -- JSON: {headline, sample[], warnings[]} when available
  client_name TEXT    NOT NULL DEFAULT '',   -- from client initialize clientInfo, '' if unknown
  status      TEXT    NOT NULL,              -- 'applied' | 'failed' | 'refused_read_only'
  result      TEXT    NOT NULL DEFAULT ''    -- JSON result, or error string
);
CREATE INDEX idx_agent_action_log_ts ON agent_action_log(ts DESC);
