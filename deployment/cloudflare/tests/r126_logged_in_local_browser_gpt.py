"""R126 real Chromium login/mobile UI on isolated local TLS QA Worker fixture.

Both browser accounts, passwords, matters and model responses are SYNTHETIC.
Source Worker HTML/JS, site relay, backend handlers and D1 SQL are real.
This is NOT a positive authentication test of deployed Cloudflare QA.
"""
import json
import re
import sys
from playwright.sync_api import sync_playwright

BASE = "https://127.0.0.1:18765"
PASS = "R126-fixture-local-synthetic-password-only"
EMAIL_A = "r126-a@synthetic.invalid"
EMAIL_B = "r126-b@synthetic.invalid"
PERSONAL_A = "SYNTHETIC Personal A"
ORG_A = "SYNTHETIC Organization A"
ORG_B = "SYNTHETIC Organization B private"
MP = "88888888-8888-4888-8888-888888888888"
MB = "77777777-7777-4777-8777-777777777777"
SOURCE = "Điều 1. Các bên bàn giao hàng ngày 15 tháng 9. Phí thanh toán sau khi nghiệm thu."
checks = []
stage = "startup"


def check(name, okay):
    global stage
    stage = name
    if not okay:
        raise AssertionError(name)
    checks.append(name)


def signed_cookie(context):
    stored = [c for c in context.cookies(BASE) if c["name"] == "al_qa_session"]
    check("one_secure_session_cookie", len(stored) == 1)
    c = stored[0]
    check("httponly_secure_strict_cookie",
          c["httpOnly"] is True and c["secure"] is True and c["sameSite"] == "Strict")
    check("session_value_uuid_like", bool(re.fullmatch(r"[0-9a-f-]{36}", c["value"])))
    return c["value"]


def login(page, email):
    page.goto(BASE + "/login", wait_until="domcontentloaded", timeout=20000)
    page.locator("#login-form").wait_for(state="visible", timeout=12000)
    page.locator("#email").fill(email)
    page.locator("#password").fill(PASS)
    page.locator("#submit").click()
    page.wait_for_url(re.compile(r"/app(?:[#?].*)?$"), timeout=18000)
    page.locator("#profile-role").wait_for(state="attached")
    page.wait_for_function(
        "() => document.querySelector('#profile-role')?.textContent?.includes('QA')",
        timeout=16000
    )
    check("browser_login_redirect_to_private_app", page.url.split("#")[0].endswith("/app"))


def wait_matter(page, expected, not_expected):
    page.wait_for_function(
        "(title) => [...document.querySelectorAll('#matter-list strong')].some(x => x.textContent === title)",
        arg=expected, timeout=18000
    )
    titles = page.locator("#matter-list strong").all_text_contents()
    check("current_user_can_see_own_matter", expected in titles)
    check("other_private_matter_not_rendered", not_expected not in titles)
    check("exactly_one_scoped_matter", len(titles) == 1)


def request_legal(context, matter_id, uc):
    payload = {"uc": uc, "matter_id": matter_id, "source_text": SOURCE,
               "source_text_2": "", "question": "bàn giao ngày 15 tháng 9",
               "language": "vi", "synthetic_consent": True}
    return context.request.post(
        BASE + "/api/qa/legal/run",
        data=payload,
        headers={"Origin": BASE, "Sec-Fetch-Site": "same-origin"},
        timeout=15000,
    )


def metrics(context):
    r = context.request.get(BASE + "/__r126_fixture__/metrics", timeout=10000)
    check("test_fixture_metrics_available", r.status == 200)
    return r.json()


