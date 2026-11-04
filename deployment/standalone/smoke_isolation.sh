#!/usr/bin/env bash
# R36: run TWO real disposable PostgreSQL16 standalone DB stacks, not a fake CI.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE="$ROOT/deployment/standalone/compose.yaml"
TMP="$(mktemp -d)"
umask 077
A="alr36_iaict_$$"
B="alr36_other_$$"
cleanup() {
  docker compose -p "$A" --env-file "$TMP/a.env" -f "$COMPOSE" down -v --remove-orphans >/dev/null 2>&1 || true
  docker compose -p "$B" --env-file "$TMP/b.env" -f "$COMPOSE" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT
printf 'AI_LAW_DB_PASSWORD=%s\n' "$(openssl rand -hex 24)" > "$TMP/a.env"
printf 'AI_LAW_DB_PASSWORD=%s\n' "$(openssl rand -hex 24)" > "$TMP/b.env"
dc_a() { docker compose -p "$A" --env-file "$TMP/a.env" -f "$COMPOSE" "$@"; }
dc_b() { docker compose -p "$B" --env-file "$TMP/b.env" -f "$COMPOSE" "$@"; }
sql_a() { dc_a exec -T db psql -X -A -t -v ON_ERROR_STOP=1 -U ai_law_admin -d ai_law -c "$1"; }
sql_b() { dc_b exec -T db psql -X -A -t -v ON_ERROR_STOP=1 -U ai_law_admin -d ai_law -c "$1"; }
assert_eq() {
  if [ "$1" != "$2" ]; then
    echo "FAIL: $3; expected '$2', got '$1'" >&2
    exit 1
  fi
}
docker compose version
dc_a up -d --wait
dc_b up -d --wait
# Different running physical database containers and no publicly mapped DB port.
ID_A="$(dc_a ps -q db)"
ID_B="$(dc_b ps -q db)"
[ -n "$ID_A" ] && [ -n "$ID_B" ] && [ "$ID_A" != "$ID_B" ]
if docker port "$ID_A" 5432/tcp 2>/dev/null | grep -q .; then
  echo "FAIL: IAICT installation exposes PostgreSQL port" >&2; exit 1
fi
if docker port "$ID_B" 5432/tcp 2>/dev/null | grep -q .; then
  echo "FAIL: other installation exposes PostgreSQL port" >&2; exit 1
fi
assert_eq "$(sql_a "SELECT to_regclass('ai_law.memberships') IS NOT NULL")" "t" "IAICT schema migration"
assert_eq "$(sql_b "SELECT to_regclass('ai_law.memberships') IS NOT NULL")" "t" "other schema migration"
# The IAICT organization is ordinary installation-local customer test data.
# Identifiers are fictional. Do not seed real identities or client cases.
sql_a "INSERT INTO ai_law.tenants(tenant_id,tenant_type) VALUES ('aaaa1111-1111-4111-8111-111111111111','organization')" >/dev/null
assert_eq "$(sql_a "SELECT count(*) FROM ai_law.tenants")" "1" "IAICT tenant inserted"
assert_eq "$(sql_b "SELECT count(*) FROM ai_law.tenants")" "0" "other installation sees no IAICT tenant"
sql_b "INSERT INTO ai_law.tenants(tenant_id,tenant_type) VALUES ('bbbb2222-2222-4222-8222-222222222222','organization')" >/dev/null
assert_eq "$(sql_b "SELECT count(*) FROM ai_law.tenants")" "1" "other tenant inserted"
assert_eq "$(sql_a "SELECT count(*) FROM ai_law.tenants")" "1" "IAICT sees no other installation tenant"
dc_a restart db >/dev/null
dc_a up -d --wait >/dev/null
assert_eq "$(sql_a "SELECT count(*) FROM ai_law.tenants")" "1" "IAICT volume survives restart"
assert_eq "$(sql_b "SELECT count(*) FROM ai_law.tenants")" "1" "other database unaffected by restart"
echo "PASS R36: two real isolated PostgreSQL16 installation databases, separate fixtures/volumes/secrets, no host ports"
