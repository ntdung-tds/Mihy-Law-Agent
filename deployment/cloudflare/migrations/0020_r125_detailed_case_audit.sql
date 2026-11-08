-- R125 QA-only, append-only, ACL-scoped detailed audit (D1).
-- Existing qa_case_events remains unchanged. No existing case data/files are rewritten.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS qa_case_audit_v2(
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 matter_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN (
  'case_created','details_created','details_updated','title_changed',
  'file_uploaded','file_hidden','file_downloaded','case_hidden',
  'legacy_case_created','legacy_title_changed','legacy_details_saved','legacy_file_uploaded','legacy_file_hidden','legacy_case_hidden'
 )),
 file_id TEXT,
 occurred_at INTEGER NOT NULL CHECK(occurred_at>0),
 changes_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(changes_json) AND length(changes_json)<=16000),
 PRIMARY KEY(installation_id,event_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id)
  REFERENCES qa_matters(installation_id,tenant_id,matter_id)
);
CREATE INDEX IF NOT EXISTS qa_case_audit_v2_matter
 ON qa_case_audit_v2(installation_id,tenant_id,matter_id,occurred_at DESC,event_id DESC);
CREATE TRIGGER IF NOT EXISTS qa_case_audit_v2_no_update
 BEFORE UPDATE ON qa_case_audit_v2
 BEGIN SELECT RAISE(ABORT,'audit immutable'); END;
CREATE TRIGGER IF NOT EXISTS qa_case_audit_v2_no_delete
 BEFORE DELETE ON qa_case_audit_v2
 BEGIN SELECT RAISE(ABORT,'audit immutable'); END;

-- Snapshot *only known historic event types*; older events cannot be
-- reconstructed into per-field before/after values.
INSERT OR IGNORE INTO qa_case_audit_v2(
 installation_id,tenant_id,matter_id,event_id,actor_id,action,file_id,occurred_at,changes_json)
 SELECT installation_id,tenant_id,matter_id,'legacy-case-'||event_id,actor_id,
 CASE action WHEN 'r2_file_uploaded' THEN 'legacy_file_uploaded' ELSE 'legacy_details_saved' END,
 file_id,occurred_at,json_object('legacy',1)
 FROM qa_case_events;
INSERT OR IGNORE INTO qa_case_audit_v2(
 installation_id,tenant_id,matter_id,event_id,actor_id,action,file_id,occurred_at,changes_json)
 SELECT installation_id,tenant_id,matter_id,'legacy-matter-'||event_id,actor_id,
 'legacy_case_created',NULL,created_at,json_object('legacy',1)
 FROM qa_matter_events;
INSERT OR IGNORE INTO qa_case_audit_v2(
 installation_id,tenant_id,matter_id,event_id,actor_id,action,file_id,occurred_at,changes_json)
 SELECT installation_id,tenant_id,matter_id,'legacy-title-'||event_id,actor_id,
 'legacy_title_changed',NULL,occurred_at,json_object('legacy',1)
 FROM qa_matter_title_events;
INSERT OR IGNORE INTO qa_case_audit_v2(
 installation_id,tenant_id,matter_id,event_id,actor_id,action,file_id,occurred_at,changes_json)
 SELECT h.installation_id,h.tenant_id,h.matter_id,'legacy-file-hide-'||h.file_id,h.hidden_by,
 'legacy_file_hidden',h.file_id,h.hidden_at,
 json_object('name',f.file_name,'legacy',1)
 FROM qa_case_file_hides h JOIN qa_case_files_r2 f
 ON f.installation_id=h.installation_id AND f.tenant_id=h.tenant_id AND f.file_id=h.file_id;
INSERT OR IGNORE INTO qa_case_audit_v2(
 installation_id,tenant_id,matter_id,event_id,actor_id,action,file_id,occurred_at,changes_json)
 SELECT installation_id,tenant_id,matter_id,'legacy-matter-hide-'||matter_id,hidden_by,
 'legacy_case_hidden',NULL,hidden_at,json_object('legacy',1)
 FROM qa_matter_hides;

-- Every future mutation is captured in the SAME D1 statement as the row write.
-- If audit insertion fails, the originating mutation rolls back.
CREATE TRIGGER IF NOT EXISTS qa_case_audit_v2_case_insert
 AFTER INSERT ON qa_matter_catalog
 BEGIN
  INSERT INTO qa_case_audit_v2 VALUES(
   new.installation_id,new.tenant_id,new.matter_id,lower(hex(randomblob(16))),
   new.created_by,'case_created',NULL,new.created_at,
   json_object('title',json_object('from',NULL,'to',new.title))
  );
 END;
CREATE TRIGGER IF NOT EXISTS qa_case_audit_v2_title_change
 AFTER UPDATE OF title ON qa_matter_catalog
 WHEN old.title IS NOT new.title
 BEGIN
  INSERT INTO qa_case_audit_v2 VALUES(
   new.installation_id,new.tenant_id,new.matter_id,lower(hex(randomblob(16))),
   COALESCE(new.updated_by,new.created_by),'title_changed',NULL,
   COALESCE(new.updated_at,new.created_at),
   json_object('title',json_object('from',old.title,'to',new.title))
  );
 END;
