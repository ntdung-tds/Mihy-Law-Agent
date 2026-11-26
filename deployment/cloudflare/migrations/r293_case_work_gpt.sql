-- QA: matter-scoped contacts and work calendar. No automatic sharing or global conflict index.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS qa_case_contacts_gpt (
 installation_id TEXT NOT NULL, tenant_id TEXT NOT NULL, matter_id TEXT NOT NULL,
 contact_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('client','counterparty','other')),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 email TEXT NOT NULL DEFAULT '' CHECK(length(email)<=254),
 phone TEXT NOT NULL DEFAULT '' CHECK(length(phone)<=50),
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','archived')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL CHECK(updated_at>0),
 PRIMARY KEY(installation_id,tenant_id,matter_id,contact_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id) REFERENCES qa_matters(installation_id,tenant_id,matter_id),
 FOREIGN KEY(installation_id,tenant_id,updated_by) REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
CREATE TABLE IF NOT EXISTS qa_case_activities_gpt (
 installation_id TEXT NOT NULL, tenant_id TEXT NOT NULL, matter_id TEXT NOT NULL,
 activity_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('task','meeting','hearing','deadline','interaction')),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
 due_date TEXT NOT NULL CHECK(length(due_date)=10),
 due_time TEXT NOT NULL DEFAULT '' CHECK(length(due_time) IN (0,5)),
 contact_id TEXT,
 state TEXT NOT NULL CHECK(state IN ('open','done','cancelled')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL CHECK(updated_at>0),
 PRIMARY KEY(installation_id,tenant_id,matter_id,activity_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id) REFERENCES qa_matters(installation_id,tenant_id,matter_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id,contact_id) REFERENCES qa_case_contacts_gpt(installation_id,tenant_id,matter_id,contact_id),
 FOREIGN KEY(installation_id,tenant_id,updated_by) REFERENCES qa_memberships(installation_id,tenant_id,user_id),
 CHECK((kind='interaction' AND contact_id IS NOT NULL AND state IN ('done','cancelled')) OR (kind<>'interaction' AND contact_id IS NULL))
);
CREATE INDEX IF NOT EXISTS qa_case_activities_date_gpt ON qa_case_activities_gpt(installation_id,tenant_id,due_date,state,matter_id);
CREATE TABLE IF NOT EXISTS qa_case_work_audit_gpt (
 installation_id TEXT NOT NULL, tenant_id TEXT NOT NULL, matter_id TEXT NOT NULL,
 event_id TEXT NOT NULL, entity_kind TEXT NOT NULL CHECK(entity_kind IN ('contact','activity')),
 entity_id TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('created','updated')),
 version INTEGER NOT NULL CHECK(version>=1), actor_id TEXT NOT NULL, occurred_at INTEGER NOT NULL,
 PRIMARY KEY(installation_id,event_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id) REFERENCES qa_matters(installation_id,tenant_id,matter_id)
);
CREATE INDEX IF NOT EXISTS qa_case_work_audit_order_gpt ON qa_case_work_audit_gpt(installation_id,tenant_id,matter_id,occurred_at DESC,event_id DESC);
CREATE TRIGGER IF NOT EXISTS qa_case_work_audit_immutable_u_gpt BEFORE UPDATE ON qa_case_work_audit_gpt BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
CREATE TRIGGER IF NOT EXISTS qa_case_work_audit_immutable_d_gpt BEFORE DELETE ON qa_case_work_audit_gpt BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
CREATE TRIGGER IF NOT EXISTS qa_case_contacts_insert_audit_gpt AFTER INSERT ON qa_case_contacts_gpt
BEGIN
 INSERT INTO qa_case_work_audit_gpt VALUES(NEW.installation_id,NEW.tenant_id,NEW.matter_id,lower(hex(randomblob(16))),'contact',NEW.contact_id,'created',NEW.version,NEW.updated_by,NEW.updated_at);
END;
CREATE TRIGGER IF NOT EXISTS qa_case_contacts_update_audit_gpt AFTER UPDATE ON qa_case_contacts_gpt
BEGIN
 INSERT INTO qa_case_work_audit_gpt VALUES(NEW.installation_id,NEW.tenant_id,NEW.matter_id,lower(hex(randomblob(16))),'contact',NEW.contact_id,'updated',NEW.version,NEW.updated_by,NEW.updated_at);
END;
CREATE TRIGGER IF NOT EXISTS qa_case_activities_insert_audit_gpt AFTER INSERT ON qa_case_activities_gpt
BEGIN
 INSERT INTO qa_case_work_audit_gpt VALUES(NEW.installation_id,NEW.tenant_id,NEW.matter_id,lower(hex(randomblob(16))),'activity',NEW.activity_id,'created',NEW.version,NEW.updated_by,NEW.updated_at);
END;
CREATE TRIGGER IF NOT EXISTS qa_case_activities_update_audit_gpt AFTER UPDATE ON qa_case_activities_gpt
BEGIN
 INSERT INTO qa_case_work_audit_gpt VALUES(NEW.installation_id,NEW.tenant_id,NEW.matter_id,lower(hex(randomblob(16))),'activity',NEW.activity_id,'updated',NEW.version,NEW.updated_by,NEW.updated_at);
END;
