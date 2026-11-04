"""R44 real HTTPS QA login-page browser checks (NO secret credentials or screenshots).

Genuine positive-password login needs the Owner-only QA password and is
separately gated; this public CI suite tests responsive page and denied
login on actual Cloudflare Workers Free from Chromium. Do not send repeated\nwrong passwords to the Owner QA-04 account: its lockout is persistent D1 state.
"""
from playwright.sync_api import sync_playwright, expect

BASE="https://ai-law-standalone-cf-qa.iaict-platform.workers.dev/"

def run():
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True)
        try:
            for width,height in [(320,750),(390,844),(430,932),(1440,900)]:
                context=browser.new_context(viewport={"width":width,"height":height},
                    is_mobile=width<600,has_touch=width<600,
                    device_scale_factor=2 if width<600 else 1)
                try:
                    page=context.new_page()
                    response=page.goto(BASE,wait_until="domcontentloaded",timeout=30000)
                    assert response.status==200,(width,response.status)
                    expect(page.locator("#login-form")).to_be_visible(timeout=12000)
                    expect(page.locator("#dashboard")).to_be_hidden()
                    assert page.locator("input#email").get_attribute("autocomplete")=="username"
                    assert page.locator("input#password").get_attribute("type")=="password"
                    assert page.evaluate("document.documentElement.scrollWidth")<=width+2, \
                        "horizontal overflow viewport "+str(width)
                    assert page.locator("#submit").is_enabled()
                    if width==390:
                        page.locator("#email").fill("unregistered-ci-negative@ai-law.invalid")
                        page.locator("#password").fill("deliberately-not-a-QA-password")
                        with page.expect_response(lambda r: r.url.endswith("/api/qa/login"),timeout=30000) as response_info:
                            page.locator("#submit").click()
                        assert response_info.value.status==401, ("Expected unknown-account rejection, got "+str(response_info.value.status))
                        expect(page.locator("#form-error")).to_be_visible(timeout=18000)
                        expect(page.locator("#dashboard")).to_be_hidden()
                        page.reload(wait_until="domcontentloaded")
                        expect(page.locator("#login-panel")).to_be_visible(timeout=12000)
                    print(f"PASS R44 real Cloudflare HTTPS Chromium login page mobile_width={width}")
                finally:
                    context.close()
        finally:
            browser.close()

if __name__=="__main__":
    run()
