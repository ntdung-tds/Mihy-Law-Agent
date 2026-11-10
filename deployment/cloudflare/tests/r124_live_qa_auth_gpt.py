#!/usr/bin/env python3
"""R124: real isolated Cloudflare QA login acceptance, only with private approved credentials.

No public repo/CI account bootstrap. One valid login attempt only; no retry,
no screenshots, no raw server responses, passwords, session cookies, user IDs,
tenant IDs, matter IDs or customer content printed. Always logout.
Exit: 0 PASS, 2 BLOCKED/PARTIAL, 1 FAIL.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid
from http.cookies import SimpleCookie

URL = "https://ai-law-web-qa.iaict-platform.workers.dev"
COOKIE = "al_qa_session"
SAMPLE = "R124_SYNTHETIC_SOURCE_ONLY_NOT_REAL_CUSTOMER_DATA"


class GateError(Exception):
    def __init__(self, category, reason):
        super().__init__(reason)
        self.category = category
        self.reason = reason


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class LiveQA:
    def __init__(self):
        self.opener = urllib.request.build_opener(NoRedirect())

    def call(self, path, method="GET", cookie=None, body=None):
        if not path.startswith("/api/qa/"):
            raise GateError("FAIL", "UNEXPECTED_ROUTE")
        headers = {"Cache-Control": "no-store", "User-Agent": "Mihy-Law-R124-private-qa-gpt"}
        if cookie:
            headers["Cookie"] = COOKIE + "=" + cookie
        if method == "POST":
            headers["Origin"] = URL
            headers["Sec-Fetch-Site"] = "same-origin"
            headers["Content-Type"] = "application/json"
        data = json.dumps(body or {}, ensure_ascii=False).encode("utf-8") if method == "POST" else None
        request = urllib.request.Request(URL + path, method=method, headers=headers, data=data)
        try:
            with self.opener.open(request, timeout=16) as r:
                return r.status, dict(r.headers), r.read(16000).decode("utf-8", "replace")
        except urllib.error.HTTPError as err:
            return err.code, dict(err.headers), err.read(16000).decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError, OSError):
            raise GateError("BLOCKED", "NETWORK_UNREACHABLE") from None


def expect_status(label, status, expected, checks):
    if status in (429, 502, 503, 504):
        raise GateError("BLOCKED", label + "_TEMPORARY_UNAVAILABLE")
    if status != expected:
        raise GateError("FAIL", label + "_UNEXPECTED_HTTP_" + str(status))
    checks.append(label)


def session_cookie(headers):
    raw = next((v for k, v in headers.items() if k.lower() == "set-cookie"), "")
    jar = SimpleCookie()
    try:
        jar.load(raw)
    except Exception:
        raise GateError("FAIL", "INVALID_SESSION_SET_COOKIE") from None
    entry = jar.get(COOKIE)
    if not entry or not re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", entry.value):
        raise GateError("FAIL", "MISSING_SESSION_COOKIE")
    if not entry["httponly"] or not entry["secure"] or entry["samesite"].lower() != "strict":
        raise GateError("FAIL", "INSECURE_SESSION_COOKIE_ATTRIBUTES")
    return entry.value


def json_reply(body):
    try:
        value = json.loads(body)
    except (ValueError, TypeError):
        raise GateError("FAIL", "MALFORMED_JSON_RESPONSE") from None
    if not isinstance(value, dict):
        raise GateError("FAIL", "UNEXPECTED_JSON_RESPONSE")
    return value


def run_qa(email, password, client):
    checks = []
    current_cookie = None
    try:
        status, hdr, _ = client.call("/api/qa/login", method="POST",
                                     body={"email": email, "password": password})
        if status == 401:
            raise GateError("BLOCKED", "QA_TEST_CREDENTIAL_UNAUTHORIZED")
        expect_status("approved_password_login", status, 200, checks)
        current_cookie = session_cookie(hdr)
        checks.append("secure_httponly_cookie")

        status, _, data = client.call("/api/qa/session", cookie=current_cookie)
        expect_status("session_identity_verified", status, 200, checks)
        me = json_reply(data)
        current_tenant = me.get("tenant_id")
        if not isinstance(current_tenant, str):
            raise GateError("FAIL", "MISSING_SESSION_TENANT")

        status, _, data = client.call("/api/qa/workspaces", cookie=current_cookie)
        expect_status("authorized_workspaces_listed", status, 200, checks)
        workspaces = json_reply(data).get("workspaces")
        if not isinstance(workspaces, list) or not workspaces:
            raise GateError("FAIL", "NO_AUTHORIZED_QA_WORKSPACE")
        members = [w.get("tenant_id") for w in workspaces if isinstance(w, dict)]
        if current_tenant not in members:
            raise GateError("FAIL", "CURRENT_TENANT_NOT_IN_MEMBERSHIPS")

        status, _, _ = client.call("/api/qa/matters", cookie=current_cookie)
        expect_status("authorized_matter_list_access", status, 200, checks)

        # Random nonexistent UUID prevents accessing anyone's actual QA/legal matter.
        status, _, data = client.call("/api/qa/legal/run", method="POST",
            cookie=current_cookie,
            body={"uc": "UC04", "matter_id": str(uuid.uuid4()),
                  "source_text": "Điều 1. " + SAMPLE + ". Đây là dữ liệu giả lập.",
                  "source_text_2": "", "question": "", "language": "vi",
                  "synthetic_consent": True})
        expect_status("unauthorized_matter_denied", status, 404, checks)
        if SAMPLE in data or '"source_anchors"' in data or '"answer"' in data:
            raise GateError("FAIL", "DENIAL_EXPOSED_SOURCE")
        checks.append("no_source_leakage_on_denial")

        other = next((t for t in members if isinstance(t, str) and t != current_tenant), None)
        if other is None:
            return {"status": "PARTIAL", "reason": "NO_SECOND_AUTHORIZED_WORKSPACE",
                    "checks": checks, "authenticated": True}
        previous_cookie = current_cookie
        status, hdr, _ = client.call("/api/qa/switch-workspace", method="POST",
            cookie=current_cookie, body={"tenant_id": other})
        expect_status("switch_authorized_tenant", status, 200, checks)
        current_cookie = session_cookie(hdr)
        if current_cookie == previous_cookie:
            raise GateError("FAIL", "SESSION_NOT_ROTATED")
        checks.append("secure_session_rotated")

        status, _, _ = client.call("/api/qa/session", cookie=previous_cookie)
        expect_status("old_session_rejected", status, 401, checks)
        status, _, data = client.call("/api/qa/session", cookie=current_cookie)
        expect_status("new_session_accepted", status, 200, checks)
        if json_reply(data).get("tenant_id") != other:
            raise GateError("FAIL", "INCORRECT_SWITCHED_TENANT")
        checks.append("new_tenant_identity_verified")
        return {"status": "PASS", "checks": checks, "authenticated": True}
    finally:
        if current_cookie:
            try:
                status, _, _ = client.call("/api/qa/logout", method="POST",
                                            cookie=current_cookie, body={})
                if status != 200:
                    raise GateError("FAIL", "LOGOUT_UNCONFIRMED")
                checks.append("logout_confirmed")
            except GateError:
                # Caller must see cleanup failure even if an earlier assertion failed.
                raise GateError("BLOCKED", "QA_LOGOUT_UNCONFIRMED") from None


def main():
    email = os.getenv("MIHY_QA_R124_EMAIL", "").strip()
    password = os.getenv("MIHY_QA_R124_PASSWORD", "")
    if not email or not password:
        print("R124_RESULT " + json.dumps({"status": "BLOCKED",
              "reason": "APPROVED_PRIVATE_QA_CREDENTIALS_NOT_CONNECTED",
              "authenticated": False, "checks": []}))
        return 2
    # No retry: malformed/wrong test credentials must not risk account lockouts.
    try:
        outcome = run_qa(email, password, LiveQA())
        code = 0 if outcome["status"] == "PASS" else 2
    except GateError as err:
        outcome = {"status": err.category, "reason": err.reason,
                   "authenticated": False, "checks": []}
        code = 1 if err.category == "FAIL" else 2
    # Only test names/statuses. Never emit secrets, cookies, identities or responses.
    print("R124_RESULT " + json.dumps(outcome, separators=(",", ":")))
    return code


if __name__ == "__main__":
    sys.exit(main())
