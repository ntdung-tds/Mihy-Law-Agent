"""R45 real HTTPS + Chromium QA preview smoke; no owner passwords, no screenshots persisted."""
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
ORIGIN = "https://ai-law-r0-preview-r45-qa.iaict-platform.workers.dev"
LOCAL_UI = (Path(__file__).resolve().parents[3] / "web" / "r0-preview" / "index.html").as_uri()

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 850}, device_scale_factor=1)
        api = context.request
        health = api.get(ORIGIN + "/health", timeout=30000)
        assert health.status == 200, ("health", health.status, health.text()[:300])
        anonymous = api.get(ORIGIN + "/app.js")
        assert anonymous.status == 401, ("anonymous_app", anonymous.status)
        session = api.get(ORIGIN + "/api/qa/session")
        assert session.status == 401, ("anonymous_session", session.status)
        rejected = api.post(ORIGIN + "/api/qa/logout", data="{}", headers={"Origin": "https://attacker.invalid", "Content-Type": "application/json"})
        assert rejected.status == 403, ("csrf", rejected.status)
        page = context.new_page()
        for width in (320, 390, 430, 1440):
            page.set_viewport_size({"width":width,"height":850})
            response = page.goto(ORIGIN + "/?utm_source=chatgpt.com#documents", wait_until="domcontentloaded", timeout=30000)
            if response is not None:
                assert response.status == 200, ("login", width, response.status)
            else:
                assert page.url.startswith(ORIGIN + "/"), ("unexpected URL",page.url)
            page.locator("#login-form").wait_for()
            assert page.locator("#password").is_visible()
            assert not page.locator(".mobile-right-rail").count(), "authenticated workspace was leaked anonymously"
            overflow = page.evaluate("document.documentElement.scrollWidth - innerWidth")
            assert overflow <= 3, ("login horizontal overflow",width,overflow)
        # One nonexistent synthetic identifier prevents QA04 lockout.
        page.set_viewport_size({"width":390,"height":850})
        page.locator("#email").fill("r45-nonexistent@ai-law.invalid")
        page.locator("#password").fill("wrong-password-not-a-real-account")
        page.locator("#submit").click()
        page.locator("#form-error:not([hidden])").wait_for(timeout=15000)
        assert page.locator("#login-panel").is_visible()
        # Browser UI test with local synthetic file, NO real authorized session or file API.
        for width in (320,390,430,1440):
            page.set_viewport_size({"width":width,"height":850})
            page.goto(LOCAL_UI + "#documents", wait_until="domcontentloaded")
            page.locator('[data-panel="documents"]:not([hidden])').wait_for()
            overflow = page.evaluate("document.documentElement.scrollWidth - innerWidth")
            assert overflow <= 3, ("workspace horizontal overflow",width,overflow)
            if width <= 820:
                assert page.locator("#rail-features").is_visible()
                page.locator("#rail-features").click()
                page.locator("#function-drawer:not([hidden])").wait_for()
                assert page.locator("[data-feature-jump]").count() == 11
                page.locator('[data-feature-jump="UC04"]').click()
                page.locator('[data-panel="overview"]:not([hidden])').wait_for()
                assert page.locator("#function-drawer").is_hidden()
            else:
                assert not page.locator("#rail-features").is_visible()
        browser.close()
    print("R45_PASS: live QA login/CSRF/anonymous denial + Chromium 320/390/430/1440 local right-menu interactions")

if __name__=="__main__":
    main()
