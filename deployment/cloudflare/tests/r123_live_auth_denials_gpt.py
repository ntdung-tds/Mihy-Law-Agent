"""R123 bounded LIVE QA authentication-denial checks, without credentials.

This script intentionally NEVER creates a user, session, tenant or password.
It exercises the deployed QA HTTP boundary with malformed/nonexistent credentials,
records only status codes, and treats connectivity errors as BLOCKED (not PASS).
"""
import json
import sys
import uuid
import urllib.error
import urllib.request

WEB = "https://ai-law-web-qa.iaict-platform.workers.dev"
FAKE_SID = str(uuid.uuid4())


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        return None


def probe(path, *, method="GET", body=None, origin=None, cookie=None):
    headers = {"Cache-Control": "no-store", "User-Agent": "Mihy-R123-anonymous-qa-gpt/1.0"}
    if origin is not None:
        headers["Origin"] = origin
        headers["Sec-Fetch-Site"] = "same-origin" if origin == WEB else "cross-site"
    if cookie is not None:
        headers["Cookie"] = "al_qa_session=" + cookie
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(WEB + path, method=method, headers=headers, data=data)
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=13) as response:
            return response.status, response.headers.get("Location", ""), response.read(9000).decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("Location", ""), exc.read(9000).decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError, OSError):
        return None, "", ""


def case(name, path, expected, *, method="GET", body=None, origin=None, cookie=None,
         location=None, forbidden=None):
    code, destination, content = probe(path, method=method, body=body, origin=origin, cookie=cookie)
    if code is None or code in (429, 502, 503, 504):
        outcome = "BLOCKED"
    elif code != expected or (location is not None and not destination.startswith(location)):
        outcome = "FAIL"
    elif forbidden is not None and forbidden in content:
        outcome = "FAIL"
    else:
        outcome = "PASS"
    return {"test": name, "result": outcome, "http": code}


def main():
    foreign = "https://attacker.invalid"
    matter = "88888888-8888-4888-8888-888888888888"
    synthetic = "R123_SYNTHETIC_ONLY_NO_REAL_LEGAL_DATA"
    legal = {
        "uc": "UC04", "matter_id": matter,
        "source_text": "Dieu 1. " + synthetic + ". Ban thao gia lap.",
        "source_text_2": "", "question": "", "language": "vi", "synthetic_consent": True
    }
    tests = [
        case("workspaces_no_session", "/api/qa/workspaces", 401),
        case("workspaces_unrecognized_session", "/api/qa/workspaces", 401, cookie=FAKE_SID),
        case("matters_no_session", "/api/qa/matters", 401),
        case("profile_no_session", "/api/qa/profile", 401),
        case("account_requires_login", "/account", 302, location="/login"),
        case("switch_workspace_no_session", "/api/qa/switch-workspace", 401,
             method="POST", origin=WEB, body={"tenant_id": matter}),
        case("password_change_no_session", "/api/qa/change-password", 401,
             method="POST", origin=WEB,
             body={"current_password": "R123SyntheticOldPass",
                   "new_password": "R123SyntheticNewPass"}),
        case("legal_run_unrecognized_sid", "/api/qa/legal/run", 401,
             method="POST", origin=WEB, cookie=FAKE_SID, body=legal, forbidden=synthetic),
        case("malformed_login_not_authenticating", "/api/qa/login", 401,
             method="POST", origin=WEB,
             body={"email": "not-an-email", "password": ""}),
        case("foreign_origin_switch_denied", "/api/qa/switch-workspace", 403,
             method="POST", origin=foreign, body={"tenant_id": matter}),
        case("foreign_origin_legal_denied", "/api/qa/legal/run", 403,
             method="POST", origin=foreign, body=legal, forbidden=synthetic),
    ]
    print("R123_LIVE_QA_DENIALS " + json.dumps(tests, separators=(",", ":")))
    passed = sum(x["result"] == "PASS" for x in tests)
    failed = sum(x["result"] == "FAIL" for x in tests)
    blocked = sum(x["result"] == "BLOCKED" for x in tests)
    print(f"R123_RESULT PASS={passed} FAIL={failed} BLOCKED={blocked} AUTHENTICATED_LOGIN=NOT_RUN")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
