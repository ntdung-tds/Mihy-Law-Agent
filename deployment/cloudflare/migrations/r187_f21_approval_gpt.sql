-- R187 F21 isolated QA metadata schema only. NOT an enabled approval API.
-- Apply after 0001 and 0003; no customer/legal content, OAuth or signing.
-- Application MUST recheck verified session, active membership, lawyer qualification,
-- MatterACL allow-minus-deny and assignment in the same atomic approval operation.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS qa_approval_outputs (
 installation_id TEXT NOT NULL, tenant_id TEXT NOT NULL, matter_id TEXT NOT NULL,
 output_id TEXT NOT NULL, author_id TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved')),
 created_at INTEGER NOT NULL CHECK(created_at>0),
 approved_at INTEGER, approved_by TEXT,
 CHECK((state='draft' AND approved_at IS NULL AND approved_by IS NULL)
    OR (state='approved' AND approved_at IS NOT NULL AND approved_by IS NOT NULL)),
 PRIMARY KEY(installation_id,tenant_id,matter_id,output_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id) REFERENCES qa_matters(installation_id,tenant_id,matter_id),
 FOREIGN KEY(installation_id,tenant_id,author_id) REFERENCES qa_memberships(installation_id,tenant_id,user_id),
 FOREIGN KEY(installation_id,tenant_id,approved_by) REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
CREATE TABLE IF NOT EXISTS qa_approval_assignments (
 installation_id TEXT NOT NULL, tenant_id TEXT NOT NULL, matter_id TEXT NOT NULL,
 output_id TEXT NOT NULL, reviewer_id TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 PRIMARY KEY(installation_id,tenant_id,matter_id,output_id,reviewer_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id,output_id) REFERENCES qa_approval_outputs(installation_id,tenant_id,matter_id,output_id),
 FOREIGN KEY(installation_id,tenant_id,reviewer_id) REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
CREATE TABLE IF NOT EXISTS qa_approval_events (
 installation_id TEXT NOT NULL, tenant_id TEXT NOT NULL, matter_id TEXT NOT NULL,
 output_id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>=2),
 actor_id TEXT NOT NULL, action TEXT NOT NULL CHECK(action='approved'),
 occurred_at INTEGER NOT NULL CHECK(occurred_at>0),
 PRIMARY KEY(installation_id,tenant_id,matter_id,output_id,version),
 FOREIGN KEY(installation_id,tenant_id,matter_id,output_id) REFERENCES qa_approval_outputs(installation_id,tenant_id,matter_id,output_id),
 FOREIGN KEY(installation_id,tenant_id,actor_id) REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
CREATE TRIGGER IF NOT EXISTS trg_qa_f21_approval_guard
BEFORE UPDATE OF state ON qa_approval_outputs WHEN NEW.state='approved'
BEGIN
 SELECT RAISE(ABORT,'F21_INVALID_APPROVAL') WHERE OLD.state<>'draft'
  OR NEW.version<>OLD.version+1 OR NEW.author_id=NEW.approved_by
  OR NEW.approved_at IS NULL OR NOT EXISTS (
   SELECT 1 FROM qa_approval_assignments a
   WHERE a.installation_id=OLD.installation_id AND a.tenant_id=OLD.tenant_id
   AND a.matter_id=OLD.matter_id AND a.output_id=OLD.output_id
   AND a.reviewer_id=NEW.approved_by AND a.active=1);
END;
-- SQLite trigger audit insert is part of the same atomic UPDATE statement.
CREATE TRIGGER IF NOT EXISTS trg_qa_f21_approval_audit
AFTER UPDATE OF state ON qa_approval_outputs
WHEN NEW.state='approved' AND OLD.state='draft'
BEGIN
 INSERT INTO qa_approval_events
 (installation_id,tenant_id,matter_id,output_id,version,actor_id,action,occurred_at)
 VALUES(NEW.installation_id,NEW.tenant_id,NEW.matter_id,NEW.output_id,
 NEW.version,NEW.approved_by,'approved',NEW.approved_at);
END;
CREATE TRIGGER IF NOT EXISTS trg_qa_f21_approved_immutable
BEFORE UPDATE ON qa_approval_outputs WHEN OLD.state='approved'
BEGIN SELECT RAISE(ABORT,'F21_APPROVED_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_qa_f21_event_no_update
BEFORE UPDATE ON qa_approval_events
BEGIN SELECT RAISE(ABORT,'F21_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_qa_f21_event_no_delete
BEFORE DELETE ON qa_approval_events
BEGIN SELECT RAISE(ABORT,'F21_AUDIT_IMMUTABLE'); END;
