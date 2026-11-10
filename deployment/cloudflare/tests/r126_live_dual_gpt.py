#!/usr/bin/env python3
"""R126 isolated QA live multi-user/multi-tenant E2E gate.

Requires private, approved credentials for *both* synthetic R125 QA accounts.
No credential, raw response, cookie, UUID, user data or legal text is logged.
Runs normal HTTP password login; NEVER injects sessions or alters D1 directly.
Exit 0=PASS, 1=FAIL, 2=BLOCKED. No retries or password guessing.
"""
import json
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from r124_live_qa_auth_gpt import (
    GateError, LiveQA, session_cookie, expect_status, json_reply
)

TITLE_A_ORG = "R125 QA GPT Org A synthetic"
TITLE_A_PERSONAL = "R125 QA GPT Personal A synthetic"
TITLE_B_ORG = "R125 QA GPT Org B synthetic"
SAMPLE = "Điều 1. Văn bản hợp đồng thử nghiệm giả lập, giao hàng ngày 15 tháng 9."
LOGIN_CREDENTIALS = ("MIHY_QA_R124_EMAIL", "MIHY_QA_R124_PASSWORD",
                     "MIHY_QA_R126_B_EMAIL", "MIHY_QA_R126_B_PASSWORD")


def demand(label, predicate):
    if not predicate:
        raise GateError("FAIL", label)


def get_session(client, cookie, checks, label):
    status, _, raw = client.call("/api/qa/session", cookie=cookie)
    expect_status(label + "_session", status, 200, checks)
    reply = json_reply(raw)
    demand(label + "_tenant_missing", isinstance(reply.get("tenant_id"), str))
    return reply


def workspaces(client, cookie, checks, label):
    code, _, raw = client.call("/api/qa/workspaces", cookie=cookie)
    expect_status(label + "_workspaces", code, 200, checks)
    reply = json_reply(raw)
    entries = reply.get("workspaces")
    demand(label + "_workspaces_invalid", isinstance(entries, list))
    return entries


def matters(client, cookie, checks, label):
    code, _, raw = client.call("/api/qa/matters", cookie=cookie)
    expect_status(label + "_matters", code, 200, checks)
    reply = json_reply(raw)
    entries = reply.get("matters")
    demand(label + "_matters_invalid", isinstance(entries, list))
    return entries


def own_matter(entries, mine, other):
    titles = {str(x.get("title", "")) for x in entries if isinstance(x, dict)}
    demand("own_sample_matter_missing", mine in titles)
    demand("other_private_matter_exposed", other not in titles)
    item = next(x for x in entries if x.get("title") == mine)
    mid = item.get("id")
    demand("sample_matter_id_invalid", isinstance(mid, str))
    uuid.UUID(mid)
    return mid


def legal(client, cookie, matter_id, uc, checks, label, expected):
    payload = {"uc":uc,"matter_id":matter_id,"source_text":SAMPLE,
               "source_text_2":"","question":"giao hàng ngày 15 tháng 9",
               "language":"vi","synthetic_consent":True}
    code, _, response = client.call("/api/qa/legal/run",method="POST",
                                   cookie=cookie,body=payload)
    expect_status(label,code,expected,checks)
    demand("source_echo_in_denied_legal_api",
           expected != 404 or (SAMPLE not in response and
                               '"source_anchors"' not in response and
                               '"answer"' not in response))
    if expected == 200:
        data=json_reply(response)
        demand("UC10_must_use_local_no_AI_mode",data.get("mode")=="local_example_only")
    return code


def login(client, email, password, checks, label):
    status, headers, _ = client.call("/api/qa/login",method="POST",
                                     body={"email":email,"password":password})
    if status==401:
        raise GateError("BLOCKED",label+"_CREDENTIALS_NOT_ACCEPTED")
    expect_status(label+"_login",status,200,checks)
    sid = session_cookie(headers)
    checks.append(label+"_secure_cookie")
    return sid


