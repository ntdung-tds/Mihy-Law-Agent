"""R126 live *public, signed-out* mobile/desktop browser gate against Cloudflare QA.

Intentionally uses NO credentials, cookies, user records, API write actions, or
screenshots. This is complementary to the private-credential positive E2E gate,
not a replacement for it.
"""
import json
import sys

from playwright.sync_api import sync_playwright, TimeoutError as BrowserTimeout

BASE = "https://ai-law-web-qa.iaict-platform.workers.dev"
SIZES = ((320, 740), (390, 844), (430, 932), (768, 900), (1440, 900))


def execute():
    passed = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for width, height in SIZES:
                context = browser.new_context(
                    viewport={"width": width, "height": height},
                    is_mobile=width <= 430,
                    has_touch=width <= 430,
                    device_scale_factor=2 if width <= 430 else 1,
                )
                try:
                    page = context.new_page()
                    response = page.goto(BASE + "/login", wait_until="domcontentloaded",
                                         timeout=25000)
                    assert response is not None and response.status == 200, (
                        "public_login_status", width,
                        None if response is None else response.status,
                    )
                    page.locator("#login-form").wait_for(state="visible", timeout=12000)
                    assert page.locator("#email").is_visible(), ("email_missing", width)
                    assert page.locator("#password").is_visible(), ("password_missing", width)
                    assert page.locator("#submit").is_visible(), ("submit_missing", width)
                    assert page.locator("#password").get_attribute("type") == "password"
                    assert not page.locator("#email").input_value(), ("unexpected_email_value", width)
                    assert not page.locator("#password").input_value(), ("unexpected_password_value", width)
                    overflow = page.evaluate(
                        "() => document.documentElement.scrollWidth - window.innerWidth"
                    )
                    assert overflow <= 3, ("horizontal_overflow", width, overflow)
                    passed.append("public_login_responsive_" + str(width))

                    if width in (390, 1440):
                        page.locator("#reveal").click()
                        assert page.locator("#password").get_attribute("type") == "text", (
                            "show_password_button", width
                        )
                        page.locator("#reveal").click()
                        assert page.locator("#password").get_attribute("type") == "password", (
                            "hide_password_button", width
                        )
                        passed.append("password_visibility_toggle_" + str(width))

                    # Never enter credentials. A hash fragment cannot authorize /app.
                    page.goto(BASE + "/app#assistant", wait_until="domcontentloaded",
                              timeout=25000)
                    assert page.url.startswith(BASE + "/login"), (
                        "anonymous_workspace_exposed", width
                    )
                    assert page.locator("#login-form").is_visible(), (
                        "login_form_missing_after_redirect", width
                    )
                    passed.append("anonymous_app_denied_" + str(width))
                finally:
                    context.close()

            context = browser.new_context()
            try:
                http = context.request
                for endpoint in ("/api/qa/session", "/api/qa/workspaces",
                                 "/api/qa/matters", "/api/qa/profile"):
                    resp = http.get(BASE + endpoint, timeout=15000)
                    assert resp.status == 401, (
                        "anonymous_api_failed_closed", endpoint, resp.status
                    )
                    passed.append("api_401_" + endpoint.rsplit("/", 1)[-1])
                account = http.get(BASE + "/account", max_redirects=0, timeout=15000)
                assert account.status == 302, (
                    "anonymous_account_status", account.status
                )
                assert account.headers.get("location", "").startswith("/login"), (
                    "anonymous_account_location",
                )
                passed.append("anonymous_account_denied")
                health = http.get(BASE + "/health", timeout=15000)
                assert health.status == 200, ("qa_site_health", health.status)
                data = health.json()
                assert data.get("environment") == "qa_nonproduction", (
                    "not_nonproduction_qa"
                )
                passed.append("nonproduction_health")
            finally:
                context.close()
        finally:
            browser.close()
    return passed


if __name__ == "__main__":
    try:
        results = execute()
        print("R126_PUBLIC_BROWSER " + json.dumps({
            "status": "PASS", "count": len(results), "checks": results,
            "authenticated_private_E2E": "NOT_RUN",
        }, separators=(",", ":")))
    except BrowserTimeout:
        print('R126_PUBLIC_BROWSER {"status":"BLOCKED","reason":"BROWSER_NETWORK_TIMEOUT"}')
        sys.exit(2)
    except Exception as error:
        # Avoid echoing page, URLs with query parameters, cookies, or network bodies.
        print('R126_PUBLIC_BROWSER ' + json.dumps({
            "status": "FAIL",
            "reason": "LIVE_PUBLIC_BROWSER_ASSERTION_FAILED",
            "exception_type": type(error).__name__,
            "authenticated_private_E2E": "NOT_RUN",
        }, separators=(",", ":")))
        sys.exit(1)
