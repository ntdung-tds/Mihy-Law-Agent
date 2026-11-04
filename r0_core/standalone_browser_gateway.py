"""R39 private loopback-only BFF for standalone AI Law browser test.

This is a real WSGI login UI integration against R38 auth and R37 API
processes, NOT a production session server, new approved SRS endpoint,
long-lived staging install, or a hosted IAICT SaaS.

The browser never receives the signed JWT. The gateway holds it in bounded,
ephemeral process memory, exposing only an opaque HttpOnly SameSite cookie.
Every protected HTTP call is rechecked by the actual API/SQL session/MatterACL.
"""
from __future__ import annotations

import base64
from dataclasses import dataclass
from http.client import HTTPConnection, HTTPException
from http.cookies import SimpleCookie
import json
import os
from pathlib import Path
import re
import secrets
from threading import Lock
import time
from urllib.parse import parse_qs, urlsplit
from wsgiref.simple_server import make_server

_UI = Path(__file__).resolve().parents[1] / "web" / "r0-standalone"
_ALLOWED = {"/": ("index.html", "text/html; charset=utf-8"),
            "/styles.css": ("styles.css", "text/css; charset=utf-8"),
            "/app.js": ("app.js", "text/javascript; charset=utf-8")}
_ERRORS = {200: "OK", 400: "Bad Request", 401: "Unauthorized",
           403: "Forbidden", 404: "Not Found", 503: "Service Unavailable"}
_RUN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_COOKIE_PATTERN = re.compile(r"^[A-Za-z0-9_]{3,45}$")


def _internal_call(service: str, method: str, path: str,
                   body: bytes | None = None, bearer: str | None = None):
    """Only two fixed in-network service names and fixed route shapes."""
    if service not in ("auth", "api"):
        raise ValueError("Internal endpoint not approved")
    port = 8081 if service == "auth" else 8080
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if bearer:
        headers["Authorization"] = "Bearer " + bearer
    conn = HTTPConnection(service, port, timeout=5)
    try:
        conn.request(method, path, body=body, headers=headers)
        response = conn.getresponse()
        raw = response.read(8193)
        if len(raw) > 8192:
            raise ValueError("Internal response size exceeded")
        result = json.loads(raw)
        if not isinstance(result, dict):
            raise ValueError("Unexpected internal response type")
        return response.status, result
    except (OSError, TimeoutError, HTTPException, ValueError, UnicodeError):
        return 503, {"code": "DEPENDENCY_UNAVAILABLE"}
    finally:
        conn.close()


@dataclass
class _Session:
    token: str
    email: str
    tenant_id: str
    expires_monotonic: float