def execute(qa, credentials):
    checks=[]
    sid_a=None
    sid_b=None
    cleanup_errors=[]
    pending_error=None
    try:
        sid_a=login(qa,credentials[0],credentials[1],checks,"A")
        sid_b=login(qa,credentials[2],credentials[3],checks,"B")
        demand("must_have_separate_sessions",sid_a != sid_b)
        checks.append("A_B_separate_sessions")

        a=get_session(qa,sid_a,checks,"A")
        b=get_session(qa,sid_b,checks,"B")
        wa=workspaces(qa,sid_a,checks,"A")
        wb=workspaces(qa,sid_b,checks,"B")
        demand("A_expected_two_tenants",len({w.get("tenant_id") for w in wa})==2)
        demand("B_expected_one_tenant",len({w.get("tenant_id") for w in wb})==1)
        demand("B_expected_admin_role",b.get("role")=="tenant_admin")
        shared=wb[0]["tenant_id"]
        personal=next((w["tenant_id"] for w in wa if w.get("tenant_id")!=shared),None)
        demand("A_B_shared_tenant_missing",shared in [w["tenant_id"] for w in wa])
        demand("A_personal_tenant_missing",isinstance(personal,str))
        checks.append("two_tenants_scoped_to_A_and_one_to_B")

        if a["tenant_id"] != shared:
            status,headers,_=qa.call("/api/qa/switch-workspace",method="POST",
                  cookie=sid_a,body={"tenant_id":shared})
            expect_status("A_switch_to_org",status,200,checks)
            old=sid_a
            sid_a=session_cookie(headers)
            demand("org_switch_not_rotated",sid_a!=old)
            code,_,_=qa.call("/api/qa/session",cookie=old)
            expect_status("org_old_cookie_denied",code,401,checks)

        a_org=matters(qa,sid_a,checks,"A_org")
        b_org=matters(qa,sid_b,checks,"B_org")
        a_id=own_matter(a_org,TITLE_A_ORG,TITLE_B_ORG)
        b_id=own_matter(b_org,TITLE_B_ORG,TITLE_A_ORG)
        checks.append("cross_user_org_matter_list_isolated")

        legal(qa,sid_a,b_id,"UC04",checks,"A_denied_B_private",404)
        legal(qa,sid_b,a_id,"UC04",checks,"B_admin_denied_A_private",404)
        legal(qa,sid_a,a_id,"UC10",checks,"A_authorized_local_UC10",200)
        legal(qa,sid_b,b_id,"UC10",checks,"B_authorized_local_UC10",200)

        # Unauthorized B tenant switch must not rotate or change current SID.
        code,headers,_=qa.call("/api/qa/switch-workspace",method="POST",
                                cookie=sid_b,body={"tenant_id":personal})
        expect_status("B_denied_A_personal_tenant",code,404,checks)
        demand("B_denied_switch_must_not_rotate",not any(
            k.lower()=="set-cookie" for k in headers))
        still_b=get_session(qa,sid_b,checks,"B_still_org")
        demand("B_tenant_changed_after_denial",still_b["tenant_id"]==shared)

        old_a=sid_a
        code,headers,_=qa.call("/api/qa/switch-workspace",method="POST",
                                cookie=sid_a,body={"tenant_id":personal})
        expect_status("A_switch_to_personal",code,200,checks)
        sid_a=session_cookie(headers)
        demand("A_switch_cookie_not_rotated",sid_a!=old_a)
        checks.append("A_cookie_rotated")
        code,_,_=qa.call("/api/qa/session",cookie=old_a)
        expect_status("A_old_cookie_rejected",code,401,checks)
        in_personal=get_session(qa,sid_a,checks,"A_personal")
        demand("A_switch_wrong_target",in_personal["tenant_id"]==personal)
        personal_m=matters(qa,sid_a,checks,"A_personal")
        own_matter(personal_m,TITLE_A_PERSONAL,TITLE_A_ORG)
        checks.append("personal_tenant_matter_isolation")
        legal(qa,sid_a,a_id,"UC04",checks,"A_old_org_matter_denied_in_personal",404)
        return {"status":"PASS","checks":checks,
                "authenticated":True,"secrets_printed":False}
    except GateError as error:
        pending_error=error
        raise
    finally:
        for name,sid in [("A",sid_a),("B",sid_b)]:
            if sid:
                try:
                    code,_,_=qa.call("/api/qa/logout",method="POST",
                                      cookie=sid,body={})
                    if code!=200:
                        cleanup_errors.append(name+"_LOGOUT_FAILED")
                    else:
                        checks.append(name+"_logout")
                        status,_,_=qa.call("/api/qa/session",cookie=sid)
                        if status!=401: cleanup_errors.append(name+"_SESSION_STILL_ACTIVE")
                except GateError:
                    cleanup_errors.append(name+"_LOGOUT_UNCONFIRMED")
        if cleanup_errors:
            # Never mark PASS if logout/session cleanup failed.
            raise GateError("BLOCKED",";".join(cleanup_errors)) from pending_error


def main():
    values=tuple(os.getenv(k,"").strip() for k in LOGIN_CREDENTIALS)
    if not all(values):
        print('R126_RESULT '+json.dumps({"status":"BLOCKED",
              "reason":"PRIVATE_QA_CREDENTIALS_NOT_CONNECTED",
              "authenticated":False,"checks_passed":0}))
        return 2
    try:
        result=execute(LiveQA(),values)
        output={"status":result["status"],
                "checks_passed":len(result["checks"]),"authenticated":True}
        code=0
    except GateError as err:
        output={"status":err.category,"reason":err.reason,
                "authenticated_pass_not_proven":True}
        code=1 if err.category=="FAIL" else 2
    except (ValueError, KeyError, TypeError):
        output={"status":"FAIL","reason":"UNEXPECTED_QA_TEST_DATA_SHAPE"}
        code=1
    print("R126_RESULT "+json.dumps(output,separators=(",",":")))
    return code


if __name__=="__main__":
    sys.exit(main())
