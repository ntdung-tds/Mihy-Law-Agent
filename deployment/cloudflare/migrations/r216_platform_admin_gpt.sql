-- R216: isolated platform control-plane schema. No tenant business data or impersonation.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS platform_service_plans (
 plan_id TEXT PRIMARY KEY CHECK(length(plan_id) BETWEEN 1 AND 80),
 plan_name TEXT NOT NULL CHECK(length(trim(plan_name)) BETWEEN 1 AND 120),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
 max_users INTEGER NOT NULL CHECK(max_users >= 1),
 max_storage_bytes INTEGER NOT NULL CHECK(max_storage_bytes >= 0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_tenant_services (
 tenant_id TEXT PRIMARY KEY CHECK(length(tenant_id) BETWEEN 1 AND 120),
 plan_id TEXT NOT NULL REFERENCES platform_service_plans(plan_id) ON DELETE RESTRICT,
 service_status TEXT NOT NULL DEFAULT 'pending' CHECK(service_status IN ('pending','active','suspended','revoked')),
 license_expires_at TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(license_expires_at IS NULL OR length(license_expires_at) >= 10)
);
CREATE TABLE IF NOT EXISTS platform_admin_audit (
 audit_id TEXT PRIMARY KEY CHECK(length(audit_id) BETWEEN 1 AND 120),
 actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 120),
 tenant_id TEXT,
 action TEXT NOT NULL CHECK(action IN ('plan_create','plan_retire','service_activate','service_suspend','service_revoke','license_update','account_recovery_request')),
 occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reason_code TEXT NOT NULL CHECK(length(trim(reason_code)) BETWEEN 1 AND 120),
 FOREIGN KEY(tenant_id) REFERENCES platform_tenant_services(tenant_id) ON DELETE RESTRICT
);
CREATE TRIGGER IF NOT EXISTS platform_admin_audit_no_update
BEFORE UPDATE ON platform_admin_audit BEGIN SELECT RAISE(ABORT,'immutable platform audit'); END;
CREATE TRIGGER IF NOT EXISTS platform_admin_audit_no_delete
BEFORE DELETE ON platform_admin_audit BEGIN SELECT RAISE(ABORT,'immutable platform audit'); END;
