#!/usr/bin/env python3
"""R65 authorised QA-only live role/browser checks.

Run on an Owner-trusted operator machine after the R62 private verifier activation.
The R40 private bundle must remain outside GitHub checkout with mode 0600.
The script does not log email, password, token, cookie, private record or HTTP body.
CI may run --preflight with synthetic private test data, never live credentials.
"""
import argparse
import json
import os
from pathlib import Path
import stat
import sys

ROOT = Path(__file__).resolve().parents[3]
INVENTORY = ROOT / "tests/acceptance/R40_STANDALONE_QA_INVENTORY.json"
QA_URL = "https://ai-law-web-qa.iaict-platform.workers.dev"
ACTIVE = ("QA-01", "QA-02", "QA-03", "QA-05", "QA-06", "QA-08", "QA-09")
DISABLED = "QA-07"
EXPECTED = (*ACTIVE, DISABLED)
ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
OTHER_ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


class QAGateError(Exception):
    pass


def read_private_bundle(filename):
    path = Path(filename).expanduser().absolute()
    resolved = path.resolve(strict=False)
    if (path.is_symlink() or path == ROOT or ROOT in path.parents
            or resolved == ROOT or ROOT in resolved.parents):
        raise QAGateError("PRIVATE_PATH_REQUIRED")
    try:
        info = path.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
            raise QAGateError("PRIVATE_FILE_MODE_0600_REQUIRED")
        bundle = json.loads(path.read_text(encoding="utf8"))
    except (OSError, ValueError, UnicodeError) as exc:
        raise QAGateError("PRIVATE_FILE_INVALID") from exc

    inventory = json.loads(INVENTORY.read_text(encoding="utf8"))
    actors = {row["id"]: row for row in inventory["accounts"]}
    if bundle.get("schema_version") != 1 or not isinstance(bundle.get("accounts"), dict):
        raise QAGateError("BUNDLE_SCHEMA_MISMATCH")
    credentials = bundle["accounts"]
    for actor_id in EXPECTED:
        actor = actors.get(actor_id)
        entry = credentials.get(actor_id)
        if not actor or not isinstance(entry, dict):
            raise QAGateError("ACTOR_NOT_FOUND")
        if actor["installation"] != "primary" or entry.get("email") != actor["email"]:
            raise QAGateError("ACTOR_BINDING_MISMATCH")
        secret = entry.get("password")
        if not isinstance(secret, str) or not 24 <= len(secret) <= 256:
            raise QAGateError("ACTOR_PASSWORD_INVALID")
        if actor["status"] != ("disabled" if actor_id == DISABLED else "active"):
            raise QAGateError("ACTOR_STATUS_MISMATCH")
    return actors, credentials


def api_post(context, path, payload):
    return context.request.post(
        QA_URL + path, headers={
            "Origin": QA_URL, "Sec-Fetch-Site": "same-origin",
            "Content-Type": "application/json",
        }, data=json.dumps(payload),
    )


def get_sid(context):
    values = [x["value"] for x in context.cookies(QA_URL)
              if x["name"] == "al_qa_session"]
    return values[0] if len(values) == 1 else None


def assert_mobile_nav(page, width):
    nav = page.locator(".mobile-bottom-nav")
    if width <= 820:
        assert nav.is_visible(), "MOBILE_NAV_NOT_VISIBLE"
        assert page.locator(".mobile-bottom-nav .rail-item").count() == 5, "MOBILE_TAB_COUNT"
        box = nav.bounding_box()
        assert box and abs(box["x"]) <= 2 and abs(box["width"] - width) <= 2, "MOBILE_NAV_WIDTH"
        assert abs(box["y"] + box["height"] - 850) <= 2, "MOBILE_NAV_NOT_FIXED"
    else:
        assert nav.is_hidden(), "MOBILE_NAV_VISIBLE_ON_DESKTOP"
        assert page.locator(".sidebar").is_visible(), "DESKTOP_SIDEBAR_MISSING"
    assert page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 3, "HORIZONTAL_OVERFLOW"


def assert_workspaces(actual, actor):
    expected = {row["tenant_id"]: row["role_key"] for row in actor["memberships"]
                if row["status"] == "active"}
    got = {row["tenant_id"]: row["role"] for row in actual["workspaces"]}
    assert got == expected, "MEMBERSHIP_ISOLATION"
    assert actual["current_tenant_id"] in expected, "SESSION_TENANT_NOT_ACTIVE"
    return expected


