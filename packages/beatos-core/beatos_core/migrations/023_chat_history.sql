-- 023: in-app AI chat history. Conversations + their messages (Anthropic-format
-- content stored as JSON for re-render + replay). Append-only.
CREATE TABLE chat_conversation (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL DEFAULT '',
  created_at REAL    NOT NULL,
  updated_at REAL    NOT NULL
);

CREATE TABLE chat_message (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES chat_conversation(id) ON DELETE CASCADE,
  role            TEXT    NOT NULL,            -- 'user' | 'assistant'
  content_json    TEXT    NOT NULL,            -- JSON: Anthropic content (string or block list)
  created_at      REAL    NOT NULL
);
CREATE INDEX idx_chat_message_conv ON chat_message(conversation_id, id);
