-- Platform-only identity/session store; no tenant membership and no automatic grants.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS platform_admin_principals (
  installation_id TEXT NOT NULL,
  actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 120),
  status TEXT NOT NULL CHECK(status IN ('active','disabled')),
  PRIMARY KEY(installation_id,actor_id)
);
CREATE TABLE IF NOT EXISTS platform_admin_sessions (
  installation_id TEXT NOT NULL,
  token_hash TEXT NOT NULL CHECK(length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  actor_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL CHECK(expires_at>0),
  revoked_at INTEGER,
  PRIMARY KEY(installation_id,token_hash),
  FOREIGN KEY(installation_id,actor_id) REFERENCES platform_admin_principals(installation_id,actor_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS platform_admin_sessions_actor_gpt ON platform_admin_sessions(installation_id,actor_id);
-- No INSERT or seed: only a separately reviewed identity issuer may provision sessions.
