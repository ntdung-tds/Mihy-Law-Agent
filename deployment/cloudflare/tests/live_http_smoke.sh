#!/usr/bin/env bash
# R43 real Cloudflare Workers nonproduction smoke. NO credentials or data.
# Fail if a protected endpoint responds with 200 to an anonymous caller.
set -Eeuo pipefail
BASE="https://ai-law-standalone-cf-qa.iaict-platform.workers.dev"
curl --retry 2 --retry-delay 1 --connect-timeout 10 --max-time 20 -fsS \
  "$BASE/health" -o /tmp/ai-law-cf-qa-health.json
python - <<'PY'
import json
from pathlib import Path
result=json.loads(Path("/tmp/ai-law-cf-qa-health.json").read_text())
assert result["scope"] == "nonprod_qa_only", result
assert result["status"] == "configured", result
print("PASS R43: Cloudflare Workers QA /health, no customer content")
PY
for route in /v1/runs/fixture-run /v1/files/test-file/metadata /v1/files/test-file/download; do
  status="$(curl --retry 2 --retry-delay 1 --connect-timeout 10 \
    --max-time 20 -sS -o /dev/null -w '%{http_code}' "$BASE$route")"
  [ "$status" = "401" ] || { echo "FAIL R43: anonymous protected endpoint status=$status" >&2; exit 1; }
done
status="$(curl --retry 2 --retry-delay 1 --connect-timeout 10 --max-time 20 \
  -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/runs/fixture-run")"
[ "$status" = "404" ] || { echo "FAIL R43: non-GET route returned $status" >&2; exit 1; }
echo "PASS R43: real public QA Worker rejects anonymous run/file and write requests"
