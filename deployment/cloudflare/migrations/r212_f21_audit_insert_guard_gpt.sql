-- R212 F21 append-only audit insertion integrity guard.
-- Additive QA migration AFTER r187; no signing, customer data, OAuth or release.
-- Does not resolve pending_review state/schema incompatibility or replace server ACL.
-- A legitimate r187 AFTER UPDATE audit insert sees the newly approved output row.
CREATE TRIGGER IF NOT EXISTS trg_qa_f21_event_requires_approval
BEFORE INSERT ON qa_approval_events
BEGIN
 SELECT RAISE(ABORT,'F21_AUDIT_NO_APPROVAL') WHERE NOT EXISTS (
  SELECT 1 FROM qa_approval_outputs o
  WHERE o.installation_id=NEW.installation_id
    AND o.tenant_id=NEW.tenant_id
    AND o.matter_id=NEW.matter_id
    AND o.output_id=NEW.output_id
    AND o.state='approved'
    AND o.version=NEW.version
    AND o.approved_by=NEW.actor_id
    AND o.approved_at=NEW.occurred_at
 );
END;