class StandaloneBrowserGateway:
    def __init__(self, *, origin: str, cookie_name: str, workspaces: list[dict]):
        parsed = urlsplit(origin)
        if (parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or
                parsed.port not in (18080, 18081) or
                parsed.path or parsed.query or parsed.fragment):
            raise ValueError("Gateway test origin must be local loopback only")
        if not _COOKIE_PATTERN.fullmatch(cookie_name):
            raise ValueError("Invalid test-only cookie name")
        if (not isinstance(workspaces, list) or not 1 <= len(workspaces) <= 10 or
                any(not isinstance(w, dict) or set(w) != {"id", "label", "type"}
                    or not isinstance(w["id"], str) or
                    not re.fullmatch(r"[0-9a-f-]{36}", w["id"]) or
                    not isinstance(w["label"], str) or
                    not 1 <= len(w["label"]) <= 80 or
                    w["type"] not in ("personal", "organization")
                    for w in workspaces)):
            raise ValueError("Invalid public *synthetic* workspace registry")
        self.origin = origin
        self.host = parsed.netloc
        self.cookie_name = cookie_name
        self.workspaces = workspaces
        self.sessions: dict[str, _Session] = {}
        self.lock = Lock()

    def _cookie(self, sid: str, *, clear: bool = False):
        # No Secure flag in this isolated HTTP localhost-only browser test.
        # DO NOT expose behind public HTTPS or reuse as production cookies.
        return (f"{self.cookie_name}={sid}; Path=/; HttpOnly; "
                f"SameSite=Strict; Max-Age={0 if clear else 900}")

    def _sid(self, environ) -> str | None:
        try:
            raw = environ.get("HTTP_COOKIE", "")
            if not isinstance(raw, str) or len(raw) > 1024:
                return None
            cookies = SimpleCookie()
            cookies.load(raw)
            value = cookies[self.cookie_name].value
            return value if re.fullmatch(r"[A-Za-z0-9_-]{32,64}", value) else None
        except (KeyError, ValueError):
            return None

    def _lookup(self, environ):
        sid = self._sid(environ)
        if sid is None:
            return None, None
        with self.lock:
            session = self.sessions.get(sid)
            if session is None:
                return None, None
            if session.expires_monotonic <= time.monotonic():
                self.sessions.pop(sid, None)
                return None, None
        return sid, session

    def _answer(self, start_response, code, payload, extra=()):
        raw = json.dumps(payload, ensure_ascii=False,
                         separators=(",", ":")).encode("utf-8")
        headers = [("Content-Type", "application/json; charset=utf-8"),
                   ("Content-Length", str(len(raw))),
                   ("Cache-Control", "no-store"),
                   ("X-Content-Type-Options", "nosniff"),
                   ("X-Frame-Options", "DENY"),
                   ("Referrer-Policy", "no-referrer"),
                   ("Content-Security-Policy",
                    "default-src 'none'; frame-ancestors 'none'")]
        headers.extend(extra)
        start_response(f"{code} {_ERRORS[code]}", headers)
        return [raw]

    def _check_post(self, environ):
        return (environ.get("HTTP_ORIGIN") == self.origin and
                environ.get("CONTENT_TYPE") == "application/json")

    def __call__(self, environ, start_response):
        method = environ.get("REQUEST_METHOD")
        path = environ.get("PATH_INFO")
        if environ.get("HTTP_HOST") != self.host:
            return self._answer(start_response, 403, {"code": "FORBIDDEN"})
        if method == "GET" and path in _ALLOWED:
            name, mime = _ALLOWED[path]
            body = (_UI / name).read_bytes()
            start_response("200 OK", [
                ("Content-Type", mime),
                ("Content-Length", str(len(body))),
                ("Cache-Control", "no-store"),
                ("X-Content-Type-Options", "nosniff"),
                ("X-Frame-Options", "DENY"),
                ("Referrer-Policy", "no-referrer"),
                ("Content-Security-Policy",
                 "default-src 'self'; script-src 'self'; style-src 'self'; "
                 "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; "
                 "base-uri 'none'; form-action 'self'"),
            ])
            return [body]
        if method == "GET" and path == "/api/workspaces":
            return self._answer(start_response, 200,
                                {"workspaces": self.workspaces})
        if method == "POST" and path in ("/api/login", "/api/logout"):
            if not self._check_post(environ):
                return self._answer(start_response, 403,
                                    {"code": "FORBIDDEN"})
        if method == "POST" and path == "/api/login":
            length = environ.get("CONTENT_LENGTH", "")
            if not isinstance(length, str) or not length.isdigit() or not (
                    1 <= int(length) <= 2048):
                return self._answer(start_response, 400,
                                    {"code": "INVALID_REQUEST"})
            data = environ["wsgi.input"].read(int(length))
            try:
                request_data = json.loads(data)
            except (UnicodeError, ValueError):
                return self._answer(start_response, 400,
                                    {"code": "INVALID_REQUEST"})
            if (not isinstance(request_data, dict) or
                    set(request_data) != {"email", "password", "tenant_id"} or
                    not isinstance(request_data["email"], str) or
                    not isinstance(request_data["password"], str) or
                    not isinstance(request_data["tenant_id"], str) or
                    request_data["tenant_id"] not in
                    {w["id"] for w in self.workspaces}):
                return self._answer(start_response, 400,
                                    {"code": "INVALID_REQUEST"})
            status, response = _internal_call("auth", "POST",
                                              "/standalone/auth/login", data)
            if status != 200:
                code = 503 if status == 503 else 401
                return self._answer(start_response, code, {
                    "code": "DEPENDENCY_UNAVAILABLE" if code == 503
                    else "UNAUTHENTICATED",
                })
            token = response.get("access_token")
            if (not isinstance(token, str) or not 200 <= len(token) <= 6000 or
                    token.count(".") != 2 or
                    response.get("expires_in") != 900 or
                    response.get("tenant_id") != request_data["tenant_id"]):
                return self._answer(start_response, 503,
                                    {"code": "DEPENDENCY_UNAVAILABLE"})
            sid = secrets.token_urlsafe(32)
            with self.lock:
                now = time.monotonic()
                for key, entry in list(self.sessions.items()):
                    if entry.expires_monotonic <= now:
                        self.sessions.pop(key, None)
                if len(self.sessions) >= 64:
                    return self._answer(start_response, 503,
                                        {"code": "DEPENDENCY_UNAVAILABLE"})
                self.sessions[sid] = _Session(token=token,
                    email=request_data["email"],
                    tenant_id=request_data["tenant_id"],
                    expires_monotonic=now + 900)
            return self._answer(start_response, 200, {
                "ok": True, "tenant_id": request_data["tenant_id"],
                "email": request_data["email"],
            }, [("Set-Cookie", self._cookie(sid))])

        if method == "POST" and path == "/api/logout":
            sid, session = self._lookup(environ)
            if session is None:
                return self._answer(start_response, 401,
                                    {"code": "UNAUTHENTICATED"})
            code, result = _internal_call("auth", "POST",
                      "/standalone/auth/logout", b"", session.token)
            if code != 200 or result.get("ok") is not True:
                # Do not claim logout succeeded if the signed DB session was
                # not revoked. Retry with the existing browser cookie.
                return self._answer(start_response, 503,
                                    {"code": "DEPENDENCY_UNAVAILABLE"})
            with self.lock:
                self.sessions.pop(sid, None)
            return self._answer(start_response, 200, {"ok": True},
                [("Set-Cookie", self._cookie("", clear=True))])

        if method == "GET" and path in ("/api/session", "/api/run"):
            sid, session = self._lookup(environ)
            if session is None:
                return self._answer(start_response, 401,
                                    {"code": "UNAUTHENTICATED"})
            run_id = "fixture-run"
            if path == "/api/run":
                query = parse_qs(environ.get("QUERY_STRING", ""),
                                 keep_blank_values=True)
                if (set(query) != {"run_id"} or len(query["run_id"]) != 1 or
                        not _RUN_PATTERN.fullmatch(query["run_id"][0])):
                    return self._answer(start_response, 400,
                                        {"code": "INVALID_REQUEST"})
                run_id = query["run_id"][0]
            status, payload = _internal_call("api", "GET",
                            "/v1/runs/" + run_id, bearer=session.token)
            if status == 401:
                with self.lock:
                    self.sessions.pop(sid, None)
                return self._answer(start_response, 401, {
                    "code": "UNAUTHENTICATED",
                }, [("Set-Cookie", self._cookie("", clear=True))])
            if status == 503:
                return self._answer(start_response, 503,
                                    {"code": "DEPENDENCY_UNAVAILABLE"})
            if path == "/api/session":
                # 404 is permitted for a tenant admin with no MatterACL,
                # but API 401 denotes a revoked/expired authenticated session.
                return self._answer(start_response, 200, {
                    "authenticated": True, "tenant_id": session.tenant_id,
                    "email": session.email,
                })
            if status == 404:
                return self._answer(start_response, 404,
                                    {"code": "NOT_FOUND_OR_NOT_AUTHORIZED"})
            if status == 200:
                return self._answer(start_response, 200, payload)
            return self._answer(start_response, 503,
                                {"code": "DEPENDENCY_UNAVAILABLE"})
        return self._answer(start_response, 404, {"code": "NOT_FOUND"})


def create_browser_app():
    if os.environ.get("AI_LAW_NONPROD_R39") != "isolated-browser-fixture-only":
        raise RuntimeError("R39 browser gateway requires nonproduction flag")
    origin = os.environ["AI_LAW_R39_BROWSER_ORIGIN"]
    cookie = os.environ["AI_LAW_R39_COOKIE_NAME"]
    workspaces = json.loads(base64.b64decode(
         os.environ["AI_LAW_R39_WORKSPACES_B64"], validate=True))
    return StandaloneBrowserGateway(origin=origin, cookie_name=cookie,
                                    workspaces=workspaces)


if __name__ == "__main__":
    with make_server("0.0.0.0", 8082, create_browser_app()) as server:
        server.serve_forever()
