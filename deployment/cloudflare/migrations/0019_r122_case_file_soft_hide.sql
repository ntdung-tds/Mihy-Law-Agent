-- R122 QA only. User 'Xóa tệp' is a reversible-in-principle hide, never R2 physical deletion.
-- Preserve all original R2 bytes, receipts and audit; no system-admin purge in this release.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS qa_case_file_hides(
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 matter_id TEXT NOT NULL,
 file_id TEXT NOT NULL,
 hidden_by TEXT NOT NULL,
 hidden_at INTEGER NOT NULL CHECK(hidden_at>0),
 PRIMARY KEY(installation_id,tenant_id,file_id),
 FOREIGN KEY(installation_id,tenant_id,file_id)
  REFERENCES qa_case_files_r2(installation_id,tenant_id,file_id),
 FOREIGN KEY(installation_id,tenant_id,hidden_by)
  REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
CREATE INDEX IF NOT EXISTS qa_case_file_hides_matter
 ON qa_case_file_hides(installation_id,tenant_id,matter_id);
CREATE TRIGGER IF NOT EXISTS qa_case_file_hides_no_update
 BEFORE UPDATE ON qa_case_file_hides
 BEGIN SELECT RAISE(ABORT,'file hide audit immutable'); END;
CREATE TRIGGER IF NOT EXISTS qa_case_file_hides_no_delete
 BEFORE DELETE ON qa_case_file_hides
 BEGIN SELECT RAISE(ABORT,'file hide audit immutable'); END;
