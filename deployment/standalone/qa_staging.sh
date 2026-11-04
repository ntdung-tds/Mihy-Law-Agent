#!/usr/bin/env bash
# R41 opt-in, nonproduction only: owner/operator local QA Compose management.
# The script never deletes database volumes, rotates saved QA passwords, or
# exposes auth, API or PG16 to the public network. User accesses UI via
# 127.0.0.1 or an authenticated/encrypted SSH port forward.
set -Eeuo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
ACTION="${1:-}"
PROFILE="${2:-}"
case "$ACTION" in init|up|provision|verify|status|stop|preflight) ;; *)
  echo "Usage: qa_staging.sh init|up|provision|verify|status|stop|preflight primary|secondary" >&2
  exit 2;;
esac
case "$PROFILE" in primary|secondary) ;; *) echo "Invalid QA installation" >&2; exit 2;; esac
if [ "${AI_LAW_NONPROD_QA:-}" != "explicitly-approved-qa-only" ]; then
  echo "R41 requires explicit isolated nonproduction QA flag" >&2
  exit 2
fi

SECRET_HOME="${AI_LAW_QA_HOME:-$HOME/.ai-law-qa}"
BUNDLE="${AI_LAW_QA_CREDENTIALS:-$SECRET_HOME/qa-credentials.json}"
DIR="$SECRET_HOME/$PROFILE"
ENV_FILE="$DIR/installation.env"
SQL_FILE="$DIR/qa-seed.sql"
PROJECT_PREFIX="${AI_LAW_QA_PROJECT_PREFIX:-ai_law_qa}"
case "$PROJECT_PREFIX" in ai_law_qa|alr41ci_[a-zA-Z0-9_]*) ;; *)
  echo "Invalid isolated QA project prefix" >&2; exit 2;;
esac
PROJECT="${PROJECT_PREFIX}_$PROFILE"
BASE="$ROOT/deployment/standalone/compose.yaml"
API="$ROOT/deployment/standalone/compose.api-test.yaml"
LOGIN="$ROOT/deployment/standalone/compose.login-test.yaml"
BROWSER="$ROOT/deployment/standalone/compose.browser-test.yaml"
PERSIST="$ROOT/deployment/standalone/compose.qa-persistent.yaml"

check() {
  python -m tools.r41_staging_config check \
    --profile "$PROFILE" --directory "$DIR" --credentials "$BUNDLE"
}
dc() {
  docker compose -p "$PROJECT" --env-file "$ENV_FILE" \
    -f "$BASE" -f "$API" -f "$LOGIN" -f "$BROWSER" -f "$PERSIST" "$@"
}
sql() {
  dc exec -T db psql -X -A -t -v ON_ERROR_STOP=1 \
    -U ai_law_admin -d ai_law -c "$1"
}
login() {
  local account="$1" tenant="$2" expected="$3"
  python -m tools.r40_qa_request --credentials "$BUNDLE" \
    --account "$account" --tenant "$tenant" |
    dc exec -T auth python -m tools.r38_login_probe login "$expected"
}
run_check() {
  local status="$1" token="$2" run="${3:-fixture-run}"
  printf '%s' "$token" |
    dc exec -T api python -m tools.r37_http_probe "$status" "/v1/runs/$run"
}
assert_equal() {
  [ "$1" = "$2" ] || { echo "FAIL R41: $3" >&2; exit 1; }
}
assert_private_network() {
  local container services=(db api auth)
  for service in "${services[@]}"; do
    container="$(dc ps -q "$service")"
    [ -n "$container" ] || { echo "FAIL R41: $service not running" >&2; exit 1; }
    if docker port "$container" 2>/dev/null | grep -q .; then
      echo "FAIL R41: internal service exposed via a host port" >&2
      exit 1
    fi
  done
  container="$(dc ps -q gateway)"
  [ -n "$container" ] || { echo "FAIL R41: gateway not running" >&2; exit 1; }
  if ! docker port "$container" 8082/tcp 2>/dev/null |
       grep -Eq "^127[.]0[.]0[.]1:1808[01]$"; then
    echo "FAIL R41: browser gateway not loopback-only" >&2
    exit 1
  fi
}

case "$ACTION" in
  init)
    python -m tools.r41_staging_config init \
      --profile "$PROFILE" --directory "$DIR" --credentials "$BUNDLE"
    echo "PASS R41: installation secrets initialized once; no DB started or account activated"
    ;;
  preflight)
    check
    ;;
  up)
    check
    docker build --quiet -t ai-law-r37-nonprod:local \
      -f "$ROOT/deployment/standalone/Dockerfile.nonprod-api" "$ROOT" >/dev/null
    dc config --quiet
    dc up -d --wait
    assert_private_network
    echo "PASS R41: local QA stack running on loopback only; named DB volume retained"
    ;;
  provision)
    check
    python -m tools.r40_qa_provision render \
      --credentials "$BUNDLE" --installation "$PROFILE" --output "$SQL_FILE"
    # Do not echo generated SQL: it contains Argon2id password hashes.
    if ! dc exec -T db psql -X -q -v ON_ERROR_STOP=1 \
        -U ai_law_admin -d ai_law < "$SQL_FILE" >/dev/null; then
      echo "FAIL R41: QA DB seed rejected (no credentials disclosed)" >&2
      exit 1
    fi
    expected=9; [ "$PROFILE" = secondary ] && expected=1
    assert_equal "$(sql "SELECT count(*) FROM ai_law_nonprod.password_accounts")" \
      "$expected" "actual QA account count"
    echo "PASS R41: private saved QA bundle provisioned to this named-volume database ($expected test actors)"
    ;;
  verify)
    check
    assert_private_network
    expected=9; [ "$PROFILE" = secondary ] && expected=1
    assert_equal "$(sql "SELECT count(*) FROM ai_law_nonprod.password_accounts")" \
      "$expected" "QA persistent account count"
    if [ "$PROFILE" = "primary" ]; then
      org="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      tok="$(login QA-01 f1111111-1111-4111-8111-111111111111 200)"; run_check 200 "$tok"
      tok="$(login QA-02 f2222222-2222-4222-8222-222222222222 200)"; run_check 200 "$tok"
      tok="$(login QA-02 "$org" 200)"; run_check 200 "$tok"
      tok="$(login QA-03 "$org" 200)"; run_check 404 "$tok"
      tok="$(login QA-04 "$org" 200)"; run_check 200 "$tok"; run_check 200 "$tok" qa-run-second
      tok="$(login QA-05 f5555555-5555-4555-8555-555555555555 200)"; run_check 200 "$tok"
      login QA-05 "$org" 401
      tok="$(login QA-06 f6666666-6666-4666-8666-666666666666 200)"; run_check 200 "$tok"
      login QA-06 "$org" 401
      login QA-07 "$org" 401
      tok="$(login QA-08 "$org" 200)"; run_check 200 "$tok"; run_check 404 "$tok" qa-run-second
      tok="$(login QA-09 bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb 200)"; run_check 200 "$tok"
      login QA-09 "$org" 401
      echo "PASS R41: 9 actual primary QA login/tenant/MatterACL checks"
    else
      tok="$(login QA-10 eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee 200)"; run_check 200 "$tok"
      echo "PASS R41: independent QA-10 login and SQL MatterACL"
    fi
    ;;
  status)
    check
    dc ps
    ;;
  stop)
    check
    dc stop
    echo "PASS R41: app stopped; private QA DB volume and credentials NOT deleted"
    ;;
esac
