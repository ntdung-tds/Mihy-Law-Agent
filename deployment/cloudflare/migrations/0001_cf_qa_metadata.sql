-- R43 dedicated AI Law Cloudflare Free/D1 NONPRODUCTION migration only.
-- D1 SQLite does NOT provide PostgreSQL FORCE ROW LEVEL SECURITY.
-- All reads MUST use application-scoped installation, active session,
-- membership and versioned MatterACL; deny overrides allow.
-- Do not copy real legal customer records or R40 private passwords here.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS qa_principals (
 installation_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','suspended','disabled')),
 PRIMARY KEY (installation_id,user_id)
);
CREATE TABLE IF NOT EXISTS qa_tenants (
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('organization','personal')),
 PRIMARY KEY (installation_id,tenant_id)
);
CREATE TABLE IF NOT EXISTS qa_memberships (
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 role_key TEXT NOT NULL CHECK(role_key IN ('lawyer','tenant_admin')),
 status TEXT NOT NULL CHECK(status IN ('active','suspended','revoked')),
 authz_version INTEGER NOT NULL DEFAULT 1 CHECK(authz_version>0),
 PRIMARY KEY (installation_id,tenant_id,user_id),
 FOREIGN KEY (installation_id,tenant_id) REFERENCES qa_tenants(installation_id,tenant_id),
 FOREIGN KEY (installation_id,user_id) REFERENCES qa_principals(installation_id,user_id)
);
CREATE TABLE IF NOT EXISTS qa_sessions (
 installation_id TEXT NOT NULL,
 sid TEXT NOT NULL,
 issuer TEXT NOT NULL,
 subject TEXT NOT NULL,
 user_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER,
 PRIMARY KEY (installation_id,sid),
 FOREIGN KEY (installation_id,tenant_id,user_id)
   REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_qa_session_identity
 ON qa_sessions(installation_id,sid,issuer,subject,expires_at);
CREATE TABLE IF NOT EXISTS qa_matters (
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 matter_id TEXT NOT NULL,
 acl_version INTEGER NOT NULL CHECK(acl_version>0),
 PRIMARY KEY (installation_id,tenant_id,matter_id),
 FOREIGN KEY (installation_id,tenant_id) REFERENCES qa_tenants(installation_id,tenant_id)
);
CREATE TABLE IF NOT EXISTS qa_matter_acl (
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 matter_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 permission TEXT NOT NULL CHECK(permission IN ('read','write','approve','export','manage')),
 effect TEXT NOT NULL CHECK(effect IN ('allow','deny')),
 acl_version INTEGER NOT NULL CHECK(acl_version>0),
 valid_from INTEGER NOT NULL,
 valid_to INTEGER,
 CHECK(valid_to IS NULL OR valid_to>valid_from),
 PRIMARY KEY(installation_id,tenant_id,matter_id,user_id,permission,effect,valid_from),
 FOREIGN KEY(installation_id,tenant_id,matter_id)
   REFERENCES qa_matters(installation_id,tenant_id,matter_id),
 FOREIGN KEY(installation_id,tenant_id,user_id)
   REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_qa_acl_read
 ON qa_matter_acl(installation_id,tenant_id,matter_id,user_id,permission,effect,acl_version);
CREATE TABLE IF NOT EXISTS qa_runs (
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 run_id TEXT NOT NULL,
 matter_id TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 PRIMARY KEY(installation_id,tenant_id,run_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id)
   REFERENCES qa_matters(installation_id,tenant_id,matter_id)
);
CREATE TABLE IF NOT EXISTS qa_file_links (
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 file_id TEXT NOT NULL,
 matter_id TEXT NOT NULL,
 provider TEXT NOT NULL CHECK(provider IN ('google_drive')),
 provider_object_id TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 PRIMARY KEY(installation_id,tenant_id,file_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id)
   REFERENCES qa_matters(installation_id,tenant_id,matter_id)
);
-- No product identity, password, OAuth token, refresh token or live legal
-- files are seeded. No login/registration or public file upload endpoint.
