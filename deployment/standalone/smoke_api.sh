#!/usr/bin/env bash
# R37: actual isolated API containers + real PostgreSQL16 + cryptographic JWT.
# No private/real data, external IdP, or production/public network exposure.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE="$ROOT/deployment/standalone/compose.yaml"
EXT="$ROOT/deployment/standalone/compose.api-test.yaml"
EXT_LOGIN="$ROOT/deployment/standalone/compose.login-test.yaml"
R38_ENABLE="${R38_ENABLE:-0}"
if [ "$R38_ENABLE" != "0" ] && [ "$R38_ENABLE" != "1" ]; then
  echo "Invalid isolated test mode" >&2; exit 1
fi
OVERLAYS=()
if [ "$R38_ENABLE" = "1" ]; then OVERLAYS=(-f "$EXT_LOGIN"); fi
TMP="$(mktemp -d)"
umask 077
A="alr37_iaict_$$"
B="alr37_other_$$"
clean() {
  dc_a down -v --remove-orphans >/dev/null 2>&1 || true
  dc_b down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap clean EXIT
python "$ROOT/tools/r37_fixture_crypto.py" init "$TMP/a"
python "$ROOT/tools/r37_fixture_crypto.py" init "$TMP/b"
if [ "$R38_ENABLE" = "1" ]; then
  python "$ROOT/tools/r38_fixture_prep.py" init "$TMP/a" iaict
  python "$ROOT/tools/r38_fixture_prep.py" init "$TMP/b" other
fi

dc_a() { docker compose -p "$A" --env-file "$TMP/a/installation.env" -f "$BASE" -f "$EXT" "${OVERLAYS[@]}" "$@"; }
dc_b() { docker compose -p "$B" --env-file "$TMP/b/installation.env" -f "$BASE" -f "$EXT" "${OVERLAYS[@]}" "$@"; }
sql_a() { dc_a exec -T db psql -X -A -t -v ON_ERROR_STOP=1 -U ai_law_admin -d ai_law -c "$1"; }
sql_b() { dc_b exec -T db psql -X -A -t -v ON_ERROR_STOP=1 -U ai_law_admin -d ai_law -c "$1"; }
check_eq() {
  if [ "$1" != "$2" ]; then
    echo "FAIL R37: $3 (expected $2, actual $1)" >&2; exit 1
  fi
}
probe_a() { printf '%s' "$2" | dc_a exec -T api python -m tools.r37_http_probe "$1" "${3:-/v1/runs/fixture-run}"; }
probe_b() { printf '%s' "$2" | dc_b exec -T api python -m tools.r37_http_probe "$1" "${3:-/v1/runs/fixture-run}"; }

# Shared source build, different isolated runtime instances + public RSA keys.
docker build --quiet -t ai-law-r37-nonprod:local \
  -f "$ROOT/deployment/standalone/Dockerfile.nonprod-api" "$ROOT" >/dev/null
dc_a up -d --wait
dc_b up -d --wait
CA="$(dc_a ps -q api)"
CB="$(dc_b ps -q api)"
[ -n "$CA" ] && [ -n "$CB" ] && [ "$CA" != "$CB" ]
for container in "$CA" "$CB"; do
  if docker port "$container" 8080/tcp 2>/dev/null | grep -q .; then
    echo "FAIL R37: HTTP API host port published" >&2; exit 1
  fi
done
# Both APIs must actually be reachable over in-container loopback.
for i in $(seq 1 20); do
  if probe_a 401 "" >/dev/null 2>&1 && probe_b 401 "" >/dev/null 2>&1; then
    break
  fi
  if [ "$i" = 20 ]; then
    echo "FAIL R37: one or both HTTP containers failed to boot" >&2
    dc_a logs --tail=30 api db || true
    dc_b logs --tail=30 api db || true
    exit 1
  fi
  sleep 1
done
check_eq "$(sql_a "SELECT to_regclass('ai_law_nonprod.sessions') IS NOT NULL")" "t" "IAICT persisted sessions schema"
check_eq "$(sql_b "SELECT to_regclass('ai_law_nonprod.sessions') IS NOT NULL")" "t" "other persisted sessions schema"
check_eq "$(sql_a "SELECT rolsuper::text || ',' || rolbypassrls::text FROM pg_roles WHERE rolname='ai_law_r37_reader'")" "false,false" "unprivileged standalone reader"
check_eq "$(sql_b "SELECT rolsuper::text || ',' || rolbypassrls::text FROM pg_roles WHERE rolname='ai_law_r37_reader'")" "false,false" "unprivileged unrelated reader"

# Synthetic IAICT is an ordinary organization tenant with a lawyer and admin.
# Membership, roles, ACL, identities, sessions and queued run persist in PG.
sql_a "$(cat <<'SQL'
BEGIN;
INSERT INTO ai_law.principals VALUES
 ('11111111-1111-4111-8111-111111111111','iaict-lawyer','active'),
 ('22222222-2222-4222-8222-222222222222','iaict-admin','active');
INSERT INTO ai_law.tenants VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','organization');
INSERT INTO ai_law.role_catalog VALUES
 ('lawyer','Lawyer synthetic R37','1.1.15'),
 ('tenant_admin','Tenant admin synthetic R37','1.1.15');
INSERT INTO ai_law.memberships
(membership_id,tenant_id,user_id,status,authz_version,role_registry_version,joined_at) VALUES
 ('11111111-aaaa-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','active',1,'1.1.15',now()-interval '1 day'),
 ('22222222-aaaa-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','active',1,'1.1.15',now()-interval '1 day');
INSERT INTO ai_law.membership_roles VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-aaaa-4111-8111-111111111111','lawyer','1.1.15'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-aaaa-4222-8222-222222222222','tenant_admin','1.1.15');
INSERT INTO ai_law.matters VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-aaaa-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',1);
INSERT INTO ai_law.matter_user_acl
(tenant_id,matter_id,user_id,permission,effect,acl_version,valid_from)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-aaaa-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','read','allow',1,now()-interval '1 hour');
INSERT INTO ai_law_nonprod.identities VALUES
 ('https://idp.example.invalid','iaict-lawyer','11111111-1111-4111-8111-111111111111','active'),
 ('https://idp.example.invalid','iaict-admin','22222222-2222-4222-8222-222222222222','active');
