-- R119 QA-only soft hide. A normal user's "Xóa" is NOT a physical delete.
-- Preserve Matter, ACL, title, case details, events and all R2 objects/receipts.
-- Restore/hard-purge require a separate future system-admin-only workflow.
CREATE TABLE IF NOT EXISTS qa_matter_hides(
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 matter_id TEXT NOT NULL,
 hidden_by TEXT NOT NULL,
 hidden_at INTEGER NOT NULL CHECK(hidden_at>0),
 PRIMARY KEY(installation_id,tenant_id,matter_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id)
  REFERENCES qa_matters(installation_id,tenant_id,matter_id),
 FOREIGN KEY(installation_id,tenant_id,hidden_by)
  REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
-- An immutable audit tombstone, not a data deletion event.
CREATE TRIGGER IF NOT EXISTS qa_matter_hides_no_update
BEFORE UPDATE ON qa_matter_hides
BEGIN SELECT RAISE(ABORT,'soft-hide audit immutable'); END;
CREATE TRIGGER IF NOT EXISTS qa_matter_hides_no_delete
BEFORE DELETE ON qa_matter_hides
BEGIN SELECT RAISE(ABORT,'soft-hide audit immutable'); END;
