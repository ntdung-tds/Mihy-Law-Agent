"""R46 Chromium test of real R0 matter UI wiring (synthetic HTTP fixtures only).
Actual Cloudflare D1+MatterACL is independently verified by the SQL integration tests.
"""
from pathlib import Path
import http.server, socketserver, threading, json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[3] / 'web' / 'r0-preview'
class Server(socketserver.TCPServer):allow_reuse_address=True
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args):pass

def run():
    stored=[]
    http=Server(('127.0.0.1',0),Handler)
    thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
    base='http://127.0.0.1:'+str(http.server_address[1])
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            for width in (320,390,430,1440):
                context=browser.new_context(viewport={'width':width,'height':850})
                page=context.new_page()
                errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                def route(ru):
                    if ru.request.url.endswith('/api/qa/session'):
                        ru.fulfill(status=200,content_type='application/json',body=json.dumps({'email':'qa.synthetic@ai-law.invalid','role':'lawyer','workspace_type':'organization'}))
                    elif ru.request.url.endswith('/api/qa/matters'):
                        if ru.request.method=='POST':
                            body=json.loads(ru.request.post_data or '{}')
                            item={'id':'a3f204e0-1111-4111-8111-000000000001','title':body['title'],'created_at':1800000000}
                            stored[:]=[item]
                            ru.fulfill(status=201,content_type='application/json',body=json.dumps(item))
                        else:ru.fulfill(status=200,content_type='application/json',body=json.dumps({'matters':stored}))
                    else:ru.continue_()
                page.route('**/api/qa/**',route)
                page.goto(base+'/#documents',wait_until='domcontentloaded')
                page.locator('#matter-form').wait_for()
                page.locator('#matter-feedback').wait_for()
                page.wait_for_function('document.querySelector("#matter-total").textContent==="'+str(len(stored))+'"')
                if not stored:
                    page.locator('#matter-title').fill('Ho so QA kiem thu luu du lieu')
                    page.locator('#matter-create').click()
                    page.locator('.matter-row').wait_for()
                assert page.locator('.matter-row').count()==1
                assert page.locator('#matter-total').inner_text()=='1'
                page.reload(wait_until='domcontentloaded')
                page.locator('.matter-row').wait_for()
                assert page.locator('.matter-row').count()==1
                assert page.locator('#matter-title').count()==1
                assert not errors,('JS',width,errors)
                overflow=page.evaluate('document.documentElement.scrollWidth-innerWidth')
                assert overflow<=3,('overflow',width,overflow)
                context.close()
            browser.close()
        print('PASS: HTTP QA case create/list, reload persistence fixture and Chromium 320/390/430/1440')
    finally:
        http.shutdown();http.server_close()
if __name__=='__main__':run()
