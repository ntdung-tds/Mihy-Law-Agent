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

-- R189: approved outputs must originate from the guarded draft-to-approved UPDATE.
-- A direct INSERT with state='approved' bypasses the UPDATE audit trigger.
CREATE TRIGGER IF NOT EXISTS trg_qa_f21_no_preapproved_insert
BEFORE INSERT ON qa_approval_outputs
WHEN NEW.state <> 'draft'
BEGIN SELECT RAISE(ABORT,'F21_APPROVAL_TRANSITION_REQUIRED'); END;

-- R188: fail closed on identity/scope rewrites, even while output is draft.
-- The author is a persisted origin identity and must not be re-attributed to bypass
-- author/reviewer separation. This is NOT a substitute for MatterACL in the adapter.
CREATE TRIGGER IF NOT EXISTS trg_qa_f21_identity_immutable
BEFORE UPDATE ON qa_approval_outputs
WHEN NEW.installation_id IS NOT OLD.installation_id
  OR NEW.tenant_id IS NOT OLD.tenant_id
  OR NEW.matter_id IS NOT OLD.matter_id
  OR NEW.output_id IS NOT OLD.output_id
  OR NEW.author_id IS NOT OLD.author_id
  OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT,'F21_IDENTITY_IMMUTABLE'); END;

-- R190: an audit event must exactly reflect the already-approved persisted output.
-- The AFTER UPDATE audit trigger inserts after the output row has transitioned;
-- direct fabricated events for drafts or mismatched versions/actors/timestamps fail.
-- This protects QA metadata only; D1 adapter must still enforce session/MatterACL.
CREATE TRIGGER IF NOT EXISTS trg_qa_f21_event_insert_guard
BEFORE INSERT ON qa_approval_events
WHEN NOT EXISTS (
 SELECT 1 FROM qa_approval_outputs o
 WHERE o.installation_id=NEW.installation_id
   AND o.tenant_id=NEW.tenant_id
   AND o.matter_id=NEW.matter_id
   AND o.output_id=NEW.output_id
   AND o.state='approved'
   AND o.version=NEW.version
   AND o.approved_by=NEW.actor_id
   AND o.approved_at=NEW.occurred_at
   AND NEW.action='approved'
)
BEGIN SELECT RAISE(ABORT,'F21_AUDIT_EVENT_NOT_BACKED_BY_APPROVAL'); END;

-- R193: preserve approved output and audit linkage independently of connection
-- foreign_keys settings. Draft cleanup remains possible; no production migration applied.
CREATE TRIGGER IF NOT EXISTS trg_qa_f21_approved_no_delete
BEFORE DELETE ON qa_approval_outputs
WHEN OLD.state='approved'
BEGIN SELECT RAISE(ABORT,'F21_APPROVED_DELETE_FORBIDDEN'); END;
