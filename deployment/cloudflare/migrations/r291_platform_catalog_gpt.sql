-- R291: QA-only control-plane metadata. Apply after R216/R288/R290.
-- One command INSERT applies its change in a trigger; any failure rolls back the command and change.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS platform_catalog_events (
 event_id TEXT PRIMARY KEY,
 installation_id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('plan_create','plan_update','plan_retire','service_create','license_update')),
 object_id TEXT NOT NULL CHECK(length(object_id) BETWEEN 1 AND 120),
 plan_id TEXT,
 plan_name TEXT,
 max_users INTEGER,
 max_storage_bytes INTEGER,
 license_expires_at TEXT,
 reason_code TEXT NOT NULL CHECK(length(reason_code) BETWEEN 2 AND 80),
 event_at INTEGER NOT NULL CHECK(event_at>0),
 FOREIGN KEY(installation_id,actor_id) REFERENCES platform_admin_principals(installation_id,actor_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS platform_catalog_events_order_gpt ON platform_catalog_events(installation_id,event_at DESC,event_id DESC);
CREATE TRIGGER IF NOT EXISTS platform_catalog_events_no_update_gpt BEFORE UPDATE ON platform_catalog_events
BEGIN SELECT RAISE(ABORT,'immutable catalog event'); END;
CREATE TRIGGER IF NOT EXISTS platform_catalog_events_no_delete_gpt BEFORE DELETE ON platform_catalog_events
BEGIN SELECT RAISE(ABORT,'immutable catalog event'); END;
CREATE TRIGGER IF NOT EXISTS platform_catalog_plan_create_gpt AFTER INSERT ON platform_catalog_events
WHEN NEW.action='plan_create'
BEGIN
 SELECT CASE WHEN NEW.plan_name IS NULL OR NEW.max_users IS NULL OR NEW.max_storage_bytes IS NULL THEN RAISE(ABORT,'invalid plan') END;
 INSERT INTO platform_service_plans(plan_id,plan_name,max_users,max_storage_bytes) VALUES(NEW.object_id,NEW.plan_name,NEW.max_users,NEW.max_storage_bytes);
END;
CREATE TRIGGER IF NOT EXISTS platform_catalog_plan_update_gpt AFTER INSERT ON platform_catalog_events
WHEN NEW.action='plan_update'
BEGIN
 UPDATE platform_service_plans SET plan_name=NEW.plan_name,max_users=NEW.max_users,max_storage_bytes=NEW.max_storage_bytes
 WHERE plan_id=NEW.object_id AND status='active'
 AND (plan_name<>NEW.plan_name OR max_users<>NEW.max_users OR max_storage_bytes<>NEW.max_storage_bytes);
 SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'plan update conflict') END;
END;
CREATE TRIGGER IF NOT EXISTS platform_catalog_plan_retire_gpt AFTER INSERT ON platform_catalog_events
WHEN NEW.action='plan_retire'
BEGIN
 UPDATE platform_service_plans SET status='retired'
 WHERE plan_id=NEW.object_id AND status='active'
 AND NOT EXISTS(SELECT 1 FROM platform_tenant_services WHERE plan_id=NEW.object_id AND service_status<>'revoked');
 SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'plan retirement conflict') END;
END;
CREATE TRIGGER IF NOT EXISTS platform_catalog_service_create_gpt AFTER INSERT ON platform_catalog_events
WHEN NEW.action='service_create'
BEGIN
 INSERT INTO platform_tenant_services(tenant_id,plan_id,service_status,license_expires_at)
 SELECT NEW.object_id,plan_id,'pending',NEW.license_expires_at FROM platform_service_plans
 WHERE plan_id=NEW.plan_id AND status='active';
 SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'service creation conflict') END;
END;
CREATE TRIGGER IF NOT EXISTS platform_catalog_license_update_gpt AFTER INSERT ON platform_catalog_events
WHEN NEW.action='license_update'
BEGIN
 UPDATE platform_tenant_services SET plan_id=NEW.plan_id,license_expires_at=NEW.license_expires_at,updated_at=CURRENT_TIMESTAMP
 WHERE tenant_id=NEW.object_id AND service_status<>'revoked'
 AND EXISTS(SELECT 1 FROM platform_service_plans WHERE plan_id=NEW.plan_id AND status='active')
 AND (plan_id<>NEW.plan_id OR license_expires_at IS NOT NEW.license_expires_at);
 SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'license update conflict') END;
END;
