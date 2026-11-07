"""R85: inspect live browser-to-Drive CORS, differentiating our CSP from Google.
Uses an invalid Google resumable session: no OAuth, no customer content or Drive writes.
CSP removal is local to the disposable test browser, never deployed to QA.
"""
import json
from playwright.sync_api import sync_playwright

ORIGIN = "https://ai-law-web-qa.iaict-platform.workers.dev"
DUMMY_SESSION = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=ai_law_r85_nonexistent_cors_probe"

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            for name,size in [("desktop",{"width":1280,"height":860}),
                              ("mobile",{"width":390,"height":844})]:
                for mode in ["actual_CSP","remove_CSP_in_test_browser_only"]:
                    ctx=browser.new_context(viewport=size)
                    page=ctx.new_page()
                    errors=[]
                    failed_requests=[]
                    def record_console(m):
                        if m.type=="error":
                            errors.append(m.text[:360].replace("upload_id=ai_law_r85_nonexistent_cors_probe","upload_id=[synthetic]"))
                    def record_failure(request):
                        if request.url.startswith("https://www.googleapis.com/"):
                            failed_requests.append({"destination":"googleapis", "error":request.failure})
                    page.on("console",record_console)
                    page.on("requestfailed",record_failure)
                    if mode == "remove_CSP_in_test_browser_only":
                        def drop_csp(route):
                            response=route.fetch()
                            headers=dict(response.headers)
                            headers.pop("content-security-policy",None)
                            headers.pop("content-security-policy-report-only",None)
                            route.fulfill(response=response,headers=headers)
                        page.route("**/login",drop_csp)
                    initial=page.goto(ORIGIN+"/login",wait_until="domcontentloaded",timeout=20000)
                    csp=initial.headers.get("content-security-policy","")
                    assert page.url.startswith(ORIGIN+"/login"),"QA origin not available"
                    outcome=page.evaluate("""async (target) => {
                        const ctl = new AbortController();
                        const timeout = setTimeout(() => ctl.abort(), 9000);
                        try {
                            const r = await fetch(target, {
                                method:"PUT",mode:"cors",redirect:"error",
                                headers:{"Content-Type":"application/pdf"},
                                body:new Uint8Array([37,80,68,70,45,49,46,52]),
                                signal:ctl.signal
                            });
                            return {kind:"http",status:r.status,type:r.type,
                                urlOrigin:new URL(r.url).origin};
                        } catch(e) {
                            return {kind:"browser_blocked",name:e.name,
                                message:String(e.message).slice(0,140)};
                        } finally {clearTimeout(timeout);}
                    }""",DUMMY_SESSION)
                    classes=[
                        "CSP" if "Content Security Policy" in x or "connect-src" in x
                        else "CORS" if "CORS" in x or "Access-Control-Allow-Origin" in x
                        else "network" for x in errors[:6]]
                    print("R91_GOOGLE_DRIVE_CSP_DIAG "+json.dumps({
                        "viewport":name,"mode":mode,
                        "csp":csp[:1000],
                        "console":errors[:6],
                        "failed_google_requests":failed_requests[:6],
                        "outcome":outcome
                    },sort_keys=True))
                    print("R85_GOOGLE_DRIVE_BROWSER_CORS "+json.dumps(
                        {"viewport":name,"mode":mode,"test":"invalid-session-PUT",
                         "result":outcome,"console_classifications":classes},
                        sort_keys=True))
                    assert outcome["kind"] in ("http","browser_blocked")
                    ctx.close()
        finally:
            browser.close()

if __name__ == "__main__":
    run()
