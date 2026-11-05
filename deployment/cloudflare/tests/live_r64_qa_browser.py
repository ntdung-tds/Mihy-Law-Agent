"""R64 REAL nonproduction Cloudflare QA anonymous HTTP and Chromium regression.
No credentials, cookies or simulated *positive* login in this test.
Authorised positive role, tenant switch, expiry and MatterACL E2E remain separate.
"""
import json
from playwright.sync_api import sync_playwright

BASE = "https://ai-law-web-qa.iaict-platform.workers.dev"
TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            for width in (320, 390, 430, 1440):
                context = browser.new_context(viewport={"width": width, "height": 850})
                page = context.new_page()
                failures = []
                page.on("pageerror", lambda e: failures.append(str(e)))
                response = page.goto(BASE + "/login", wait_until="domcontentloaded", timeout=30000)
                assert response and response.status == 200, ("login", width)
                page.locator("#login-form").wait_for(state="visible")
                assert page.locator("#password").get_attribute("type") == "password"
                assert page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 3, width

                # Real QA backend and site relays, without any authenticated session.
                assert page.request.get(BASE + "/api/qa/session").status == 401
                assert page.request.get(BASE + "/api/qa/workspaces").status == 401
                assert page.request.get(BASE + "/api/qa/matters").status == 401
                assert page.request.get(BASE + "/session.js").status == 401
                assert page.request.get(BASE + "/api/qa/login").status == 404

                # Correct Origin + no Cookie: authentication boundary, never tenant data.
                post = page.request.post(
                    BASE + "/api/qa/switch-workspace",
                    headers={"Origin": BASE, "Sec-Fetch-Site": "same-origin",
                             "Content-Type": "application/json"},
                    data=json.dumps({"tenant_id": TENANT}),
                )
                assert post.status == 401, (width, "unauthorized tenant switch", post.status)
                assert "Set-Cookie" not in post.headers, ("anonymous switch issued SID", width)

                # Invalid Origin blocked before proxying to backend.
                outside = page.request.post(
                    BASE + "/api/qa/switch-workspace",
                    headers={"Origin": "https://untrusted.invalid",
                             "Sec-Fetch-Site": "cross-site", "Content-Type": "application/json"},
                    data=json.dumps({"tenant_id": TENANT}),
                )
                assert outside.status == 403, (width, "CSRF gate", outside.status)
                denied = page.goto(BASE + "/app", wait_until="domcontentloaded", timeout=30000)
                assert denied and denied.status == 200
                assert page.url.startswith(BASE + "/login"), ("app anonymous bypass", page.url)
                assert not failures, ("JS", width, failures)
                context.close()
                print("PASS R64 REAL QA anonymous Chromium", width, flush=True)
        finally:
            browser.close()


if __name__ == "__main__":
    verify()
