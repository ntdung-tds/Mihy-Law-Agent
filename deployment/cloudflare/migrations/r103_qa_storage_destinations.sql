-- R103 QA-only, additive BYOS folder destinations. Never auto-save to a tenant root.
-- Existing pre-R103 receipts/tickets remain readable by their historic root policy.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS qa_storage_destinations (
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 destination_id TEXT NOT NULL,
 provider TEXT NOT NULL CHECK(provider='google_drive'),
 folder_id TEXT NOT NULL CHECK(length(folder_id) BETWEEN 10 AND 200),
 label TEXT NOT NULL CHECK(length(label) BETWEEN 3 AND 80),
 owner_kind TEXT NOT NULL CHECK(owner_kind IN ('organization','personal')),
 status TEXT NOT NULL CHECK(status IN ('active','revoked')),
 created_by TEXT NOT NULL,
 created_at INTEGER NOT NULL CHECK(created_at>0),
 PRIMARY KEY (installation_id,tenant_id,destination_id),
 UNIQUE(installation_id,tenant_id,folder_id),
 FOREIGN KEY(installation_id,tenant_id,created_by)
  REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
CREATE TABLE IF NOT EXISTS qa_storage_assignments (
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 destination_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 granted_by TEXT NOT NULL,
 granted_at INTEGER NOT NULL CHECK(granted_at>0),
 PRIMARY KEY(installation_id,tenant_id,destination_id,user_id),
 FOREIGN KEY(installation_id,tenant_id,destination_id)
  REFERENCES qa_storage_destinations(installation_id,tenant_id,destination_id),
 FOREIGN KEY(installation_id,tenant_id,user_id)
  REFERENCES qa_memberships(installation_id,tenant_id,user_id),
 FOREIGN KEY(installation_id,tenant_id,granted_by)
  REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_qa_storage_access_user
 ON qa_storage_assignments(installation_id,tenant_id,user_id,destination_id);
ALTER TABLE qa_document_upload_tickets ADD COLUMN destination_id TEXT;
ALTER TABLE qa_file_links ADD COLUMN storage_destination_id TEXT;
