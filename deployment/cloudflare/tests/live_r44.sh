#!/usr/bin/env bash
set -Eeuo pipefail
BASE="https://ai-law-standalone-cf-qa.iaict-platform.workers.dev"
PAGE="$(mktemp)"
trap 'rm -f "$PAGE"' EXIT
code="$(curl --retry 2 --connect-timeout 12 --max-time 25 -sS -o "$PAGE" -w '%{http_code}' "$BASE/")"
test "$code" = 200
grep -q 'id="login-email"' "$PAGE"
grep -q 'id="login-password"' "$PAGE"
grep -q 'name="viewport"' "$PAGE"
for route in /assets/app.js /assets/theme.css; do
 code="$(curl --retry 2 --connect-timeout 12 --max-time 25 -sS -o /dev/null -w '%{http_code}' "$BASE$route")"
 test "$code" = 200
done
code="$(curl --retry 2 --connect-timeout 12 --max-time 25 -sS -o /dev/null -w '%{http_code}' "$BASE/v1/auth/me")"
test "$code" = 401
code="$(curl --retry 2 --connect-timeout 12 --max-time 25 -sS -o /dev/null -w '%{http_code}' \
  -X POST -H 'Content-Type: application/json' -H 'Origin: https://not-authorized.invalid' \
  --data '{"email":"not-a-user@ai-law.invalid","password":"no-secret"}' "$BASE/v1/auth/login")"
test "$code" = 403
echo "PASS R44: real Cloudflare HTTPS login page/CSS/client, anonymous cookie session 401 and forged origin 403"
