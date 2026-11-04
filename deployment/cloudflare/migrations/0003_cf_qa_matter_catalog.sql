-- R46: REAL persistent QA matter register (metadata only, NO client/legal content).
-- Reuses the existing isolated R44 D1 installation/tenant/MatterACL schema.
-- This is not a legal-document store, Drive OAuth implementation or production approval.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS qa_matter_catalog (
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 matter_id TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 3 AND 100),
 created_by TEXT NOT NULL,
 created_at INTEGER NOT NULL CHECK(created_at>0),
 PRIMARY KEY(installation_id,tenant_id,matter_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id)
    REFERENCES qa_matters(installation_id,tenant_id,matter_id),
 FOREIGN KEY(installation_id,tenant_id,created_by)
    REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_qa_matter_catalog_created
 ON qa_matter_catalog(installation_id,tenant_id,created_at DESC);
CREATE TABLE IF NOT EXISTS qa_matter_events (
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 matter_id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('created')),
 created_at INTEGER NOT NULL CHECK(created_at>0),
 PRIMARY KEY(installation_id,event_id),
 FOREIGN KEY(installation_id,tenant_id,matter_id)
    REFERENCES qa_matters(installation_id,tenant_id,matter_id)
);
