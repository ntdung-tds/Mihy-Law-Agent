-- R73 isolated-qa-only Google OAuth PKCE and tenant private Drive connection.
-- All OAuth refresh tokens and session/verifier material MUST be AES-GCM encrypted
-- with a separate Worker secret, never stored in plaintext or public GitHub.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS qa_drive_oauth_pending (
 installation_id TEXT NOT NULL,
 state_hash TEXT NOT NULL CHECK(length(state_hash)=64),
 tenant_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 sid_cipher TEXT NOT NULL,
 verifier_cipher TEXT NOT NULL,
 created_at INTEGER NOT NULL CHECK(created_at>0),
 expires_at INTEGER NOT NULL CHECK(expires_at>created_at),
 used_at INTEGER,
 PRIMARY KEY(installation_id,state_hash),
 FOREIGN KEY(installation_id,tenant_id,user_id)
  REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_qa_drive_oauth_pending_expiry
 ON qa_drive_oauth_pending(installation_id,expires_at);
CREATE TABLE IF NOT EXISTS qa_drive_connections (
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 encrypted_refresh TEXT NOT NULL,
 root_id TEXT NOT NULL CHECK(length(root_id) BETWEEN 10 AND 200),
 scope TEXT NOT NULL CHECK(scope='https://www.googleapis.com/auth/drive.file'),
 connected_by TEXT NOT NULL,
 connected_at INTEGER NOT NULL CHECK(connected_at>0),
 PRIMARY KEY(installation_id,tenant_id),
 FOREIGN KEY(installation_id,tenant_id) REFERENCES qa_tenants(installation_id,tenant_id),
 FOREIGN KEY(installation_id,tenant_id,connected_by)
  REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);