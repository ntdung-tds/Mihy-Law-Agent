#!/bin/sh
# R38 nonproduction-only dedicated login service SQL role; no superuser or bypass RLS.
set -eu
: "${AI_LAW_AUTH_DB_PASSWORD:?R38 separate password required}"
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
  -v auth_password="$AI_LAW_AUTH_DB_PASSWORD" <<'SQL'
CREATE ROLE ai_law_r38_auth LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE ai_law_r38_auth PASSWORD :'auth_password';
GRANT USAGE ON SCHEMA ai_law TO ai_law_r38_auth;
GRANT SELECT ON ai_law.principals,ai_law.tenants,ai_law.memberships,
  ai_law.membership_roles,ai_law.role_catalog TO ai_law_r38_auth;
GRANT USAGE ON SCHEMA ai_law_nonprod TO ai_law_r38_auth;
GRANT SELECT ON ai_law_nonprod.password_accounts,
  ai_law_nonprod.identities TO ai_law_r38_auth;
GRANT UPDATE (failed_attempts,locked_until)
  ON ai_law_nonprod.password_accounts TO ai_law_r38_auth;
GRANT SELECT,INSERT ON ai_law_nonprod.sessions TO ai_law_r38_auth;
GRANT UPDATE (revoked_at) ON ai_law_nonprod.sessions TO ai_law_r38_auth;
-- Auth service cannot create principal, edit membership, read case,
-- edit MatterACL, or read TaskRun payload through this SQL role.
SQL
