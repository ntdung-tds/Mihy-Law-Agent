-- R109. QA-only AI request budget; no source text, prompt, output or token data retained.
-- This is not a production billing table. Do not enable legal customer files in QA.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS qa_legal_ai_quota (
 installation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 utc_day INTEGER NOT NULL CHECK(utc_day>=0),
 requests INTEGER NOT NULL CHECK(requests BETWEEN 1 AND 12),
 PRIMARY KEY(installation_id,tenant_id,user_id,utc_day),
 FOREIGN KEY(installation_id,tenant_id,user_id)
  REFERENCES qa_memberships(installation_id,tenant_id,user_id)
);
