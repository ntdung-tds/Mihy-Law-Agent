-- R37 isolated-standalone HTTP smoke fixture; nonproduction only.
-- This schema is NOT the canonical SRS session/TaskRun migration and must
-- NEVER be used for real customer case data or a production migration.
-- Applied after the existing R30 IAM/MatterACL migration in a disposable DB.
CREATE SCHEMA ai_law_nonprod;
REVOKE ALL ON SCHEMA ai_law_nonprod FROM PUBLIC;

CREATE TABLE ai_law_nonprod.identities (
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES ai_law.principals(user_id),
  status TEXT NOT NULL CHECK (status IN ('active','disabled')),
  PRIMARY KEY (issuer,subject)
);
CREATE TABLE ai_law_nonprod.sessions (
  session_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES ai_law.principals(user_id),
  active_tenant_id UUID NOT NULL REFERENCES ai_law.tenants(tenant_id),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE TABLE ai_law_nonprod.run_snapshots (
  tenant_id UUID NOT NULL,
  run_id TEXT NOT NULL,
  matter_id UUID NOT NULL,
  payload JSONB NOT NULL,
  PRIMARY KEY (tenant_id,run_id),
  FOREIGN KEY (tenant_id,matter_id) REFERENCES ai_law.matters(tenant_id,matter_id)
);
ALTER TABLE ai_law_nonprod.run_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_law_nonprod.run_snapshots FORCE ROW LEVEL SECURITY;
-- A fixture TaskRun cannot leak through an app DB reader without MatterACL.
CREATE POLICY run_fixture_with_matter_acl
ON ai_law_nonprod.run_snapshots FOR SELECT USING (
  tenant_id=ai_law.actor_tenant() AND EXISTS (
    SELECT 1 FROM ai_law.matters m
    WHERE m.tenant_id=run_snapshots.tenant_id
      AND m.matter_id=run_snapshots.matter_id
  )
);
-- identities/sessions are internal trusted server stores, never exposed as
-- HTTP APIs; database reader gets SELECT only, never provisioning/revocation.