INSERT INTO ai_law_nonprod.sessions VALUES
 ('r37-iaict-lawyer-sid','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()+interval '1 hour',NULL),
 ('r37-iaict-admin-sid','22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()+interval '1 hour',NULL);
INSERT INTO ai_law_nonprod.run_snapshots VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fixture-run','cccccccc-aaaa-4ccc-8ccc-cccccccccccc',
 '{"run_id":"fixture-run","status":"queued","input_snapshot_id":"synthetic-input-r37","policy_version":"synthetic-policy-r37"}'::jsonb);
COMMIT;
SQL
)" >/dev/null

sql_b "$(cat <<'SQL'
BEGIN;
INSERT INTO ai_law.principals VALUES
 ('33333333-3333-4333-8333-333333333333','other-lawyer','active');
INSERT INTO ai_law.tenants VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','organization');
INSERT INTO ai_law.role_catalog VALUES
 ('lawyer','Lawyer synthetic R37','1.1.15');
INSERT INTO ai_law.memberships
(membership_id,tenant_id,user_id,status,authz_version,role_registry_version,joined_at) VALUES
 ('33333333-bbbb-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','active',1,'1.1.15',now()-interval '1 day');
INSERT INTO ai_law.membership_roles VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-bbbb-4333-8333-333333333333','lawyer','1.1.15');
INSERT INTO ai_law.matters VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-bbbb-4ddd-8ddd-dddddddddddd','33333333-3333-4333-8333-333333333333',1);
INSERT INTO ai_law.matter_user_acl
(tenant_id,matter_id,user_id,permission,effect,acl_version,valid_from)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-bbbb-4ddd-8ddd-dddddddddddd','33333333-3333-4333-8333-333333333333','read','allow',1,now()-interval '1 hour');
INSERT INTO ai_law_nonprod.identities VALUES
 ('https://idp.example.invalid','other-lawyer','33333333-3333-4333-8333-333333333333','active');
