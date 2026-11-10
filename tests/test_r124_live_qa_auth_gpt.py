"""R124 offline contract for the *credential-gated* live QA login runner.

All credentials/cookies in this unit file are synthetic. No network calls.
"""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "deployment/cloudflare/tests/r124_live_qa_auth_gpt.py"
SPEC = importlib.util.spec_from_file_location("r124_live_qa_auth_gpt", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

OLD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
NEW = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
TA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
TB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
SAFE_COOKIE = "; Path=/; HttpOnly; Secure; SameSite=Strict"


class Stub:
    def __init__(self, *, dual=True, source_leak=False, bad_cookie=False):
        self.dual = dual
        self.source_leak = source_leak
        self.bad_cookie = bad_cookie
        self.calls = []
        self.logged_out = False

    def call(self, path, method="GET", cookie=None, body=None):
        self.calls.append((path, method, cookie))
        if path == "/api/qa/login":
            value = "al_qa_session=" + OLD + SAFE_COOKIE
            if self.bad_cookie:
                value = "al_qa_session=" + OLD + "; Path=/; HttpOnly"
            return 200, {"Set-Cookie": value}, '{"ok":true}'
        if path == "/api/qa/workspaces":
            all_ = [{"tenant_id": TA, "role":"lawyer"}]
            if self.dual:
                all_.append({"tenant_id":TB,"role":"lawyer"})
            return 200, {}, json.dumps({"current_tenant_id":TA,"workspaces":all_})
        if path == "/api/qa/matters":
            return 200, {}, '{"data":[]}'
        if path == "/api/qa/legal/run":
            return 404, {}, '{"error":"not found"}' + (
                MODULE.SAMPLE if self.source_leak else "")
        if path == "/api/qa/switch-workspace":
            return 200, {"Set-Cookie":"al_qa_session="+NEW+SAFE_COOKIE}, '{"ok":true}'
        if path == "/api/qa/session":
            if cookie == OLD and any(c[0] == "/api/qa/switch-workspace" for c in self.calls):
                return 401, {}, '{"error":"invalid"}'
            return 200, {}, json.dumps({"tenant_id":TB if cookie == NEW else TA})
        if path == "/api/qa/logout":
            self.logged_out = True
            return 200, {}, '{"ok":true}'
        raise AssertionError("Unknown mocked route: " + path)


class R124LiveGuardTests(unittest.TestCase):
    def test_no_credentials_are_blocked_without_network(self):
        output=io.StringIO()
        with patch.dict(os.environ, {"MIHY_QA_R124_EMAIL":"", "MIHY_QA_R124_PASSWORD":""}):
            with contextlib.redirect_stdout(output):
                self.assertEqual(MODULE.main(), 2)
        self.assertIn("APPROVED_PRIVATE_QA_CREDENTIALS_NOT_CONNECTED", output.getvalue())
        self.assertNotIn("Set-Cookie", output.getvalue())

    def test_authorized_double_membership_rotates_session_and_logs_out(self):
        client=Stub()
        result=MODULE.run_qa("qa-only@synthetic.invalid","SYNTHETIC-ONLY-NOT-REAL",client)
        self.assertEqual(result["status"],"PASS")
        self.assertTrue(client.logged_out)
        self.assertIn("unauthorized_matter_denied",result["checks"])
        self.assertIn("old_session_rejected",result["checks"])
        self.assertIn("logout_confirmed",result["checks"])
        self.assertEqual(
            [path for path,_,_ in client.calls].count("/api/qa/login"),1)

    def test_single_workspace_stays_partial_and_logs_out(self):
        client=Stub(dual=False)
        result=MODULE.run_qa("qa-only@synthetic.invalid","SYNTHETIC-ONLY",client)
        self.assertEqual(result["status"],"PARTIAL")
        self.assertTrue(client.logged_out)

    def test_denial_source_leak_fails_closed_and_logs_out(self):
        client=Stub(source_leak=True)
        with self.assertRaises(MODULE.GateError) as ex:
            MODULE.run_qa("qa-only@synthetic.invalid","SYNTHETIC-ONLY",client)
        self.assertEqual(ex.exception.reason,"DENIAL_EXPOSED_SOURCE")
        self.assertTrue(client.logged_out)

    def test_insecure_cookie_fails_closed_without_calling_legal(self):
        client=Stub(bad_cookie=True)
        with self.assertRaises(MODULE.GateError) as ex:
            MODULE.run_qa("qa-only@synthetic.invalid","SYNTHETIC-ONLY",client)
        self.assertEqual(ex.exception.reason,"INSECURE_SESSION_COOKIE_ATTRIBUTES")
        self.assertFalse(any(c[0]=="/api/qa/legal/run" for c in client.calls))


if __name__=="__main__":
    unittest.main()
