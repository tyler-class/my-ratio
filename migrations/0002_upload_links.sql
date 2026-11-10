-- One-time photo upload links, handed out by assistants over MCP so a photo taken on a
-- phone can be attached to a bean or roaster without signing in. Only a hash of the token
-- is stored; links expire after 30 minutes.
CREATE TABLE upload_links (
  token_hash TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('bean', 'roaster')),
  owner_id TEXT NOT NULL,
  replace_existing INTEGER NOT NULL DEFAULT 0,
  uploads INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_upload_links_expires ON upload_links (expires_at);
