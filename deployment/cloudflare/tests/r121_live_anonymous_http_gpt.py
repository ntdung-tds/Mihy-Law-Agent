"""R121: safe anonymous LIVE HTTP probes of isolated AI Law QA.

Runs only on the dedicated R121 PR branch; no login, cookies, personal data,
production endpoints, storage, or model invocation is intentionally authorized.
Network errors = BLOCKED, not a fake PASS.
"""
import json
import sys
import urllib.error
import urllib.request

WEB = "https://ai-law-web-qa.iaict-platform.workers.dev"
BACK = "https://ai-law-standalone-cf-qa.iaict-platform.workers.dev"

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def probe(path, method="GET", *, root=WEB, origin=None, payload=None):
    headers = {"User-Agent": "AI-Law-QA-R121-anonymous-synthetic-only/1.0",
               "Cache-Control": "no-store"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    if origin is not None:
        headers["Origin"] = origin
        headers["Sec-Fetch-Site"] = "same-origin" if origin == root else "cross-site"
    req = urllib.request.Request(root + path, method=method,
                                 headers=headers, data=payload)
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(req, timeout=12) as res:
            return {"status": res.status, "location": res.headers.get("Location",""),
                    "body": res.read(12000).decode("utf-8",errors="replace")}
    except urllib.error.HTTPError as exc:
        return {"status": exc.code, "location": exc.headers.get("Location",""),
                "body": exc.read(12000).decode("utf-8",errors="replace")}
    except (urllib.error.URLError,TimeoutError,OSError):
        return {"status": None, "blocked": "NETWORK_OR_DNS"}

def record(case, got, expected, *, check_body=None, check_location=None):
    status = got.get("status")
    if status is None or status in (429,502,503,504):
        state = "BLOCKED"
    elif status == expected and (check_body is None or check_body in got["body"]) and (
         check_location is None or got["location"].startswith(check_location)):
        state = "PASS"
    else:
        state = "FAIL"
    return {"test":case, "status":state, "http_status":status,
            "reason":got.get("blocked") if state=="BLOCKED" else None}

def main():
    # The synthetic text has no customer, legal source, or credential content.
    data = json.dumps({
        "uc":"UC10",
        "matter_id":"44444444-4444-4444-8444-444444444444",
        "source_text":"Dieu 1. Van ban gia lap kiem thu quyen, khong phai du lieu that.",
        "source_text_2":"",
        "question":"van ban gia lap",
        "language":"vi",
        "synthetic_consent":True,
    },ensure_ascii=False).encode("utf-8")
    result = [
        record("backend_health",probe("/health",root=BACK),200,check_body='"nonprod_qa_only"'),
        record("website_health",probe("/health"),200,check_body='"qa_nonproduction"'),
        record("login_public",probe("/login"),200,check_body='login-form'),
        record("app_requires_login",probe("/app#assistant"),302,check_location="/login"),
        record("session_requires_login",probe("/api/qa/session"),401),
        record("legal_api_requires_login",probe("/api/qa/legal/run",method="POST",origin=WEB,payload=data),401),
        record("foreign_origin_blocked",probe("/api/qa/legal/run",method="POST",origin="https://attacker.invalid",payload=data),400),
    ]
    print("R121_ANONYMOUS_LIVE_QA "+json.dumps(result,separators=(",",":")))
    passed=sum(x["status"]=="PASS" for x in result)
    blocked=sum(x["status"]=="BLOCKED" for x in result)
    failed=sum(x["status"]=="FAIL" for x in result)
    print(f"R121_RESULT PASS={passed} BLOCKED={blocked} FAIL={failed}; AUTHENTICATED_E2E=NOT_RUN")
    # Red if unexpectedly permissive or a documented endpoint violates the contract;
    # blocked external access stays explicitly INCONCLUSIVE.
    return 1 if failed else 0

if __name__=="__main__":
    sys.exit(main())
