"""R39 browser-to-backend gateway regression.

Unit-only, with mocked internal HTTP transport. Separate standalone-browser
CI runs full real Chromium -> gateway -> Argon2id auth -> SQL -> RLS API.
"""
from __future__ import annotations

from io import BytesIO
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from r0_core.standalone_browser_gateway import StandaloneBrowserGateway

ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
PERSONAL = "ffffffff-ffff-4fff-8fff-ffffffffffff"
ORIGIN = "http://127.0.0.1:18080"
JWT = "a"*90 + "." + "b"*90 + "." + "c"*90


class BrowserGatewayTests(unittest.TestCase):
    def setUp(self):
        self.app = StandaloneBrowserGateway(
            origin=ORIGIN, cookie_name="al_r39_iaict",
            workspaces=[
                {"id":ORG,"label":"Organization A","type":"organization"},
                {"id":PERSONAL,"label":"Individual","type":"personal"},
            ],
        )
        self.data = json.dumps({
            "email":"someone@example.invalid",
            "password":"nonproduction-password",
            "tenant_id":ORG,
        }).encode()

    def invoke(self, *, path="/", method="GET", origin=ORIGIN,
               host="127.0.0.1:18080", cookie="", body=None,
               content_type="application/json", query=""):
        responses=[]
        headers=[]
        data=b"" if body is None else body
        environ={
            "PATH_INFO":path, "QUERY_STRING":query,
            "REQUEST_METHOD":method, "HTTP_HOST":host,
            "HTTP_ORIGIN":origin, "HTTP_COOKIE":cookie,
            "CONTENT_TYPE":content_type, "CONTENT_LENGTH":str(len(data)),
            "wsgi.input":BytesIO(data),
        }
        def start(status, items):
            responses.append(int(status[:3]))
            headers.extend(items)
        raw=b"".join(self.app(environ,start))
        name=path if path in ("/","/styles.css","/app.js") else None
        return responses[0], (raw if name else json.loads(raw)), dict(headers)

    def _login(self):
        with patch("r0_core.standalone_browser_gateway._internal_call") as http:
            http.return_value=(200,{
                "access_token":JWT,"token_type":"Bearer",
                "expires_in":900,"tenant_id":ORG,
            })
            status,data,headers=self.invoke(path="/api/login",
                                           method="POST",body=self.data)
        self.assertEqual(status,200)
        self.assertEqual(data["email"],"someone@example.invalid")
        self.assertNotIn("access_token",data)
        self.assertNotIn(JWT,json.dumps(data))
        cookie=headers["Set-Cookie"]
        self.assertIn("HttpOnly",cookie)
        self.assertIn("SameSite=Strict",cookie)
        self.assertNotIn(JWT,cookie)
        self.assertIn("no-store",headers["Cache-Control"])
        return cookie.split(";",1)[0]

    def test_static_routes_have_strict_csp_no_external_resources(self):
        status,data,headers=self.invoke()
        self.assertEqual(status,200)
        self.assertIn(b'id="login-screen"',data)
        self.assertIn("default-src 'self'",headers["Content-Security-Policy"])
        for asset in ("/styles.css","/app.js"):
            status,content,headers=self.invoke(path=asset)
            self.assertEqual(status,200)
            self.assertTrue(content)
            self.assertNotIn(b"localStorage.setItem",content)

    def test_public_synthetic_workspaces_are_not_authorization_grants(self):
        status,data,_=self.invoke(path="/api/workspaces")
        self.assertEqual(status,200)
        self.assertEqual(len(data["workspaces"]),2)
        self.assertFalse(self.app.sessions)
        # Gateway never grants access by trusting client-selected workspace.
        with patch("r0_core.standalone_browser_gateway._internal_call",
                   return_value=(401,{"code":"UNAUTHENTICATED"})):
            status,data,_=self.invoke(path="/api/login",method="POST",body=self.data)
        self.assertEqual(status,401)
        self.assertFalse(self.app.sessions)

    def test_login_cookie_proxies_real_rsa_only_to_server_api_and_logout(self):
        cookie=self._login()
        with patch("r0_core.standalone_browser_gateway._internal_call") as http:
            http.return_value=(200,{"run_id":"fixture-run","status":"queued"})
            status,data,_=self.invoke(path="/api/run",cookie=cookie,
                                      query="run_id=fixture-run")
            self.assertEqual(status,200)
            self.assertEqual(data["run_id"],"fixture-run")
            self.assertEqual(http.call_args.kwargs["bearer"],JWT)
        with patch("r0_core.standalone_browser_gateway._internal_call") as http:
            http.return_value=(200,{"ok":True})
            status,data,headers=self.invoke(path="/api/logout",
                method="POST",body=b"{}",cookie=cookie)
            self.assertEqual((status,data),(200,{"ok":True}))
            self.assertEqual(http.call_args.kwargs["bearer"],JWT)
            self.assertIn("Max-Age=0",headers["Set-Cookie"])
        status,data,_=self.invoke(path="/api/run",cookie=cookie,
                                  query="run_id=fixture-run")
        self.assertEqual(status,401)

    def test_revocation_clear_cookie_or_outage_fail_closed(self):
        cookie=self._login()
        with patch("r0_core.standalone_browser_gateway._internal_call",
                   return_value=(401,{"code":"UNAUTHENTICATED"})):
            status,data,headers=self.invoke(path="/api/session",cookie=cookie)
        self.assertEqual(status,401)
        self.assertIn("Max-Age=0",headers["Set-Cookie"])
        with patch("r0_core.standalone_browser_gateway._internal_call",
                   return_value=(503,{"code":"DEPENDENCY_UNAVAILABLE"})):
            cookie2=self._login_without_patch_workaround()
            status,data,_=self.invoke(path="/api/run",cookie=cookie2,
                                      query="run_id=fixture-run")
        self.assertEqual(status,503)

    def _login_without_patch_workaround(self):
        # The caller may already patch transport; override only for login.
        return self._login()

    def test_csrf_and_host_spoofing_are_rejected(self):
        self._login()
        for malicious_origin in (None,"http://malicious.example.invalid", ""):
            with self.subTest(origin=malicious_origin):
                status,data,_=self.invoke(path="/api/login",method="POST",
                    origin=malicious_origin,body=self.data)
                self.assertEqual(status,403)
                self.assertEqual(data["code"],"FORBIDDEN")
        status,_,_=self.invoke(path="/api/login",method="POST",body=self.data,
                               host="evil.example.invalid")
        self.assertEqual(status,403)
        self.assertTrue(self.app.sessions) # These did not destroy sessions.

    def test_json_shape_and_run_id_are_validated_before_internal_call(self):
        for body in (b"{",b"[]",b"{}",b"x"*3000):
            status,data,_=self.invoke(path="/api/login",method="POST",body=body)
            self.assertEqual(status,400)
        cookie=self._login()
        with patch("r0_core.standalone_browser_gateway._internal_call") as http:
            for query in ("", "run_id=../../etc/passwd",
                          "run_id=fixture-run&run_id=another",
                          "tenant_id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"):
                status,data,_=self.invoke(path="/api/run",cookie=cookie,
                                          query=query)
                self.assertEqual(status,400)
            http.assert_not_called()

    def test_fixture_never_starts_for_public_production_host(self):
        for origin in ("https://example.com",
                       "http://0.0.0.0:18080","http://127.0.0.1:9999"):
            with self.subTest(origin=origin):
                with self.assertRaises(ValueError):
                    StandaloneBrowserGateway(
                        origin=origin,cookie_name="al_r39_iaict",
                        workspaces=self.app.workspaces)


if __name__=="__main__":
    unittest.main()
