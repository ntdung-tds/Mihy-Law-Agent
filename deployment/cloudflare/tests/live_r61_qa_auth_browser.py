"""R61 Chromium QA regression: real live nonproduction anonymous gates, plus
R60 workspace browser behavior with explicitly simulated API responses.
No password, session cookie, credential bundle, or customer content in CI.
The mocked-browser phase is not full IdP/TC12 acceptance.
"""
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.environ.get("MIHY_QA_URL", "https://ai-law-web-qa.iaict-platform.workers.dev").rstrip("/")
ROOT = Path(__file__).resolve().parents[3]
WORKSPACE = ROOT / "web" / "r0-preview"
ACTOR = "qa.synthetic@ai-law.invalid"
MATTER_ID = "a3f204e0-1111-4111-8111-000000000001"


def live_anonymous(browser):
    for width in (320, 390, 430, 1440):
        context = browser.new_context(viewport={"width": width, "height": 850}, device_scale_factor=1)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        response = page.goto(BASE + "/login", wait_until="domcontentloaded", timeout=30000)
        assert response and response.status == 200, ("login HTTPS", width)
        page.locator("#login-form").wait_for()
        assert page.locator("#password").get_attribute("type") == "password"
        page.locator("#reveal").click()
        assert page.locator("#password").get_attribute("type") == "text"
        page.locator("#reveal").click()
        assert page.locator("#password").get_attribute("type") == "password"
        assert page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 3, ("login overflow", width)

        denied = page.goto(BASE + "/app", wait_until="domcontentloaded", timeout=30000)
        assert denied and denied.status == 200, ("redirected login page", width)
        assert page.url.startswith(BASE + "/login"), ("anonymous app bypass", width, page.url)
        assert page.locator("#login-form").is_visible()
        assert page.request.get(BASE + "/api/qa/session").status == 401
        assert page.request.get(BASE + "/api/qa/matters").status == 401
        assert page.request.get(BASE + "/session.js").status == 401

        assert not errors, ("JS runtime errors", width, errors)
        context.close()
        print("PASS LIVE HTTPS anonymous Chromium", width, flush=True)


def mock_workspace(browser, role):
    """Serve genuine checked-in R60 browser files, MOCK ONLY server authorization."""
    context = browser.new_context(viewport={"width": 390, "height": 850})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    revoked = {"value": False}
    dataset = [{"id": MATTER_ID, "title": "Synthetic QA only", "created_at": 1800000000}]

    def auth_route(route):
        path = route.request.url.split("?", 1)[0]
        if path.endswith("/api/qa/session"):
            payload = ({"error": "expired"} if revoked["value"] else
                       {"email": ACTOR, "role": role, "workspace_type": "organization"})
            return route.fulfill(status=401 if revoked["value"] else 200,
                                 content_type="application/json", body=json.dumps(payload))
        if path.endswith("/api/qa/matters"):
            payload = ({"error": "expired"} if revoked["value"] else {"matters": dataset})
            return route.fulfill(status=401 if revoked["value"] else 200,
                                 content_type="application/json", body=json.dumps(payload))
        return route.continue_()

    page.route("**/api/qa/**", auth_route)
    files = {
        "/app": (WORKSPACE / "index.html", "text/html; charset=utf-8"),
        "/styles.css": (WORKSPACE / "styles.css", "text/css; charset=utf-8"),
        "/app.js": (WORKSPACE / "app.js", "application/javascript; charset=utf-8"),
        "/session.js": (WORKSPACE / "session.js", "application/javascript; charset=utf-8"),
        "/matters.js": (WORKSPACE / "matters.js", "application/javascript; charset=utf-8"),
    }

    def local_file(route):
        suffix = route.request.url.split("#", 1)[0].split("?", 1)[0].split(BASE, 1)[-1]
        entry = files.get(suffix)
        if not entry:
            return route.continue_()
        file, mime = entry
        return route.fulfill(status=200, content_type=mime, body=file.read_bytes())

    for path in files:
        page.route(BASE + path, local_file)

    try:
        page.goto(BASE + "/app#documents", wait_until="domcontentloaded", timeout=30000)
        page.locator(".matter-row").wait_for()
        assert page.locator(".matter-row").count() == 1
        assert page.locator("#profile-identity").inner_text() == ACTOR
        expected_role = "Quản trị đơn vị" if role == "tenant_admin" else (
            "Luật sư" if role == "lawyer" else "Vai trò chưa xác định")
        page.wait_for_function(
            "([value]) => document.querySelector('#profile-role').textContent.includes(value)",
            arg=[expected_role]
        )
        assert page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 3

        revoked["value"] = True
        page.locator("#matter-refresh").click()
        page.wait_for_url(BASE + "/login", timeout=15000)
        assert page.locator("#login-form").is_visible()
        assert not errors, ("mocked app JS", role, errors)
        print("PASS CHROMIUM R60 simulated API revoked role", role, flush=True)
    finally:
        context.close()


def run():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            live_anonymous(browser)
            for role in ("lawyer", "tenant_admin", "constructor"):
                mock_workspace(browser, role)
        finally:
            browser.close()


if __name__ == "__main__":
    run()
