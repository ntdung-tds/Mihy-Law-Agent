-- R44 QA-only browser session and password verification on Cloudflare Free D1.
-- Reuses the R40 32-char random account passwords, but derives NEW synthetic
-- PBKDF2-SHA256 test-only verifier from each private password off-repository.
-- No public signup, no real identity provider, no production migration.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS qa_workspace_labels (
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
 PRIMARY KEY (installation_id,tenant_id),
 FOREIGN KEY (installation_id,tenant_id) REFERENCES qa_tenants(installation_id,tenant_id)
);
CREATE TABLE IF NOT EXISTS qa_password_accounts (
 installation_id TEXT NOT NULL,
 email TEXT NOT NULL CHECK(email=lower(email) AND length(email) BETWEEN 5 AND 254),
 user_id TEXT NOT NULL,
 salt TEXT NOT NULL CHECK(length(salt) BETWEEN 20 AND 32),
 verifier TEXT NOT NULL CHECK(length(verifier) BETWEEN 40 AND 64),
 rounds INTEGER NOT NULL CHECK(rounds=20000),
 PRIMARY KEY (installation_id,email),
 UNIQUE (installation_id,user_id),
 FOREIGN KEY (installation_id,user_id) REFERENCES qa_principals(installation_id,user_id)
);
CREATE TABLE IF NOT EXISTS qa_auth_attempts (
 installation_id TEXT NOT NULL,
 attempt_key TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 window_start INTEGER NOT NULL,
 PRIMARY KEY (installation_id,attempt_key)
);
CREATE TABLE IF NOT EXISTS qa_web_sessions (
 installation_id TEXT NOT NULL,
 sid TEXT NOT NULL,
 token_digest TEXT NOT NULL,
 user_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 csrf_digest TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER,
 PRIMARY KEY (installation_id,sid),
 UNIQUE (installation_id,token_digest),
 FOREIGN KEY (installation_id,tenant_id,user_id)
   REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_qa_web_session
 ON qa_web_sessions(installation_id,token_digest,expires_at,revoked_at);
-- Credential issuance is strictly an operator-only D1 connection; public
-- Worker exposes no account provisioning, password reset or registration API.
