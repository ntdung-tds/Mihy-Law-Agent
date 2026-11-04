"""Actual HTTP login/logout from WITHIN auth container, no bearer log leaks.

Valid login prints its access token only to stdout, which the smoke runner
captures in-memory; diagnostics and negative tests print status to stderr.
"""
from __future__ import annotations

import json
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def main():
    kind = sys.argv[1]
    expected = int(sys.argv[2])
    raw = sys.stdin.read()
    if kind == "login":
        url = "http://127.0.0.1:8081/standalone/auth/login"
        req = Request(url, data=raw.encode(),
                      headers={"Content-Type": "application/json"},
                      method="POST")
    elif kind == "logout":
        url = "http://127.0.0.1:8081/standalone/auth/logout"
        req = Request(url, data=b"",
                      headers={"Authorization": "Bearer " + raw.strip()},
                      method="POST")
    else:
        raise SystemExit("Test probe requires login or logout")
    try:
        with urlopen(req, timeout=6) as response:
            status = response.status
            data = json.load(response)
    except HTTPError as exc:
        status = exc.code
        data = json.load(exc)
    if status != expected:
        print("FAIL R38: expected HTTP", expected, "got", status, file=sys.stderr)
        return 1
    if kind == "login" and status == 200:
        token = data.get("access_token")
        if (not isinstance(token, str) or token.count(".") != 2
                or data.get("token_type") != "Bearer"
                or data.get("expires_in") != 900):
            print("FAIL R38: invalid signed login result", file=sys.stderr)
            return 1
        print("PASS R38 actual password HTTP login 200", file=sys.stderr)
        sys.stdout.write(token)
    elif kind == "logout" and status == 200:
        if data.get("ok") is not True:
            print("FAIL R38 logout response", file=sys.stderr)
            return 1
        print("PASS R38 persisted session logout", file=sys.stderr)
    else:
        if data.get("code") not in ("UNAUTHENTICATED", "INVALID_REQUEST"):
            print("FAIL R38 unexpected generic auth error", file=sys.stderr)
            return 1
        print("PASS R38 password HTTP denial", status, file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
