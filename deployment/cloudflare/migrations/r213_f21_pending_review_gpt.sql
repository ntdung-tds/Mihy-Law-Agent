-- R213: QA-only F21 three-state schema migration. NOT applied to D1.
-- Run only after r187 and r212 on isolated synthetic QA; preserve existing rows.
-- SQLite requires a table rebuild to change CHECK. Foreign keys OFF before BEGIN.
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;
DROP TRIGGER IF EXISTS trg_qa_f21_approval_guard;
DROP TRIGGER IF EXISTS trg_qa_f21_approval_audit;
DROP TRIGGER IF EXISTS trg_qa_f21_approved_immutable;
DROP TRIGGER IF EXISTS trg_qa_f21_no_preapproved_insert;
DROP TRIGGER IF EXISTS trg_qa_f21_identity_immutable;
DROP TRIGGER IF EXISTS trg_qa_f21_approved_no_delete;
-- Drop event triggers referencing the rebuilt table; restore them below.
DROP TRIGGER IF EXISTS trg_qa_f21_event_insert_guard;
DROP TRIGGER IF EXISTS trg_qa_f21_event_requires_approval;
CREATE TABLE qa_approval_outputs_f21_next (
 installation_id TEXT NOT NULL, tenant_id TEXT NOT NULL, matter_id TEXT NOT NULL,
 output_id TEXT NOT NULL, author_id TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','pending_review','approved')),
 created_at INTEGER NOT NULL CHECK(created_at>0),
 approved_at INTEGER, approved_by TEXT,
 CHECK((state IN ('draft','pending_review') AND approved_at IS NULL AND approved_by IS NULL)
    OR (state='approved' AND approved_at IS NOT NULL AND approved_by IS NOT NULL)),
 PRIMARY KEY(installation_id,tenant_id,matter_id,output_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id) REFERENCES qa_matters(installation_id,tenant_id,matter_id),
 FOREIGN KEY(installation_id,tenant_id,author_id) REFERENCES qa_memberships(installation_id,tenant_id,user_id),
 FOREIGN KEY(installation_id,tenant_id,approved_by) REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
INSERT INTO qa_approval_outputs_f21_next
 SELECT installation_id,tenant_id,matter_id,output_id,author_id,version,state,created_at,approved_at,approved_by
 FROM qa_approval_outputs;
DROP TABLE qa_approval_outputs;
ALTER TABLE qa_approval_outputs_f21_next RENAME TO qa_approval_outputs;
CREATE TRIGGER trg_qa_f21_state_transition
BEFORE UPDATE OF state ON qa_approval_outputs
WHEN NEW.state IS NOT OLD.state
BEGIN
 SELECT RAISE(ABORT,'F21_INVALID_TRANSITION')
 WHERE NOT ((OLD.state='draft' AND NEW.state='pending_review')
         OR (OLD.state='pending_review' AND NEW.state='approved'))
    OR NEW.version<>OLD.version+1;
END;
CREATE TRIGGER trg_qa_f21_approval_guard
BEFORE UPDATE OF state ON qa_approval_outputs WHEN NEW.state='approved'
BEGIN
 SELECT RAISE(ABORT,'F21_INVALID_APPROVAL') WHERE OLD.state<>'pending_review'
  OR NEW.version<>OLD.version+1 OR NEW.author_id=NEW.approved_by
  OR NEW.approved_at IS NULL OR NOT EXISTS (
   SELECT 1 FROM qa_approval_assignments a
   WHERE a.installation_id=OLD.installation_id AND a.tenant_id=OLD.tenant_id
   AND a.matter_id=OLD.matter_id AND a.output_id=OLD.output_id
   AND a.reviewer_id=NEW.approved_by AND a.active=1);
END;
CREATE TRIGGER trg_qa_f21_approval_audit
AFTER UPDATE OF state ON qa_approval_outputs
WHEN NEW.state='approved' AND OLD.state='pending_review'
BEGIN
 INSERT INTO qa_approval_events
 (installation_id,tenant_id,matter_id,output_id,version,actor_id,action,occurred_at)
 VALUES(NEW.installation_id,NEW.tenant_id,NEW.matter_id,NEW.output_id,
 NEW.version,NEW.approved_by,'approved',NEW.approved_at);
END;
CREATE TRIGGER trg_qa_f21_approved_immutable
BEFORE UPDATE ON qa_approval_outputs WHEN OLD.state='approved'
BEGIN SELECT RAISE(ABORT,'F21_APPROVED_IMMUTABLE'); END;
CREATE TRIGGER trg_qa_f21_no_preapproved_insert
BEFORE INSERT ON qa_approval_outputs WHEN NEW.state<>'draft'
BEGIN SELECT RAISE(ABORT,'F21_APPROVAL_TRANSITION_REQUIRED'); END;
CREATE TRIGGER trg_qa_f21_identity_immutable
BEFORE UPDATE ON qa_approval_outputs
WHEN NEW.installation_id IS NOT OLD.installation_id
  OR NEW.tenant_id IS NOT OLD.tenant_id
  OR NEW.matter_id IS NOT OLD.matter_id
  OR NEW.output_id IS NOT OLD.output_id
  OR NEW.author_id IS NOT OLD.author_id
  OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT,'F21_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER trg_qa_f21_approved_no_delete
BEFORE DELETE ON qa_approval_outputs WHEN OLD.state='approved'
BEGIN SELECT RAISE(ABORT,'F21_APPROVED_DELETE_FORBIDDEN'); END;
-- No version-only rewrites: optimistic CAS version changes require state transition.
CREATE TRIGGER trg_qa_f21_version_guard
BEFORE UPDATE OF version ON qa_approval_outputs
WHEN NEW.version<>OLD.version AND NEW.state=OLD.state
BEGIN SELECT RAISE(ABORT,'F21_VERSION_REQUIRES_TRANSITION'); END;
-- Restore both legacy R190 and R212 event guards after table rebuild.
CREATE TRIGGER trg_qa_f21_event_insert_guard
BEFORE INSERT ON qa_approval_events
WHEN NOT EXISTS (
 SELECT 1 FROM qa_approval_outputs o
 WHERE o.installation_id=NEW.installation_id
 AND o.tenant_id=NEW.tenant_id AND o.matter_id=NEW.matter_id
 AND o.output_id=NEW.output_id AND o.state='approved'
 AND o.version=NEW.version AND o.approved_by=NEW.actor_id
 AND o.approved_at=NEW.occurred_at AND NEW.action='approved'
)
BEGIN SELECT RAISE(ABORT,'F21_AUDIT_EVENT_NOT_BACKED_BY_APPROVAL'); END;
CREATE TRIGGER trg_qa_f21_event_requires_approval
BEFORE INSERT ON qa_approval_events
BEGIN
 SELECT RAISE(ABORT,'F21_AUDIT_NO_APPROVAL') WHERE NOT EXISTS (
 SELECT 1 FROM qa_approval_outputs o
 WHERE o.installation_id=NEW.installation_id
 AND o.tenant_id=NEW.tenant_id AND o.matter_id=NEW.matter_id
 AND o.output_id=NEW.output_id AND o.state='approved'
 AND o.version=NEW.version AND o.approved_by=NEW.actor_id
 AND o.approved_at=NEW.occurred_at);
END;
COMMIT;
PRAGMA foreign_keys=ON;
PRAGMA foreign_key_check;
