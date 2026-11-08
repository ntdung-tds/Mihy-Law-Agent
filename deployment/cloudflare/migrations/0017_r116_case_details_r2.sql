-- R116 QA ONLY. Existing SaaS/production schema untouched. Private R2 content is
-- bound via env.CASE_FILES_R2; never expose an R2 public hostname.
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
CREATE TABLE IF NOT EXISTS qa_case_files_r2(
 installation_id TEXT NOT NULL, tenant_id TEXT NOT NULL, matter_id TEXT NOT NULL,
 file_id TEXT NOT NULL, file_name TEXT NOT NULL CHECK(length(file_name) BETWEEN 5 AND 120),
 mime_type TEXT NOT NULL CHECK(mime_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 22 AND 10485760),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64), object_key TEXT NOT NULL,
 uploaded_by TEXT NOT NULL, uploaded_at INTEGER NOT NULL,
 PRIMARY KEY(installation_id,tenant_id,file_id),
 UNIQUE(object_key),
 FOREIGN KEY(installation_id,tenant_id,matter_id)
  REFERENCES qa_matters(installation_id,tenant_id,matter_id)
);
CREATE INDEX IF NOT EXISTS qa_case_files_r2_matter_lookup
 ON qa_case_files_r2(installation_id,tenant_id,matter_id,uploaded_at DESC);
CREATE TABLE IF NOT EXISTS qa_case_events(
 installation_id TEXT NOT NULL, tenant_id TEXT NOT NULL, matter_id TEXT NOT NULL,
 event_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('details_saved','r2_file_uploaded')),
 file_id TEXT, occurred_at INTEGER NOT NULL,
 PRIMARY KEY(installation_id,event_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id)
  REFERENCES qa_matters(installation_id,tenant_id,matter_id)
);
CREATE INDEX IF NOT EXISTS qa_case_events_matter_lookup
 ON qa_case_events(installation_id,tenant_id,matter_id,occurred_at DESC);
-- Prevent application-layer changes/removal of append-only audit records.
CREATE TRIGGER IF NOT EXISTS qa_case_events_no_update
BEFORE UPDATE ON qa_case_events BEGIN SELECT RAISE(ABORT,'audit immutable'); END;
CREATE TRIGGER IF NOT EXISTS qa_case_events_no_delete
BEFORE DELETE ON qa_case_events BEGIN SELECT RAISE(ABORT,'audit immutable'); END;
