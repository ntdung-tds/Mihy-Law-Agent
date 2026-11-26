-- R290 QA only; applied after R288. No automatic credentials or grants.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS platform_admin_credentials (
 installation_id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 email TEXT NOT NULL CHECK(length(email) BETWEEN 3 AND 254 AND email=lower(email)),
 salt TEXT NOT NULL CHECK(length(salt)=32 AND salt NOT GLOB '*[^0-9a-f]*'),
 password_hash TEXT NOT NULL CHECK(length(password_hash)=64 AND password_hash NOT GLOB '*[^0-9a-f]*'),
 iterations INTEGER NOT NULL CHECK(iterations=600000),
 PRIMARY KEY(installation_id,actor_id),
 UNIQUE(installation_id,email),
 FOREIGN KEY(installation_id,actor_id) REFERENCES platform_admin_principals(installation_id,actor_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS platform_admin_login_rate (
 installation_id TEXT PRIMARY KEY,
 window_start INTEGER NOT NULL,
 attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 21)
);
CREATE TABLE IF NOT EXISTS platform_admin_session_audit (
 event_id INTEGER PRIMARY KEY,
 installation_id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('issued','revoked')),
 event_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS platform_session_issued_r290 AFTER INSERT ON platform_admin_sessions
BEGIN
 INSERT INTO platform_admin_session_audit(installation_id,actor_id,event_type,event_at)
 VALUES(NEW.installation_id,NEW.actor_id,'issued',unixepoch());
END;
CREATE TRIGGER IF NOT EXISTS platform_session_revoked_r290 AFTER UPDATE OF revoked_at ON platform_admin_sessions
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
 INSERT INTO platform_admin_session_audit(installation_id,actor_id,event_type,event_at)
 VALUES(NEW.installation_id,NEW.actor_id,'revoked',unixepoch());
END;
CREATE TRIGGER IF NOT EXISTS platform_session_audit_no_update_r290 BEFORE UPDATE ON platform_admin_session_audit
BEGIN SELECT RAISE(ABORT,'append-only session audit'); END;
CREATE TRIGGER IF NOT EXISTS platform_session_audit_no_delete_r290 BEFORE DELETE ON platform_admin_session_audit
BEGIN SELECT RAISE(ABORT,'append-only session audit'); END;
CREATE TRIGGER IF NOT EXISTS platform_disable_revokes_r290 AFTER UPDATE OF status ON platform_admin_principals
WHEN OLD.status='active' AND NEW.status='disabled'
BEGIN
 UPDATE platform_admin_sessions SET revoked_at=unixepoch()
 WHERE installation_id=NEW.installation_id AND actor_id=NEW.actor_id AND revoked_at IS NULL;
END;
CREATE TRIGGER IF NOT EXISTS platform_credential_change_revokes_r290 AFTER UPDATE ON platform_admin_credentials
BEGIN
 UPDATE platform_admin_sessions SET revoked_at=unixepoch()
 WHERE installation_id=OLD.installation_id AND actor_id=OLD.actor_id AND revoked_at IS NULL;
END;
CREATE TRIGGER IF NOT EXISTS platform_credential_delete_revokes_r290 AFTER DELETE ON platform_admin_credentials
BEGIN
 UPDATE platform_admin_sessions SET revoked_at=unixepoch()
 WHERE installation_id=OLD.installation_id AND actor_id=OLD.actor_id AND revoked_at IS NULL;
END;
