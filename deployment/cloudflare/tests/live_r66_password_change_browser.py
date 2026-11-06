"""R66 Chromium UI regression with SYNTHETIC positive session API.
Tests real HTML/CSS/JS at phone and desktop widths. NOT a live login claim.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

BASE = "https://ai-law-web-qa.iaict-platform.workers.dev"
ROOT = Path(__file__).resolve().parents[3]
WORK = ROOT / "web" / "r0-preview"
SITE = ROOT / "web" / "website"
ORIGIN = "qa@example.invalid"
OLD = "synthetic-previous-password-only"
NEW = "synthetic-unique-new-password-only"

FILES = {
    "/app": (WORK / "index.html", "text/html"),
    "/styles.css": (WORK / "styles.css", "text/css"),
    "/app.js": (WORK / "app.js", "application/javascript"),
    "/session.js": (WORK / "session.js", "application/javascript"),
    "/matters.js": (WORK / "matters.js", "application/javascript"),
    "/login": (SITE / "login.html", "text/html"),
    "/site.css": (SITE / "styles.css", "text/css"),
    "/site-login.js": (SITE / "login.js", "application/javascript"),
}


def verify():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        try:
            for width in (320, 390, 1440):
                state = {"authenticated": True, "submitted": 0}
                errors = []
                ctx = browser.new_context(viewport={"width": width, "height": 850})
                page = ctx.new_page()
                page.on("pageerror", lambda error: errors.append(str(error)))

                def mock(route):
                    url = route.request.url
                    path = url.split("?", 1)[0].split("#", 1)[0].replace(BASE, "")
                    if path in FILES:
                        f, mime = FILES[path]
                        return route.fulfill(status=200, content_type=mime, body=f.read_bytes())
                    if path == "/api/qa/session":
                        return route.fulfill(status=200 if state["authenticated"] else 401,
                                             content_type="application/json",
                                             body=json.dumps({"email": ORIGIN, "role": "lawyer",
                                                              "workspace_type": "personal"}
                                                             if state["authenticated"] else
                                                             {"error": "denied"}))
                    if path == "/api/qa/workspaces":
                        return route.fulfill(status=200, content_type="application/json",
                                             body='{"workspaces":[]}')
                    if path == "/api/qa/matters":
                        return route.fulfill(status=200, content_type="application/json",
                                             body='{"matters":[]}')
                    if path == "/api/qa/change-password":
                        payload = json.loads(route.request.post_data or "{}")
                        assert route.request.method == "POST"
                        assert payload == {"current_password": OLD, "new_password": NEW}
                        state["submitted"] += 1
                        state["authenticated"] = False
                        return route.fulfill(status=200, content_type="application/json",
                                             body='{"ok":true,"login_required":true}',
                                             headers={"Set-Cookie": "al_qa_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict"})
                    return route.abort()

                page.route(BASE + "/**", mock)
                page.goto(BASE + "/app", wait_until="domcontentloaded")
                if width <= 820:
                    page.locator("#rail-features").click()
                    page.locator("#change-password-drawer").click()
                else:
                    page.locator("#change-password-top").click()
                dialog = page.locator("#change-password-dialog")
                assert dialog.is_visible(), width
                page.locator("#current-password").fill(OLD)
                page.locator("#new-password").fill(NEW)
                page.locator("#confirm-password").fill("wrong-confirmation")
                page.locator("#change-password-submit").click()
                assert page.locator("#change-password-error").is_visible()
                assert state["submitted"] == 0, width
                page.locator("#confirm-password").fill(NEW)
                page.locator("#change-password-submit").click()
                page.wait_for_url(BASE + "/login?changed=1", timeout=15000)
                assert page.locator("#password-change-success").is_visible()
                assert state["submitted"] == 1, width
                assert OLD not in page.url and NEW not in page.url
                assert not errors, (width, errors)
                ctx.close()
                print("PASS R66 Chromium synthetic password change form", width, flush=True)
        finally:
            browser.close()


if __name__ == "__main__":
    verify()
