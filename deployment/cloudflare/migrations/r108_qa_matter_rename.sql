-- R108 isolated QA: versioned, auditable matter title rename. Metadata only.
-- Must apply AFTER 0003_cf_qa_matter_catalog.sql. No Google Drive or file mutation.
-- Run once through the QA D1 migration runner before deploying R108 application code.
ALTER TABLE qa_matter_catalog ADD COLUMN version INTEGER NOT NULL DEFAULT 1
 CHECK(version>=1);
ALTER TABLE qa_matter_catalog ADD COLUMN updated_at INTEGER;
ALTER TABLE qa_matter_catalog ADD COLUMN updated_by TEXT;
CREATE TABLE IF NOT EXISTS qa_matter_title_events (
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 matter_id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>=2),
 occurred_at INTEGER NOT NULL CHECK(occurred_at>0),
 PRIMARY KEY(installation_id,event_id),
 UNIQUE(installation_id,tenant_id,matter_id,version),
 FOREIGN KEY(installation_id,tenant_id,matter_id)
  REFERENCES qa_matter_catalog(installation_id,tenant_id,matter_id),
 FOREIGN KEY(installation_id,tenant_id,actor_id)
  REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_qa_matter_title_events_case
 ON qa_matter_title_events(installation_id,tenant_id,matter_id,version DESC);
-- Audit is in the same SQLite statement/transaction as title mutation.
-- A failed insert aborts the rename; no audit-gap is possible.
CREATE TRIGGER IF NOT EXISTS trg_qa_matter_title_audit
AFTER UPDATE OF title ON qa_matter_catalog
WHEN NEW.title<>OLD.title
BEGIN
 INSERT INTO qa_matter_title_events
  (installation_id,tenant_id,event_id,matter_id,actor_id,version,occurred_at)
 VALUES(NEW.installation_id,NEW.tenant_id,lower(hex(randomblob(16))),
  NEW.matter_id,NEW.updated_by,NEW.version,NEW.updated_at);
END;
