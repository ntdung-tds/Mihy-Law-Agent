-- R86: One-file browser→Google Drive upload ticket.
-- No OAuth bearer/refresh credentials or Google session URL stored here.
-- QA only; private PDFs and DOCX bodies never enter D1 or a Cloudflare upload Worker.
CREATE TABLE IF NOT EXISTS qa_document_upload_tickets (
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 ticket_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 matter_id TEXT NOT NULL,
 file_name TEXT NOT NULL CHECK(length(file_name) BETWEEN 5 AND 120),
 mime_type TEXT NOT NULL CHECK(mime_type IN (
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 22 AND 1500000),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 created_at INTEGER NOT NULL CHECK(created_at>0),
 expires_at INTEGER NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+900),
 consumed_at INTEGER,
 provider_object_id TEXT,
 PRIMARY KEY(installation_id,tenant_id,ticket_id),
 FOREIGN KEY(installation_id,tenant_id,user_id)
  REFERENCES qa_memberships(installation_id,tenant_id,user_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id)
  REFERENCES qa_matters(installation_id,tenant_id,matter_id)
);
CREATE INDEX IF NOT EXISTS qa_direct_upload_pending
 ON qa_document_upload_tickets(installation_id,tenant_id,user_id,expires_at,consumed_at);