def execute():
    global stage
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        a = b = old_api = None
        try:
            stage = "create_mobile_and_desktop"
            a = browser.new_context(
                viewport={"width": 390, "height": 844},
                is_mobile=True, has_touch=True, device_scale_factor=2,
                ignore_https_errors=True,
            )
            b = browser.new_context(
                viewport={"width": 1440, "height": 900},
                ignore_https_errors=True,
            )
            page_a = a.new_page()
            page_b = b.new_page()
            baseline = metrics(a)
            check("initial_quota_and_model_zero",
                  baseline["quota_requests"] == 0 and baseline["model_calls"] == 0)

            stage = "login_A_mobile"
            login(page_a, EMAIL_A)
            check("A_personal_default", "Cá nhân" in page_a.locator("#profile-role").inner_text())
            wait_matter(page_a, PERSONAL_A, ORG_B)
            old_sid = signed_cookie(a)
            check("A_mobile_no_horizontal_overflow",
                  page_a.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 3)

            stage = "login_B_desktop"
            login(page_b, EMAIL_B)
            check("B_tenant_admin_role", "Quản trị" in page_b.locator("#profile-role").inner_text())
            wait_matter(page_b, ORG_B, ORG_A)
            sid_b = signed_cookie(b)
            check("different_user_session_cookies", sid_b != old_sid)
            check("B_cannot_see_unauthorized_tenant_selector",
                  page_b.locator("#workspace-switch-desktop-select").count() == 0)

            stage = "deny_cross_user"
            denied_a = request_legal(a, MP, "UC04")
            denied_b = request_legal(b, MB, "UC04")
            check("A_private_B_matter_denied", denied_a.status == 404)
            check("B_admin_private_A_matter_denied", denied_b.status == 404)
            check("no_denied_source_reflection",
                  SOURCE not in denied_a.text() and SOURCE not in denied_b.text())
            after_denial = metrics(a)
            check("denied_AI_does_not_consume_quota",
                  after_denial == baseline)

            stage = "A_mobile_switch_to_org"
            page_a.locator("#workspace-switch-drawer-select").wait_for(
                state="attached", timeout=12000
            )
            page_a.locator("#rail-features").click()
            options = page_a.locator("#workspace-switch-drawer-select option").all()
            org = next((opt.get_attribute("value") for opt in options
                        if "Tổ chức" in opt.inner_text()), None)
            check("organization_switch_option_available", bool(org))
            page_a.locator("#workspace-switch-drawer-select").select_option(value=org)
            page_a.wait_for_function(
                "() => document.querySelector('#profile-role')?.textContent?.includes('Tổ chức')",
                timeout=20000,
            )
            check("A_mobile_tenant_switch_visible", "Tổ chức" in page_a.locator("#profile-role").inner_text())
            wait_matter(page_a, ORG_A, ORG_B)
            rotated_sid = signed_cookie(a)
            check("A_SID_rotated_on_tenant_switch", rotated_sid != old_sid)

            stage = "old_sid_rejected"
            old_api = p.request.new_context(
                ignore_https_errors=True,
                extra_http_headers={"Cookie": "al_qa_session=" + old_sid},
            )
            expired = old_api.get(BASE + "/api/qa/session")
            check("old_mobile_session_401", expired.status == 401)

            stage = "authorized_local_UC10"
            local_a = request_legal(a, MB, "UC10")
            local_b = request_legal(b, MP, "UC10")
            check("A_local_UC10_authorized", local_a.status == 200)
            check("B_local_UC10_authorized", local_b.status == 200)
            check("UC10_is_pure_local_retrieval",
                  local_a.json().get("mode") == "local_example_only" and
                  local_b.json().get("mode") == "local_example_only")
            check("UC10_does_not_consume_AI_quota", metrics(a) == baseline)

            stage = "logout_B_desktop"
            page_b.locator("#preview-logout").click()
            page_b.wait_for_url(BASE + "/", timeout=18000)
            check("B_logout_removes_private_access",
                  b.request.get(BASE + "/api/qa/session").status == 401)

            stage = "logout_A_mobile"
            page_a.locator("#rail-features").click()
            page_a.locator("#drawer-logout").click()
            page_a.wait_for_url(BASE + "/", timeout=18000)
            check("A_logout_removes_private_access",
                  a.request.get(BASE + "/api/qa/session").status == 401)
            check("AI_quota_unchanged_after_browser", metrics(a) == baseline)
            return checks
        finally:
            for ctx in (old_api, a, b):
                if ctx is not None:
                    ctx.dispose() if ctx is old_api else ctx.close()
            browser.close()


if __name__ == "__main__":
    try:
        result = execute()
        print("R126_LOCAL_AUTH_CHROMIUM " + json.dumps({
            "status": "PASS", "checks": len(result),
            "mobile": "390x844", "desktop": "1440x900",
            "website_and_backend": "REAL_CODE",
            "qa_database": "DISPOSABLE_SQLITE",
            "live_cloudflare_password_login": "NOT_RUN",
        }, separators=(",", ":")))
    except Exception as error:
        # Do not log browser URLs containing user context, cookies or contents.
        print("R126_LOCAL_AUTH_CHROMIUM " + json.dumps({
            "status": "FAIL", "stage": stage, "kind": type(error).__name__,
            "live_cloudflare_password_login": "NOT_RUN",
        }, separators=(",", ":")))
        sys.exit(1)
