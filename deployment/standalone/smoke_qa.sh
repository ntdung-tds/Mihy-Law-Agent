#!/usr/bin/env bash
# R40: real PostgreSQL16 QA provisioning, credential-based HTTP login and
# durable volume restart across two independent installations. CI deletes
# both test stacks at end; the script is NOT the live persistent staging host.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"
umask 077
PRIMARY="alr40_primary_$$"
SECONDARY="alr40_secondary_$$"
BASE="$ROOT/deployment/standalone/compose.yaml"
API="$ROOT/deployment/standalone/compose.api-test.yaml"
LOGIN="$ROOT/deployment/standalone/compose.login-test.yaml"
dc_a() { docker compose -p "$PRIMARY" --env-file "$TMP/a/installation.env" -f "$BASE" -f "$API" -f "$LOGIN" "$@"; }
dc_b() { docker compose -p "$SECONDARY" --env-file "$TMP/b/installation.env" -f "$BASE" -f "$API" -f "$LOGIN" "$@"; }
cleanup() {
  dc_a down -v --remove-orphans >/dev/null 2>&1 || true
  dc_b down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT
sql_a() { dc_a exec -T db psql -X -A -t -v ON_ERROR_STOP=1 -U ai_law_admin -d ai_law -c "$1"; }
sql_b() { dc_b exec -T db psql -X -A -t -v ON_ERROR_STOP=1 -U ai_law_admin -d ai_law -c "$1"; }
require_eq() {
  [ "$1" = "$2" ] || { echo "FAIL R40: $3 (expected $2)" >&2; exit 1; }
}
probe_a() {
  printf '%s' "$2" | dc_a exec -T api python -m tools.r37_http_probe "$1" "${3:-/v1/runs/fixture-run}"
}
probe_b() {
  printf '%s' "$2" | dc_b exec -T api python -m tools.r37_http_probe "$1" "${3:-/v1/runs/fixture-run}"
}
login_a() {
  local actor="$1" tenant="$2" expected="$3"
  python "$ROOT/tools/r40_qa_request.py" \
    --credentials "$TMP/qa-credentials.json" --account "$actor" --tenant "$tenant" |
    dc_a exec -T auth python -m tools.r38_login_probe login "$expected"
}
login_b() {
  local actor="$1" tenant="$2" expected="$3"
  python "$ROOT/tools/r40_qa_request.py" \
    --credentials "$TMP/qa-credentials.json" --account "$actor" --tenant "$tenant" |
    dc_b exec -T auth python -m tools.r38_login_probe login "$expected"
}
apply_a() {
  if ! dc_a exec -T db psql -X -q -v ON_ERROR_STOP=1 \
       -U ai_law_admin -d ai_law < "$TMP/qa-primary.sql" \
       > "$TMP/apply-a.log" 2>&1; then
    echo "FAIL R40: primary SQL provisioning refused; output kept only in private throwaway temp" >&2
    exit 1
  fi
}
apply_b() {
  if ! dc_b exec -T db psql -X -q -v ON_ERROR_STOP=1 \
       -U ai_law_admin -d ai_law < "$TMP/qa-secondary.sql" \
       > "$TMP/apply-b.log" 2>&1; then
    echo "FAIL R40: secondary SQL provisioning refused" >&2
    exit 1
  fi
}
mkdir -p "$TMP/a" "$TMP/b"
python "$ROOT/tools/r37_fixture_crypto.py" init "$TMP/a"
python "$ROOT/tools/r37_fixture_crypto.py" init "$TMP/b"
# Reuses the existing R38 test-only environment secret setup. Its old
# 3-account fixture SQL is NEVER applied by this R40 suite.
python "$ROOT/tools/r38_fixture_prep.py" init "$TMP/a" iaict
python "$ROOT/tools/r38_fixture_prep.py" init "$TMP/b" other

# Create ALL TEN QA credentials exactly once in one owner-private bundle.
python "$ROOT/tools/r40_qa_provision.py" init \
  --credentials "$TMP/qa-credentials.json"
AI_LAW_NONPROD_QA=explicitly-approved-qa-only \
  python "$ROOT/tools/r40_qa_provision.py" render \
    --credentials "$TMP/qa-credentials.json" \
    --installation primary --output "$TMP/qa-primary.sql"
AI_LAW_NONPROD_QA=explicitly-approved-qa-only \
  python "$ROOT/tools/r40_qa_provision.py" render \
    --credentials "$TMP/qa-credentials.json" \
    --installation secondary --output "$TMP/qa-secondary.sql"
if [ "$(stat -c '%a' "$TMP/qa-credentials.json")" != "600" ]; then
  echo "FAIL R40: private credential bundle not owner-only" >&2; exit 1
fi

docker build --quiet -t ai-law-r37-nonprod:local \
  -f "$ROOT/deployment/standalone/Dockerfile.nonprod-api" "$ROOT" >/dev/null
dc_a up -d --wait
dc_b up -d --wait
for i in $(seq 1 20); do
  if dc_a exec -T auth python -c \
    'import socket;socket.create_connection(("127.0.0.1",8081),2).close()' >/dev/null 2>&1 &&
     dc_b exec -T auth python -c \
    'import socket;socket.create_connection(("127.0.0.1",8081),2).close()' >/dev/null 2>&1; then
    break
  fi
  if [ "$i" = 20 ]; then
    echo "FAIL R40: private auth HTTP did not start" >&2; exit 1
  fi
  sleep 1
done
for container in "$(dc_a ps -q api)" "$(dc_b ps -q api)" \
                 "$(dc_a ps -q auth)" "$(dc_b ps -q auth)"; do
  if docker port "$container" 2>/dev/null | grep -q .; then
    echo "FAIL R40: internal auth/API published to host" >&2; exit 1
  fi
done

apply_a
apply_b
require_eq "$(sql_a 'SELECT count(*) FROM ai_law_nonprod.password_accounts')" "9" "nine primary QA accounts"
require_eq "$(sql_b 'SELECT count(*) FROM ai_law_nonprod.password_accounts')" "1" "one separate QA account"
require_eq "$(sql_a "SELECT count(*) FROM ai_law_nonprod.password_accounts
  WHERE split_part(password_hash,'$',2)='argon2id'")" "9" "primary Argon2id passwords"
require_eq "$(sql_b "SELECT count(*) FROM ai_law_nonprod.password_accounts
  WHERE split_part(password_hash,'$',2)='argon2id'")" "1" "separate Argon2id password"
require_eq "$(sql_a "SELECT count(*) FROM ai_law_nonprod.qa_install_registration")" "1" "private manifest fingerprint primary"

ORG_A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ORG_OTHER="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
ORG_B="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
P01="f1111111-1111-4111-8111-111111111111"
P02="f2222222-2222-4222-8222-222222222222"
P05="f5555555-5555-4555-8555-555555555555"
P06="f6666666-6666-4666-8666-666666666666"

# Every user is a real persisted SQL identity and an actual HTTP login.
# RA-02 personal specialist
T01="$(login_a QA-01 "$P01" 200)"; probe_a 200 "$T01"
# RA-03 SAME principal in personal and organization contexts
T02P="$(login_a QA-02 "$P02" 200)"; probe_a 200 "$T02P"
T02O="$(login_a QA-02 "$ORG_A" 200)"; probe_a 200 "$T02O"
probe_a 404 "$T02P" "/v1/runs/qa-run-second"
# RA-04 org administrator has no automatic legal-case access
T03="$(login_a QA-03 "$ORG_A" 200)"; probe_a 404 "$T03"
# RA-05 lawyer with explicit grants to two matters
T04="$(login_a QA-04 "$ORG_A" 200)"; probe_a 200 "$T04"
probe_a 200 "$T04" "/v1/runs/qa-run-second"
# RA-06 external personal-only account can never select IAICT org
T05="$(login_a QA-05 "$P05" 200)"; probe_a 200 "$T05"
login_a QA-05 "$ORG_A" 401
# RA-06/07 revoked organization membership but active personal workspace
T06="$(login_a QA-06 "$P06" 200)"; probe_a 200 "$T06"
login_a QA-06 "$ORG_A" 401
# RA-07 disabled account (correct private password still cannot login)
login_a QA-07 "$ORG_A" 401
# RA-09 limited member can read *only* one of two cases in the same tenant
T08="$(login_a QA-08 "$ORG_A" 200)"; probe_a 200 "$T08"
probe_a 404 "$T08" "/v1/runs/qa-run-second"
# RA-06 cross-tenant outsider in same standalone installation
T09="$(login_a QA-09 "$ORG_OTHER" 200)"; probe_a 200 "$T09"
login_a QA-09 "$ORG_A" 401
# RA-08 different standalone installation has different signed JWT key
T10="$(login_b QA-10 "$ORG_B" 200)"; probe_b 200 "$T10"
probe_a 401 "$T10"
probe_b 401 "$T04"
echo "PASS R40: 10 actual HTTP QA identities incl personal, dual, admin, lawyer, outsider, revoked, disabled, limited and isolated installation"

# Repeat same SQL must be safe, not insert a second account, rotate a password,
# grant a new role, increase ACL version or change a password hash.
VER_BEFORE="$(sql_a "SELECT acl_version FROM ai_law.matters
  WHERE tenant_id='$ORG_A' AND matter_id='c1111111-1111-4111-8111-111111111111'")"
HASH_BEFORE="$(sql_a "SELECT password_hash FROM ai_law_nonprod.password_accounts
  WHERE email='qa04.lawyer@ai-law.invalid'")"
apply_a
apply_b
require_eq "$(sql_a "SELECT count(*) FROM ai_law_nonprod.password_accounts")" "9" "idempotent primary count"
require_eq "$(sql_b "SELECT count(*) FROM ai_law_nonprod.password_accounts")" "1" "idempotent separate count"
require_eq "$(sql_a "SELECT password_hash FROM ai_law_nonprod.password_accounts
  WHERE email='qa04.lawyer@ai-law.invalid'")" "$HASH_BEFORE" "no QA password rotation"
require_eq "$(sql_a "SELECT acl_version FROM ai_law.matters
  WHERE tenant_id='$ORG_A' AND matter_id='c1111111-1111-4111-8111-111111111111'")" "$VER_BEFORE" "no repeat ACL changes"

# Prove durable named PostgreSQL volume survives COMPOSE DOWN and UP *without -v*.
dc_a down
dc_b down
dc_a up -d --wait
dc_b up -d --wait
require_eq "$(sql_a "SELECT count(*) FROM ai_law_nonprod.password_accounts")" "9" "QA accounts persist across service down/up"
require_eq "$(sql_b "SELECT count(*) FROM ai_law_nonprod.password_accounts")" "1" "separate QA account persists across restart"
# Existing minted SQL session survives same installation restart.
probe_a 200 "$T04"
probe_b 200 "$T10"
# Passwords still work after app and DB restart.
T04_NEW="$(login_a QA-04 "$ORG_A" 200)"; probe_a 200 "$T04_NEW"
T10_NEW="$(login_b QA-10 "$ORG_B" 200)"; probe_b 200 "$T10_NEW"

# Refuse a different secret bundle on same live installation. Do not log
# password hashes or SQL query text on expected error.
python "$ROOT/tools/r40_qa_provision.py" init \
  --credentials "$TMP/wrong-qa-credentials.json" >/dev/null
AI_LAW_NONPROD_QA=explicitly-approved-qa-only \
  python "$ROOT/tools/r40_qa_provision.py" render \
    --credentials "$TMP/wrong-qa-credentials.json" \
    --installation primary --output "$TMP/wrong-qa.sql" >/dev/null
if dc_a exec -T db psql -X -q -v ON_ERROR_STOP=1 \
    -U ai_law_admin -d ai_law < "$TMP/wrong-qa.sql" \
    > "$TMP/expected-refusal.log" 2>&1; then
  echo "FAIL R40: existing QA credentials implicitly rotated" >&2; exit 1
fi
T04_LAST="$(login_a QA-04 "$ORG_A" 200)"; probe_a 200 "$T04_LAST"
echo "PASS R40: named-volume QA persistence across Compose down/up; same seed idempotent; wrong credential bundle refused"
