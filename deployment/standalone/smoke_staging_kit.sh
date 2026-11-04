#!/usr/bin/env bash
# R41 actual integration smoke for the owner-operable QA-only staging kit.
# Only disposable GitHub Actions hosts should run this because its explicit
# cleanup deletes the CI-owned volumes. The real operator commands in
# qa_staging.sh NEVER delete data or rotate a private QA account password.
set -Eeuo pipefail
if [ "${R41_CI:-}" != "disposable-docker-runner-only" ]; then
  echo "R41 full smoke explicitly restricted to disposable CI" >&2
  exit 2
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
umask 077
TMP="$(mktemp -d)"
export AI_LAW_NONPROD_QA="explicitly-approved-qa-only"
export AI_LAW_QA_HOME="$TMP/private"
export AI_LAW_QA_CREDENTIALS="$AI_LAW_QA_HOME/qa-credentials.json"
export AI_LAW_QA_PROJECT_PREFIX="alr41ci_${GITHUB_RUN_ID:-$$}_${GITHUB_RUN_ATTEMPT:-1}"
mkdir -p "$AI_LAW_QA_HOME"
chmod 700 "$AI_LAW_QA_HOME"
BASE="$ROOT/deployment/standalone/compose.yaml"
API="$ROOT/deployment/standalone/compose.api-test.yaml"
LOGIN="$ROOT/deployment/standalone/compose.login-test.yaml"
BROWSER="$ROOT/deployment/standalone/compose.browser-test.yaml"
PERSIST="$ROOT/deployment/standalone/compose.qa-persistent.yaml"
qactl() {
  bash "$ROOT/deployment/standalone/qa_staging.sh" "$1" "$2"
}
ci_down() {
  local profile="$1" dir="$AI_LAW_QA_HOME/$1"
  if [ -f "$dir/installation.env" ]; then
    docker compose -p "${AI_LAW_QA_PROJECT_PREFIX}_$profile" \
      --env-file "$dir/installation.env" \
      -f "$BASE" -f "$API" -f "$LOGIN" -f "$BROWSER" -f "$PERSIST" \
      down -v --remove-orphans >/dev/null 2>&1 || true
  fi
}
cleanup() {
  ci_down primary
  ci_down secondary
  rm -rf "$TMP"
}
trap cleanup EXIT
python -m tools.r40_qa_provision init \
  --credentials "$AI_LAW_QA_CREDENTIALS"
# R41 must NEVER mint/overwrite credentials; this is the same single bundle
# used for SQL provisioning, real HTTP login and the Chromium test.
qactl init primary
qactl init secondary
qactl preflight primary
qactl preflight secondary
SHA_PRIMARY="$(sha256sum "$AI_LAW_QA_HOME/primary/installation.env" | cut -d' ' -f1)"
SHA_SECONDARY="$(sha256sum "$AI_LAW_QA_HOME/secondary/installation.env" | cut -d' ' -f1)"
if qactl init primary > "$TMP/expected-reinit-refusal.log" 2>&1; then
  echo "FAIL R41: unsafe reinitialization of persistent QA signing keys" >&2
  exit 1
fi
[ "$SHA_PRIMARY" = "$(sha256sum "$AI_LAW_QA_HOME/primary/installation.env" | cut -d' ' -f1)" ]
[ "$SHA_SECONDARY" = "$(sha256sum "$AI_LAW_QA_HOME/secondary/installation.env" | cut -d' ' -f1)" ]

qactl up primary
qactl up secondary
qactl provision primary
qactl provision secondary
qactl verify primary
qactl verify secondary
python "$ROOT/tests/browser/test_r41_staging_browser.py" "$AI_LAW_QA_CREDENTIALS"

# A normal operator stop+restart does not remove volumes or stored accounts.
qactl stop primary
qactl stop secondary
qactl up primary
qactl up secondary
qactl verify primary
qactl verify secondary
qactl provision primary
qactl provision secondary
qactl preflight primary
qactl preflight secondary
[ "$SHA_PRIMARY" = "$(sha256sum "$AI_LAW_QA_HOME/primary/installation.env" | cut -d' ' -f1)" ]
[ "$SHA_SECONDARY" = "$(sha256sum "$AI_LAW_QA_HOME/secondary/installation.env" | cut -d' ' -f1)" ]
python "$ROOT/tests/browser/test_r41_staging_browser.py" "$AI_LAW_QA_CREDENTIALS"
echo "PASS R41: two operator-style private QA installations; same 10 creds, browser/HTTP auth, PostgreSQL volume, RSA signing keys survive stop/start; CI disposes installations"
