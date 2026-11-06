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
        website=f"http://localhost:{ports['site_port']}"
        provider=f"http://127.0.0.1:{ports['external_port']}"
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            try:
                for name,viewport in [
                    ("desktop",{"width":1280,"height":850}),
                    ("mobile",{"width":390,"height":844}),
                ]:
                    context=browser.new_context(viewport=viewport)
                    page=context.new_page()
                    page.goto(website+"/test-login")
                    assert "Local synthetic session established" in page.locator("body").inner_text()
                    page.goto(provider+"/direct",wait_until="load")
                    assert page.url.startswith(website+"/login"), (
                        name+" expected direct cross-site 302 to lose Strict cookie, got "+page.url
                    )
                    # Cookie remains in the browser jar; it was only withheld.
                    page.goto(provider+"/bridge",wait_until="load")
                    page.wait_for_url("**/app?drive=connected#documents",timeout=15000)
                    assert "Mihy Law AI Agent" in page.locator("body").inner_text(), (
                        name+" failed to restore protected QA app after first-party landing"
                    )
                    print(f"PASS {name}: direct Google-style redirect withholds Strict cookie; 200 landing restores private workspace")
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
