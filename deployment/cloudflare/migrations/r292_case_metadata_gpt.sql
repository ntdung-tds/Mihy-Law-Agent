-- R292 reuses R116 metadata schema, not its paused R2/Drive file implementation.
-- QA only. Apply after 0001/0002/0003/r108. Existing case rows are never overwritten.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS qa_case_details(
 installation_id TEXT NOT NULL, tenant_id TEXT NOT NULL, matter_id TEXT NOT NULL,
 reference TEXT NOT NULL DEFAULT '' CHECK(length(reference)<=60),
 category TEXT NOT NULL DEFAULT '' CHECK(length(category)<=80),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','on_hold','closed')),
 priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')),
 assignee_user_id TEXT NOT NULL,
 client_label TEXT NOT NULL DEFAULT '' CHECK(length(client_label)<=160),
 counterparty_label TEXT NOT NULL DEFAULT '' CHECK(length(counterparty_label)<=160),
 summary TEXT NOT NULL DEFAULT '' CHECK(length(summary)<=1600),
 deadline TEXT NOT NULL DEFAULT '' CHECK(length(deadline)=0 OR length(deadline)=10),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(installation_id,tenant_id,matter_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id)
  REFERENCES qa_matters(installation_id,tenant_id,matter_id),
 FOREIGN KEY(installation_id,tenant_id,assignee_user_id)
  REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);

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

CREATE TABLE IF NOT EXISTS qa_case_metadata_events_gpt (
 installation_id TEXT NOT NULL, tenant_id TEXT NOT NULL, matter_id TEXT NOT NULL,
 event_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('details_created','details_updated','case_hidden')),
 detail_version INTEGER NOT NULL CHECK(detail_version>=0),
 occurred_at INTEGER NOT NULL,
 changed_fields TEXT NOT NULL CHECK(json_valid(changed_fields)),
 PRIMARY KEY(installation_id,event_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id) REFERENCES qa_matters(installation_id,tenant_id,matter_id)
);
CREATE INDEX IF NOT EXISTS qa_case_metadata_events_lookup_gpt ON qa_case_metadata_events_gpt(installation_id,tenant_id,matter_id,occurred_at DESC,event_id DESC);
CREATE TRIGGER IF NOT EXISTS qa_case_metadata_events_immutable_update_gpt BEFORE UPDATE ON qa_case_metadata_events_gpt BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
CREATE TRIGGER IF NOT EXISTS qa_case_metadata_events_immutable_delete_gpt BEFORE DELETE ON qa_case_metadata_events_gpt BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
CREATE TRIGGER IF NOT EXISTS qa_case_metadata_created_gpt AFTER INSERT ON qa_case_details
BEGIN
 INSERT INTO qa_case_metadata_events_gpt VALUES(NEW.installation_id,NEW.tenant_id,NEW.matter_id,lower(hex(randomblob(16))),NEW.updated_by,'details_created',NEW.version,NEW.updated_at,json_array('reference','category','status','priority','client_label','counterparty_label','summary','deadline'));
END;
CREATE TRIGGER IF NOT EXISTS qa_case_metadata_updated_gpt AFTER UPDATE ON qa_case_details
BEGIN
 INSERT INTO qa_case_metadata_events_gpt VALUES(NEW.installation_id,NEW.tenant_id,NEW.matter_id,lower(hex(randomblob(16))),NEW.updated_by,'details_updated',NEW.version,NEW.updated_at,
 json_array(CASE WHEN OLD.reference IS NOT NEW.reference THEN 'reference' END,CASE WHEN OLD.category IS NOT NEW.category THEN 'category' END,CASE WHEN OLD.status IS NOT NEW.status THEN 'status' END,CASE WHEN OLD.priority IS NOT NEW.priority THEN 'priority' END,CASE WHEN OLD.client_label IS NOT NEW.client_label THEN 'client_label' END,CASE WHEN OLD.counterparty_label IS NOT NEW.counterparty_label THEN 'counterparty_label' END,CASE WHEN OLD.summary IS NOT NEW.summary THEN 'summary' END,CASE WHEN OLD.deadline IS NOT NEW.deadline THEN 'deadline' END));
END;
-- Hiding invalidates ALL previously granted matter ACLs, including access via AI/files,
-- rather than only hiding a list row. No physical deletion or automated regrant.
CREATE TRIGGER IF NOT EXISTS qa_case_hide_acl_gpt AFTER INSERT ON qa_matter_hides
BEGIN
 UPDATE qa_matters SET acl_version=acl_version+1 WHERE installation_id=NEW.installation_id AND tenant_id=NEW.tenant_id AND matter_id=NEW.matter_id;
 SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'matter not found') END;
 INSERT INTO qa_case_metadata_events_gpt VALUES(NEW.installation_id,NEW.tenant_id,NEW.matter_id,lower(hex(randomblob(16))),NEW.hidden_by,'case_hidden',0,NEW.hidden_at,'[]');
END;