CREATE TRIGGER IF NOT EXISTS qa_case_audit_v2_details_insert
 AFTER INSERT ON qa_case_details
 BEGIN
  INSERT INTO qa_case_audit_v2 VALUES(
   new.installation_id,new.tenant_id,new.matter_id,lower(hex(randomblob(16))),
   new.updated_by,'details_created',NULL,new.updated_at,
   json_object(
 'reference',json_object('from',NULL,'to',new.reference),
 'category',json_object('from',NULL,'to',new.category),
 'status',json_object('from',NULL,'to',new.status),
 'priority',json_object('from',NULL,'to',new.priority),
 'assignee_user_id',json_object('from',NULL,'to',new.assignee_user_id),
 'client_label',json_object('from',NULL,'to',new.client_label),
 'counterparty_label',json_object('from',NULL,'to',new.counterparty_label),
 'summary',json_object('from',NULL,'to',new.summary),
 'deadline',json_object('from',NULL,'to',new.deadline)
   )
  );
 END;
CREATE TRIGGER IF NOT EXISTS qa_case_audit_v2_details_update
 AFTER UPDATE ON qa_case_details
 WHEN old.reference IS NOT new.reference OR
 old.category IS NOT new.category OR
 old.status IS NOT new.status OR
 old.priority IS NOT new.priority OR
 old.assignee_user_id IS NOT new.assignee_user_id OR
 old.client_label IS NOT new.client_label OR
 old.counterparty_label IS NOT new.counterparty_label OR
 old.summary IS NOT new.summary OR
 old.deadline IS NOT new.deadline
 BEGIN
  INSERT INTO qa_case_audit_v2 VALUES(
   new.installation_id,new.tenant_id,new.matter_id,lower(hex(randomblob(16))),
   new.updated_by,'details_updated',NULL,new.updated_at,
   json_object(
 'reference',CASE WHEN old.reference IS NOT new.reference THEN json_object('from',old.reference,'to',new.reference) ELSE NULL END,
 'category',CASE WHEN old.category IS NOT new.category THEN json_object('from',old.category,'to',new.category) ELSE NULL END,
 'status',CASE WHEN old.status IS NOT new.status THEN json_object('from',old.status,'to',new.status) ELSE NULL END,
 'priority',CASE WHEN old.priority IS NOT new.priority THEN json_object('from',old.priority,'to',new.priority) ELSE NULL END,
 'assignee_user_id',CASE WHEN old.assignee_user_id IS NOT new.assignee_user_id THEN json_object('from',old.assignee_user_id,'to',new.assignee_user_id) ELSE NULL END,
 'client_label',CASE WHEN old.client_label IS NOT new.client_label THEN json_object('from',old.client_label,'to',new.client_label) ELSE NULL END,
 'counterparty_label',CASE WHEN old.counterparty_label IS NOT new.counterparty_label THEN json_object('from',old.counterparty_label,'to',new.counterparty_label) ELSE NULL END,
 'summary',CASE WHEN old.summary IS NOT new.summary THEN json_object('from',old.summary,'to',new.summary) ELSE NULL END,
 'deadline',CASE WHEN old.deadline IS NOT new.deadline THEN json_object('from',old.deadline,'to',new.deadline) ELSE NULL END
   )
  );
 END;
CREATE TRIGGER IF NOT EXISTS qa_case_audit_v2_file_insert
 AFTER INSERT ON qa_case_files_r2
 BEGIN
  INSERT INTO qa_case_audit_v2 VALUES(
   new.installation_id,new.tenant_id,new.matter_id,lower(hex(randomblob(16))),
   new.uploaded_by,'file_uploaded',new.file_id,new.uploaded_at,
   json_object('name',new.file_name,'bytes',new.byte_length,'mime_type',new.mime_type)
  );
 END;
CREATE TRIGGER IF NOT EXISTS qa_case_audit_v2_file_hide
 AFTER INSERT ON qa_case_file_hides
 BEGIN
  INSERT INTO qa_case_audit_v2 VALUES(
   new.installation_id,new.tenant_id,new.matter_id,lower(hex(randomblob(16))),
   new.hidden_by,'file_hidden',new.file_id,new.hidden_at,
   json_object('name',COALESCE((
    SELECT f.file_name FROM qa_case_files_r2 f
    WHERE f.installation_id=new.installation_id AND f.tenant_id=new.tenant_id
    AND f.matter_id=new.matter_id AND f.file_id=new.file_id
    LIMIT 1),'Tệp'))
  );
 END;
CREATE TRIGGER IF NOT EXISTS qa_case_audit_v2_matter_hide
 AFTER INSERT ON qa_matter_hides
 BEGIN
  INSERT INTO qa_case_audit_v2 VALUES(
   new.installation_id,new.tenant_id,new.matter_id,lower(hex(randomblob(16))),
   new.hidden_by,'case_hidden',NULL,new.hidden_at,json_object('hidden',1)
  );
 END;