def verify_account(playwright, browser, actor_id, actor, private, width):
    context = browser.new_context(viewport={"width": width, "height": 850})
    try:
        page = context.new_page()
        assert context.request.get(QA_URL + "/api/qa/session").status == 401, "PRELOGIN_SESSION"
        response = page.goto(QA_URL + "/login", wait_until="domcontentloaded")
        assert response and response.status == 200, "LOGIN_PAGE"
        page.locator("#email").fill(private["email"])
        page.locator("#password").fill(private["password"])
        with page.expect_response(lambda response: response.url.endswith("/api/qa/login")
                                  and response.request.method == "POST", timeout=20000) as login_wait:
            page.locator("#submit").click()
        login_status = login_wait.value.status
        if actor_id == DISABLED:
            assert login_status == 401, "DISABLED_ACCOUNT_MUST_DENY_401"
            page.locator("#form-error").wait_for(state="visible", timeout=15000)
            assert context.request.get(QA_URL + "/api/qa/session").status == 401, "DISABLED_LOGIN"
            assert get_sid(context) is None, "DISABLED_COOKIE"
            print("PASS real QA actor disabled login DENY", actor_id, flush=True)
            return
        assert login_status == 200, "ACTIVE_ACCOUNT_LOGIN_STATUS"
        page.wait_for_url("**/app", timeout=20000)
        page.locator("#profile-role").wait_for(state="attached")
        assert_mobile_nav(page, width)
        session = context.request.get(QA_URL + "/api/qa/session")
        assert session.status == 200, "AUTH_SESSION"
        data = session.json()
        assert data["email"] == actor["email"], "IDENTITY_BOUNDARY"
        memberships_response = context.request.get(QA_URL + "/api/qa/workspaces")
        assert memberships_response.status == 200, "WORKSPACES_ENDPOINT"
        memberships = assert_workspaces(memberships_response.json(), actor)
        assert data["tenant_id"] in memberships, "CROSS_TENANT_SESSION"
        assert data["role"] == memberships[data["tenant_id"]], "ROLE_MISMATCH"
        matters = context.request.get(QA_URL + "/api/qa/matters")
        assert matters.status == 200, "MATTER_ENDPOINT"
        assert isinstance(matters.json().get("matters"), list), "MATTER_SCHEMA"

        old_sid = get_sid(context)
        assert old_sid, "MISSING_HTTPONLY_SESSION"
        # Each blocked tenant must leave both SID and current workspace intact.
        deny_tenant = OTHER_ORG if actor_id != "QA-09" else ORG
        assert deny_tenant not in memberships, "EXPECTED_FOREIGN_TENANT"
        denied = api_post(context, "/api/qa/switch-workspace", {"tenant_id": deny_tenant})
        assert denied.status == 404, "UNAUTHORIZED_TENANT_ALLOWED"
        assert get_sid(context) == old_sid, "DENIED_SWITCH_ROTATED_SID"
        if actor_id == "QA-06":
            # Existing revoked organization membership must not become an active tenant.
            revoked_targets = [m["tenant_id"] for m in actor["memberships"]
                               if m["status"] == "revoked"]
            assert len(revoked_targets) == 1, "REVOKED_FIXTURE_REQUIRED"
            rejected = api_post(context, "/api/qa/switch-workspace",
                                {"tenant_id": revoked_targets[0]})
            assert rejected.status == 404, "REVOKED_MEMBERSHIP_ALLOWED"
            assert get_sid(context) == old_sid, "REVOKED_SWITCH_ROTATED_SID"
        # QA-02 has two active memberships; verify atomic session rotation.
        if actor_id == "QA-02":
            targets = [tenant for tenant in memberships if tenant != data["tenant_id"]]
            assert len(targets) == 1, "EXPECTED_DUAL_MEMBERSHIP"
            changed = api_post(context, "/api/qa/switch-workspace", {"tenant_id": targets[0]})
            assert changed.status == 200, "AUTHORIZED_TENANT_SWITCH"
            rotated = get_sid(context)
            assert rotated and rotated != old_sid, "SID_NOT_ROTATED"
            assert context.request.get(QA_URL + "/api/qa/session").json()["tenant_id"] == targets[0], "TENANT_NOT_SWITCHED"
            # Independent request context replays *only* old cookie; never print it.
            old_request = playwright.request.new_context(
                extra_http_headers={"Cookie": "al_qa_session=" + old_sid})
            try:
                assert old_request.get(QA_URL + "/api/qa/session").status == 401, "OLD_SID_REUSABLE"
            finally:
                old_request.dispose()
        logout = api_post(context, "/api/qa/logout", {})
        assert logout.status == 200, "LOGOUT_FAILED"
        assert context.request.get(QA_URL + "/api/qa/session").status == 401, "LOGOUT_NOT_REVOKED"
        print("PASS real QA actor login/session/role/tenant/logout", actor_id, width, flush=True)
    finally:
        context.close()


def run(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", required=True, help="Owner-private R40 bundle outside repo, chmod 600")
    parser.add_argument("--qa-only", action="store_true", help="Acknowledge isolated nonproduction QA")
    parser.add_argument("--preflight", action="store_true",
                        help="Validate bundle and account bindings without network or login")
    args = parser.parse_args(argv)
    if not args.qa_only:
        raise QAGateError("QA_ONLY_ACK_REQUIRED")
    actors, credentials = read_private_bundle(args.bundle)
    if args.preflight:
        print("PASS R65 private QA bundle shape/actors/mode; NO LIVE TEST", flush=True)
        return 0
    if os.environ.get("CI"):
        raise QAGateError("LIVE_QA_ROLE_TEST_FORBIDDEN_IN_CI")
    # R40 synthetic actors only, no Owner personal account and no QA04 R44 password.
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        try:
            for aid in ACTIVE:
                width = 390 if aid != "QA-03" else 1440
                verify_account(pw, browser, aid, actors[aid], credentials[aid], width)
            verify_account(pw, browser, DISABLED, actors[DISABLED], credentials[DISABLED], 390)
        finally:
            browser.close()
    print("PASS R65 real Cloudflare QA R40 role matrix; MatterACL positive and 30m expiry require separate evidence", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(run())
    except (QAGateError, AssertionError) as exc:
        # Error codes only; never leak private credentials/HTTP response to console.
        print("R65 BLOCKED_OR_FAIL " + str(exc).splitlines()[0][:100], file=sys.stderr)
        raise SystemExit(1)
    except Exception:
        print("R65 BLOCKED_OR_FAIL UNEXPECTED_ERROR (no secrets logged)", file=sys.stderr)
        raise SystemExit(1)