INSERT INTO ai_law_nonprod.sessions VALUES
 ('r37-other-lawyer-sid','33333333-3333-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',now()+interval '1 hour',NULL);
INSERT INTO ai_law_nonprod.run_snapshots VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fixture-run','dddddddd-bbbb-4ddd-8ddd-dddddddddddd',
 '{"run_id":"fixture-run","status":"queued","input_snapshot_id":"synthetic-other-r37","policy_version":"synthetic-policy-r37"}'::jsonb);
COMMIT;
SQL
)" >/dev/null

LAWYER_A="$(python "$ROOT/tools/r37_fixture_crypto.py" mint "$TMP/a" iaict-lawyer r37-iaict-lawyer-sid)"
ADMIN_A="$(python "$ROOT/tools/r37_fixture_crypto.py" mint "$TMP/a" iaict-admin r37-iaict-admin-sid)"
LAWYER_B="$(python "$ROOT/tools/r37_fixture_crypto.py" mint "$TMP/b" other-lawyer r37-other-lawyer-sid)"

probe_a 200 "$LAWYER_A"
probe_a 404 "$ADMIN_A"  # Tenant admin has no implicit customer case read.
probe_a 404 "$LAWYER_A" "/v1/runs/another-run"
probe_b 200 "$LAWYER_B"
probe_b 401 "$LAWYER_A"  # Independent signing keys; cross-install token denied.
probe_a 401 "$LAWYER_B"
probe_a 401 ""
probe_a 401 "invalid-untrusted-token"

# The application SQL role cannot create tenant rows or become an admin user.
dc_a exec -T api python - <<'PY'
import os
import sys
import psycopg
try:
    with psycopg.connect(os.environ["AI_LAW_READER_DSN"]) as connection:
        connection.execute("INSERT INTO ai_law.tenants VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','organization')")
except psycopg.errors.InsufficientPrivilege:
    print("PASS R37: application database identity is read-only")
else:
    print("FAIL R37: app reader wrote organization tenant")
    sys.exit(1)
PY

# R38 exercises actual HTTP password login in the same two installations.
# The extra checks are sourced only when explicitly requested, and cannot
# change the validated R37-only smoke behavior.
if [ "$R38_ENABLE" = "1" ]; then
  source "$ROOT/deployment/standalone/smoke_login_extension.sh"
fi

# ACL revocation, independent of session state, must deny the SAME signed token.
sql_a "UPDATE ai_law.matter_user_acl
       SET valid_to=now()-interval '1 minute'
       WHERE tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
         AND user_id='11111111-1111-4111-8111-111111111111'" >/dev/null
probe_a 404 "$LAWYER_A"

# Test the persisted session and membership state on every subsequent call.
sql_a "UPDATE ai_law_nonprod.sessions SET revoked_at=now() WHERE session_id='r37-iaict-lawyer-sid'" >/dev/null
probe_a 401 "$LAWYER_A"
sql_b "UPDATE ai_law.memberships SET status='revoked',revoked_at=now()
       WHERE user_id='33333333-3333-4333-8333-333333333333'" >/dev/null
probe_b 404 "$LAWYER_B"
# Another container remains fully isolated after one application's session loss.
probe_a 404 "$ADMIN_A"
echo "PASS R37: two isolated real HTTP API/PG16 installations, RS256, SQL sessions, RLS/MatterACL, revoked and cross-install denial"
