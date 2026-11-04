#!/bin/sh
# Postgres official entrypoint sources this after R30 and R37 SQL migrations.
# Test-only least-privilege application reader; credential generated per install.
set -eu
: "${AI_LAW_APP_DB_PASSWORD:?R37 reader password required}"
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
  -v reader_password="$AI_LAW_APP_DB_PASSWORD" <<'SQL'
CREATE ROLE ai_law_r37_reader LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE ai_law_r37_reader PASSWORD :'reader_password';
GRANT USAGE ON SCHEMA ai_law TO ai_law_r37_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA ai_law TO ai_law_r37_reader;
GRANT USAGE ON SCHEMA ai_law_nonprod TO ai_law_r37_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA ai_law_nonprod TO ai_law_r37_reader;
SQL
