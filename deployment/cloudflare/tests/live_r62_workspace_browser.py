"""R62 real Chromium DOM with local R0 files and *simulated* QA API replies.
This is UI smoke, not an IdP-backed user sign-in or live Cloudflare role E2E.
"""
from pathlib import Path
import json

from playwright.sync_api import sync_playwright

BASE = "https://ai-law-web-qa.iaict-platform.workers.dev"
ROOT = Path(__file__).resolve().parents[3] / "web" / "r0-preview"
ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
PERSONAL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
OLD = "R62 synthetic organization matter"
NEW = "R62 synthetic personal matter"
ROWS = [
    {"tenant_id": ORG, "role": "lawyer", "workspace_type": "organization"},
    {"tenant_id": PERSONAL, "role": "lawyer", "workspace_type": "personal"}
]
FILES = {
    "/app": ("index.html", "text/html"),
    "/app.js": ("app.js", "application/javascript"),
    "/styles.css": ("styles.css", "text/css"),
    "/session.js": ("session.js", "application/javascript"),
    "/matters.js": ("matters.js", "application/javascript"),
}


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            for width in (320, 390, 1440):
                state = {"tenant": ORG, "switches": 0}
                errors = []
                context = browser.new_context(viewport={"width": width, "height": 850})
                page = context.new_page()
                page.on("pageerror", lambda e: errors.append(str(e)))

                def route_mock(route):
                    url = route.request.url
                    route_path = url.split("#", 1)[0].split("?", 1)[0].replace(BASE, "")
                    if route_path in FILES:
                        filename, mime = FILES[route_path]
                        return route.fulfill(status=200, content_type=mime,
                                             body=(ROOT / filename).read_bytes())
                    if route_path == "/api/qa/session":
                        kind = "organization" if state["tenant"] == ORG else "personal"
                        return route.fulfill(status=200, content_type="application/json",
                                             body=json.dumps({"email": "qa02.dual@ai-law.invalid",
                                                              "tenant_id": state["tenant"],
                                                              "role": "lawyer",
                                                              "workspace_type": kind}))
                    if route_path == "/api/qa/workspaces":
                        return route.fulfill(status=200, content_type="application/json",
                                             body=json.dumps({"current_tenant_id": state["tenant"],
                                                              "workspaces": ROWS}))
                    if route_path == "/api/qa/matters":
                        title = OLD if state["tenant"] == ORG else NEW
                        return route.fulfill(status=200, content_type="application/json",
                                             body=json.dumps({"matters": [{
                                                 "id": "f0000000-0000-4000-8000-000000000001",
                                                 "title": title, "created_at": 1800000000}]}))
                    if route_path == "/api/qa/switch-workspace":
                        data = json.loads(route.request.post_data or "{}")
                        assert route.request.method == "POST"
                        assert data.get("tenant_id") == PERSONAL, data
                        state["tenant"] = PERSONAL
                        state["switches"] += 1
                        return route.fulfill(status=200, content_type="application/json",
                                             body='{"ok":true}', headers={
                                                 "Set-Cookie": "al_qa_session=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee; Path=/; HttpOnly; Secure; SameSite=Strict"
                                             })
                    return route.continue_()

                page.route(BASE + "/**", route_mock)
                page.goto(BASE + "/app#documents", wait_until="domcontentloaded")
                # R63 browser checks the actual 5-item fixed bottom bar; authorization is mocked.
                nav = page.locator(".mobile-bottom-nav")
                if width <= 820:
                    assert nav.is_visible(), width
                    bounds = nav.bounding_box()
                    assert bounds is not None and abs(bounds["width"] - width) <= 2, (width, bounds)
                    assert abs(bounds["y"] + bounds["height"] - 850) <= 2, (width, bounds)
                    columns = page.evaluate(
                        "getComputedStyle(document.querySelector('.mobile-bottom-nav')).gridTemplateColumns.split(' ').length"
                    )
                    assert columns == 5, (width, columns)
                    assert page.locator(".sidebar").is_hidden()
                    page.locator('.mobile-bottom-nav [data-view="overview"]').click()
                    assert page.locator("#view-overview").is_visible()
                    page.locator('.mobile-bottom-nav [data-view="documents"]').click()
                    assert page.locator("#view-documents").is_visible()
                    assert page.locator('.mobile-bottom-nav [data-view="documents"]').get_attribute("aria-current") == "page"
                else:
                    assert nav.is_hidden()
                    assert page.locator(".sidebar").is_visible()
                page.locator(".matter-row").wait_for(state="attached")
                page.locator("#workspace-switch-desktop-select").wait_for(state="attached")
                page.locator("#workspace-switch-drawer-select").wait_for(state="attached")
                assert page.locator(".matter-row").count() == 1
                assert OLD in page.locator("#matter-list").inner_text()
                assert page.locator("#workspace-switch-desktop-select").input_value() == ORG
                assert page.evaluate("document.documentElement.scrollWidth-innerWidth") <= 3, width

                if width < 1000:
                    page.locator("#rail-features").click()
                    assert page.locator("#workspace-switch-drawer-select").is_visible()
                    page.locator("#workspace-switch-drawer-select").select_option(PERSONAL)
                else:
                    page.locator("#workspace-switch-desktop-select").select_option(PERSONAL)
                page.wait_for_url(BASE + "/app", timeout=15000)
                page.locator(".matter-row").wait_for(state="attached")
                assert NEW in page.locator("#matter-list").inner_text()
                assert OLD not in page.locator("#matter-list").inner_text()
                assert page.locator("#workspace-switch-desktop-select").input_value() == PERSONAL
                assert state["switches"] == 1
                assert not errors, (width, errors)
                context.close()
                print("PASS Chromium R62 simulated session workspace switch", width, flush=True)
        finally:
            browser.close()


if __name__ == "__main__":
    run()
