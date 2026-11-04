#!/usr/bin/env bash
# Sourced by smoke_api.sh ONLY with R38_ENABLE=1 and disposable projects.
# Variables/functions from parent: ROOT TMP A B dc_a/b sql_a/b probe_a/b check_eq.
AUTH_A="$(dc_a ps -q auth)"
AUTH_B="$(dc_b ps -q auth)"
[ -n "$AUTH_A" ] && [ -n "$AUTH_B" ] && [ "$AUTH_A" != "$AUTH_B" ]
for container in "$AUTH_A" "$AUTH_B"; do
  if docker port "$container" 8081/tcp 2>/dev/null | grep -q .; then
    echo "FAIL R38: login endpoint published on host" >&2; exit 1
  fi
done

for i in $(seq 1 20); do
  if dc_a exec -T auth python -c \
    'import socket; socket.create_connection(("127.0.0.1",8081),2).close()' >/dev/null 2>&1 &&
     dc_b exec -T auth python -c \
    'import socket; socket.create_connection(("127.0.0.1",8081),2).close()' >/dev/null 2>&1; then
    break
  fi
  if [ "$i" = 20 ]; then
    echo "FAIL R38: authentication services unavailable" >&2
    dc_a logs --tail=20 auth db || true
    dc_b logs --tail=20 auth db || true
    exit 1
  fi
  sleep 1
done

# Admin test fixture explicitly creates real DB account rows with Argon2id
# password hashes. All personal email addresses and passwords are synthetic,
# generated in temp CI memory and never stored in project source/logs.
sql_a "$(cat "$TMP/a/fixture_password_accounts.sql")" >/dev/null
sql_b "$(cat "$TMP/b/fixture_password_accounts.sql")" >/dev/null
check_eq "$(sql_a "SELECT count(*) FROM ai_law_nonprod.password_accounts")" "2" "IAICT nonproduction accounts"
check_eq "$(sql_b "SELECT count(*) FROM ai_law_nonprod.password_accounts")" "1" "other nonproduction account"
check_eq "$(sql_a "SELECT count(*) FROM ai_law_nonprod.password_accounts WHERE split_part(password_hash,'$',2)='argon2id'")" "2" "Argon2id password storage"
check_eq "$(sql_a "SELECT rolsuper::text || ',' || rolbypassrls::text FROM pg_roles WHERE rolname='ai_law_r38_auth'")" "false,false" "auth role no elevated PG privileges"

# Same actual principal can select personal OR organization membership.
sql_a "BEGIN;
 INSERT INTO ai_law.tenants VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff','personal');
 INSERT INTO ai_law.memberships
  (membership_id,tenant_id,user_id,status,authz_version,role_registry_version,joined_at)
 VALUES ('11111111-ffff-4111-8111-111111111111',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  '11111111-1111-4111-8111-111111111111',
  'active',1,'1.1.15',now()-interval '1 day');
 INSERT INTO ai_law.membership_roles VALUES
  ('ffffffff-ffff-4fff-8fff-ffffffffffff',
   '11111111-ffff-4111-8111-111111111111','lawyer','1.1.15');
 COMMIT;" >/dev/null

org_a="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
org_b="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
personal="ffffffff-ffff-4fff-8fff-ffffffffffff"
login_a() {
  local subject="$1" tenant="$2" expected="$3" type="${4:-request}"
  python "$ROOT/tools/r38_fixture_prep.py" "$type" "$TMP/a" "$subject" "$tenant" |
    dc_a exec -T auth python -m tools.r38_login_probe login "$expected"
}
login_b() {
  local subject="$1" tenant="$2" expected="$3" type="${4:-request}"
  python "$ROOT/tools/r38_fixture_prep.py" "$type" "$TMP/b" "$subject" "$tenant" |
    dc_b exec -T auth python -m tools.r38_login_probe login "$expected"
}

# Check actual HTTP login, not a locally minted fake token.
login_a iaict-lawyer "$org_a" 401 bad-request
token_a="$(login_a iaict-lawyer "$org_a" 200)"
probe_a 200 "$token_a"
login_a iaict-lawyer "$org_b" 401
token_personal="$(login_a iaict-lawyer "$personal" 200)"
probe_a 404 "$token_personal"  # Identical principal but personal context.
token_admin="$(login_a iaict-admin "$org_a" 200)"
probe_a 404 "$token_admin"  # No implicit read from tenant_admin role.
token_b="$(login_b other-lawyer "$org_b" 200)"
probe_b 200 "$token_b"
probe_a 401 "$token_b"  # Independent issuer signing keys per install.
probe_b 401 "$token_a"

# Signing out revokes session in actual PostgreSQL, rechecked by API.
printf '%s' "$token_a" |
  dc_a exec -T auth python -m tools.r38_login_probe logout 200
probe_a 401 "$token_a"

# Account disabling revokes previously signed tokens via DB trigger.
sql_a "UPDATE ai_law_nonprod.password_accounts SET status='disabled'
        WHERE email='iaict-admin@example.invalid'" >/dev/null
probe_a 401 "$token_admin"
login_a iaict-admin "$org_a" 401

# Authentication SQL identity must NEVER be able to read legal case rows.
dc_a exec -T auth python - <<'PY'
import os
import psycopg
import sys
try:
    with psycopg.connect(os.environ["AI_LAW_AUTH_DB_DSN"]) as conn:
        conn.execute("SELECT count(*) FROM ai_law.matters")
except psycopg.errors.InsufficientPrivilege:
    print("PASS R38: auth SQL role cannot read case data")
else:
    print("FAIL R38: auth SQL role has unauthorized case SELECT")
    sys.exit(1)
PY

# Repeated bad passwords lock the real synthetic account in PostgreSQL,
# with one generic 401 even when the correct password is supplied afterward.
for attempt in $(seq 1 5); do
  login_a iaict-lawyer "$org_a" 401 bad-request
done
check_eq "$(sql_a "SELECT failed_attempts FROM ai_law_nonprod.password_accounts
  WHERE email='iaict-lawyer@example.invalid'")" "5" "five failed login attempts"
check_eq "$(sql_a "SELECT (locked_until > now())::text FROM ai_law_nonprod.password_accounts
  WHERE email='iaict-lawyer@example.invalid'")" "true" "account lockout timer persisted"
login_a iaict-lawyer "$org_a" 401

# No impact on unrelated independent installation.
probe_b 200 "$token_b"
echo "PASS R38: real Argon2id login/logout, organization+personal, account lockout, signed access, SQL session revoke and isolation"
