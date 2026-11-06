"""Real Chromium check of Google cross-site return with SameSite=Strict QA cookies.

Pure localhost synthetic credentials, no Google account and no production access.
"""
import json
import select
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[3]
SERVER=ROOT / "deployment/cloudflare/tests/r77_strict_cookie_server.mjs"


def main():
    proc=subprocess.Popen(["node",str(SERVER)],cwd=ROOT,
                          stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    try:
        ready,_,_=select.select([proc.stdout],[],[],15)
        if not ready:
            raise RuntimeError("Synthetic QA browser server not ready")
        ports=json.loads(proc.stdout.readline())
        website=f"http://app.test:{ports['site_port']}"
        provider=f"http://google.test:{ports['external_port']}"
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,args=[
                "--host-resolver-rules=MAP app.test 127.0.0.1,MAP google.test 127.0.0.1"
            ])
            try:
                for name,viewport in [
                    ("desktop",{"width":1280,"height":850}),
                    ("mobile",{"width":390,"height":844}),
                ]:
                    context=browser.new_context(viewport=viewport)
                    page=context.new_page()
                    page.goto(website+"/test-login")
                    assert "Local synthetic session established" in page.locator("body").inner_text()
                    # Simulate a real click on a Google-hosted consent page,
                    # rather than an address-bar navigation (which can have
                    # different SameSite browser semantics).
                    page.goto(provider+"/")
                    page.locator("#direct").click()
                    page.wait_for_timeout(600)
                    assert page.url.startswith(website+"/login"), (
                        name+" expected cross-site consent click to withhold Strict cookie, got "+page.url
                    )
                    # Cookie remains in the browser jar; it was only withheld.
                    page.goto(provider+"/")
                    page.locator("#bridge").click()
                    page.wait_for_url("**/app#documents",timeout=15000)
                    # The app removes the one-time ?drive= flag after status verification.
                    assert "Mihy Law AI Agent" in page.locator("body").inner_text(), (
                        name+" failed to restore protected QA app after first-party landing"
                    )
                    print(f"PASS {name}: direct Google-style redirect withholds Strict cookie; 200 landing restores private workspace")
                    # R79: actual Chromium sees a readable, accessible file chooser
                    # in the protected documents panel, not a wide native input.
                    picker=page.locator(".qa-document-file-control")
                    picker.wait_for(state="visible",timeout=10000)
                    box=picker.bounding_box()
                    assert box and box["x"] >= -1 and box["x"] + box["width"] <= viewport["width"]+2, (
                        name+" file chooser overflows the viewport: "+str(box)
                    )
                    filename="qa-synthetic-filename-that-must-wrap-within-mobile-view.pdf"
                    page.locator("#document-file").set_input_files({
                        "name":filename,
                        "mimeType":"application/pdf",
                        "buffer":b"%PDF-1.4\\n1 0 obj\\n<< >>\\nendobj\\n%%EOF\\n",
                    })
                    assert page.locator("#document-file-name").inner_text()==filename
                    print(f"PASS {name}: responsive PDF/DOCX picker and selected filename visible without horizontal overflow")
                    context.close()
            finally:
                browser.close()
    finally:
        proc.terminate()
        try:
            proc.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate(timeout=5)


if __name__=="__main__":
    main()
