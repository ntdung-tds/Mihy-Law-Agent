"""R85: observe real Google Drive browser CORS from the QA website origin.
No Google token, account session, customer file or valid upload session.
"""
import json
from playwright.sync_api import sync_playwright

ORIGIN = "https://ai-law-web-qa.iaict-platform.workers.dev"
DUMMY_SESSION = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=ai_law_r85_nonexistent_cors_probe"

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            for name, size in [("desktop", {"width": 1280, "height": 860}),
                               ("mobile", {"width": 390, "height": 844})]:
                ctx = browser.new_context(viewport=size)
                page = ctx.new_page()
                page.goto(ORIGIN + "/login", wait_until="domcontentloaded", timeout=20000)
                assert page.url.startswith(ORIGIN + "/login"), "QA origin not available"
                outcome = page.evaluate("""async (target) => {
                    const ctl = new AbortController();
                    const timeout = setTimeout(() => ctl.abort(), 9000);
                    try {
                        const r = await fetch(target, {
                            method: "PUT", mode: "cors", redirect: "error",
                            headers: {"Content-Type": "application/pdf"},
                            body: new Uint8Array([37,80,68,70,45,49,46,52]),
                            signal: ctl.signal
                        });
                        return {kind: "http", status: r.status, type:r.type,
                                urlOrigin:new URL(r.url).origin};
                    } catch(e) {
                        return {kind:"browser_blocked", name:e.name,
                                message:String(e.message).slice(0,140)};
                    } finally {clearTimeout(timeout);}
                }""", DUMMY_SESSION)
                print("R85_GOOGLE_DRIVE_BROWSER_CORS " + json.dumps(
                    {"viewport": name, "test": "invalid-session-PUT",
                     "origin": ORIGIN, "result": outcome}, sort_keys=True))
                assert outcome["kind"] in ("http","browser_blocked")
                ctx.close()
        finally:
            browser.close()

if __name__ == "__main__":
    run()
