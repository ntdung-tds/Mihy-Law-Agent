"""Actual R37 in-container HTTP probe; reads Bearer from stdin, no token logs."""
from __future__ import annotations

from io import BytesIO
import json
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def main():
    expected = int(sys.argv[1])
    path = sys.argv[2] if len(sys.argv) > 2 else "/v1/runs/fixture-run"
    token = sys.stdin.read().strip()
    headers = {"Authorization": "Bearer " + token} if token else {}
    req = Request("http://127.0.0.1:8080" + path, headers=headers)
    try:
        with urlopen(req, timeout=4) as response:
            status, body = response.status, json.load(response)
    except HTTPError as error:
        status, body = error.code, json.load(error)
    if status != expected:
        print("FAIL: unexpected HTTP status; expected", expected, "got", status)
        return 1
    if status == 200 and (body.get("run_id") != "fixture-run" or
                          body.get("status") != "queued"):
        print("FAIL: unexpected TaskRun response")
        return 1
    if status != 200 and (not isinstance(body.get("code"), str)
                          or "correlation_id" not in body):
        print("FAIL: missing generic error contract")
        return 1
    print("PASS R37 HTTP", status)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
