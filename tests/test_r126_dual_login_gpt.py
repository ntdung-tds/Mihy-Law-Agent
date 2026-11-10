"""R126 offline mock transport verifies the secret-gated two-account QA workflow.
No network; all credentials and cookies here are synthetic fixture strings.
"""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

SCRIPT=Path(__file__).resolve().parents[1]/"deployment/cloudflare/tests/r126_live_dual_gpt.py"
SPEC=importlib.util.spec_from_file_location("r126_live_dual_gpt",SCRIPT)
R=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)

A_ORG="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
A_PERSONAL="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
MA="cccccccc-cccc-4ccc-8ccc-cccccccccccc"
MB="dddddddd-dddd-4ddd-8ddd-dddddddddddd"
MP="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
SA="11111111-1111-4111-8111-111111111111"
SB="22222222-2222-4222-8222-222222222222"
SROT="33333333-3333-4333-8333-333333333333"
SAFE="; Path=/; HttpOnly; Secure; SameSite=Strict"

class MockQA:
    def __init__(self,*,leak=False,bad_cookie=False,bad_logout=False):
        self.sessions={};self.calls=[];self.leak=leak
        self.bad_cookie=bad_cookie;self.bad_logout=bad_logout
    def call(self,path,method="GET",cookie=None,body=None):
        self.calls.append((path,method))
        if path=="/api/qa/login":
            account="A" if body["email"].startswith("a@") else "B"
            sid=SA if account=="A" else SB
            self.sessions[sid]=(account,A_ORG)
            attributes="; HttpOnly" if self.bad_cookie else SAFE
            return 200,{"Set-Cookie":"al_qa_session="+sid+attributes},'{"ok":true}'
        if path=="/api/qa/logout":
            if self.bad_logout:
                return 503,{},'{"error":"temporary"}'
            self.sessions.pop(cookie,None);return 200,{},'{"ok":true}'
        state=self.sessions.get(cookie)
        if state is None:return 401,{},'{"error":"not authorized"}'
        actor,tenant=state
        if path=="/api/qa/session":
            return 200,{},json.dumps({"tenant_id":tenant,"role":"tenant_admin" if actor=="B" else "lawyer"})
        if path=="/api/qa/workspaces":
            entries=[{"tenant_id":A_ORG,"role":"lawyer" if actor=="A" else "tenant_admin"}]
            if actor=="A":
                entries.append({"tenant_id":A_PERSONAL,"role":"lawyer"})
            return 200,{},json.dumps({"current_tenant_id":tenant,"workspaces":entries})
        if path=="/api/qa/matters":
            if actor=="A" and tenant==A_ORG: out=[{"id":MA,"title":R.TITLE_A_ORG}]
            elif actor=="A" and tenant==A_PERSONAL:out=[{"id":MP,"title":R.TITLE_A_PERSONAL}]
            else:out=[{"id":MB,"title":R.TITLE_B_ORG}]
            if self.leak and actor=="A" and tenant==A_ORG:
                out.append({"id":MB,"title":R.TITLE_B_ORG})
            return 200,{},json.dumps({"matters":out})
        if path=="/api/qa/switch-workspace":
            wanted=body["tenant_id"]
            if actor=="B" and wanted==A_PERSONAL:
                return 404,{},'{"error":"not found"}'
            if actor=="A" and wanted==A_PERSONAL:
                self.sessions.pop(cookie)
                self.sessions[SROT]=(actor,wanted)
                return 200,{"Set-Cookie":"al_qa_session="+SROT+SAFE},'{"ok":true}'
            return 404,{},'{"error":"not found"}'
        if path=="/api/qa/legal/run":
            valid=(actor=="A" and tenant==A_ORG and body["matter_id"]==MA) or (
                actor=="B" and tenant==A_ORG and body["matter_id"]==MB)
            if valid and body["uc"]=="UC10":
                return 200,{},'{"mode":"local_example_only","findings":[]}'
            return 404,{},'{"error":"not found"}'
        raise AssertionError("Unexpected QA route "+path)

class R126Offline(unittest.TestCase):
    CREDS=("a@qa.invalid","SYNTHETIC_A_NOT_REAL","b@qa.invalid","SYNTHETIC_B_NOT_REAL")
    def test_valid_dual_login_acl_and_tenant_session_lifecycle(self):
        api=MockQA()
        out=R.execute(api,self.CREDS)
        self.assertEqual(out["status"],"PASS")
        self.assertGreaterEqual(len(out["checks"]),20)
        self.assertEqual(api.sessions,{})
        self.assertEqual([c[0] for c in api.calls].count("/api/qa/login"),2)
        self.assertEqual([c[0] for c in api.calls].count("/api/qa/logout"),2)
    def test_cross_user_private_matter_leak_fails_and_logs_out(self):
        api=MockQA(leak=True)
        with self.assertRaises(R.GateError) as ex:
            R.execute(api,self.CREDS)
        self.assertEqual(ex.exception.reason,"other_private_matter_exposed")
        self.assertEqual(api.sessions,{})
    def test_insecure_cookie_stops_before_legal_api(self):
        api=MockQA(bad_cookie=True)
        with self.assertRaises(R.GateError) as ex:
            R.execute(api,self.CREDS)
        self.assertEqual(ex.exception.reason,"INSECURE_SESSION_COOKIE_ATTRIBUTES")
        self.assertNotIn("/api/qa/legal/run",[c[0] for c in api.calls])
    def test_logout_failure_never_claims_pass(self):
        api=MockQA(bad_logout=True)
        with self.assertRaises(R.GateError) as ex:
            R.execute(api,self.CREDS)
        self.assertEqual(ex.exception.category,"BLOCKED")
        self.assertIn("LOGOUT_FAILED",ex.exception.reason)
    def test_acl_leak_remains_fail_even_if_logout_also_fails(self):
        api=MockQA(leak=True,bad_logout=True)
        with self.assertRaises(R.GateError) as ex:
            R.execute(api,self.CREDS)
        self.assertEqual(ex.exception.category,"FAIL")
        self.assertIn("other_private_matter_exposed",ex.exception.reason)
        self.assertIn("LOGOUT_FAILED",ex.exception.reason)

    def test_missing_private_credentials_blocked_without_any_network(self):
        output=io.StringIO()
        clean={x:"" for x in R.LOGIN_CREDENTIALS}
        with patch.dict(os.environ,clean):
            with contextlib.redirect_stdout(output):
                self.assertEqual(R.main(),2)
        data=json.loads(output.getvalue().split("R126_RESULT ",1)[1])
        self.assertEqual(data["status"],"BLOCKED")
        self.assertEqual(data["reason"],"PRIVATE_QA_CREDENTIALS_NOT_CONNECTED")

if __name__=="__main__":
    unittest.main()
