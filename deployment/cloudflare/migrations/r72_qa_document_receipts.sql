-- R72 isolated QA document receipt. Upload != trusted legal-document extraction.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS qa_document_receipts (
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 file_id TEXT NOT NULL,
 file_name TEXT NOT NULL CHECK(length(file_name) BETWEEN 5 AND 120),
 mime_type TEXT NOT NULL CHECK(mime_type IN (
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 22 AND 1500000),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK(verification_status='unverified'),
 uploaded_by TEXT NOT NULL,
 created_at INTEGER NOT NULL CHECK(created_at>0),
 PRIMARY KEY (installation_id,tenant_id,file_id),
 FOREIGN KEY (installation_id,tenant_id,file_id)
  REFERENCES qa_file_links(installation_id,tenant_id,file_id),
 FOREIGN KEY (installation_id,tenant_id,uploaded_by)
  REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_qa_document_receipts_time
 ON qa_document_receipts(installation_id,tenant_id,created_at DESC);
