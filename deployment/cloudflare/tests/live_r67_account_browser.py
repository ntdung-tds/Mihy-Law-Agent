"""R67 real Chromium DOM across 320/390/1440 with explicitly synthetic QA API.
No live Owner password, no real legal matter data and no production.
"""
import base64
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[3]
BASE='https://ai-law-web-qa.iaict-platform.workers.dev'
TENANT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
FILES={
  '/account':(ROOT/'web/account/index.html','text/html'),
  '/account.css':(ROOT/'web/account/styles.css','text/css'),
  '/account.js':(ROOT/'web/account/app.js','application/javascript'),
  '/login':(ROOT/'web/website/login.html','text/html'),
  '/site.css':(ROOT/'web/website/styles.css','text/css'),
  '/site-login.js':(ROOT/'web/website/login.js','application/javascript'),
}
def run():
  with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True)
    try:
      for width in (320,390,1440):
        state={'profile':{'display_name':'Nguyễn QA','phone':'','job_title':'Luật sư',
                          'bio':'Dữ liệu chỉ để kiểm thử','avatar_data':''},
               'post_profile':0,'post_avatar':0,'password':0}
        context=browser.new_context(viewport={'width':width,'height':850})
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda exc:errors.append(str(exc)))
        def mock(route):
          path=route.request.url.split('?',1)[0].replace(BASE,'')
          if path in FILES:
            file,mime=FILES[path]
            return route.fulfill(status=200,content_type=mime,body=file.read_bytes())
          if path=='/api/qa/profile':
            if route.request.method=='GET':
              return route.fulfill(status=200,content_type='application/json',body=json.dumps({
                'email':'qa-test@qa.invalid','profile':state['profile'],
                'plan':{'code':'demo','source':'qa_nonproduction','billing_active':False},
                'active_workspace':{'tenant_id':TENANT,'type':'organization','role':'lawyer'},
                'workspaces':[{'tenant_id':TENANT,'type':'organization','role':'lawyer'},
                              {'tenant_id':OTHER,'type':'personal','role':'tenant_admin'}]}))
            payload=json.loads(route.request.post_data or '{}')
            assert sorted(payload)==['bio','display_name','job_title','phone']
            assert 'plan_code' not in payload and 'role' not in payload
            state['profile'].update(payload);state['post_profile']+=1
            return route.fulfill(status=200,content_type='application/json',body='{"ok":true}')
          if path=='/api/qa/profile/avatar':
            payload=json.loads(route.request.post_data or '{}')
            assert sorted(payload)==['avatar_data']
            if payload['avatar_data']:assert payload['avatar_data'].startswith('data:image/jpeg;base64,')
            state['profile']['avatar_data']=payload['avatar_data']
            state['post_avatar']+=1
            return route.fulfill(status=200,content_type='application/json',body='{"ok":true}')
          if path=='/api/qa/change-password':
            payload=json.loads(route.request.post_data or '{}')
            assert payload=={'current_password':'synthetic-old-only',
                             'new_password':'synthetic-new-only'}
            state['password']+=1
            return route.fulfill(status=200,content_type='application/json',
                                 body='{"ok":true,"login_required":true}',
                                 headers={'Set-Cookie':'al_qa_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict'})
          if path=='/api/qa/logout':
            return route.fulfill(status=200,content_type='application/json',body='{"ok":true}')
          return route.abort()
        page.route(BASE+'/**',mock)
        page.route('https://fonts.googleapis.com/**',lambda route:route.abort())
        page.goto(BASE+'/account',wait_until='domcontentloaded')
        page.locator('#account-sections').wait_for(state='visible')
        assert page.locator('#hero-name').inner_text()=='Nguyễn QA'
        assert page.locator('#plan-name').inner_text()=='Demo'
        assert page.locator('#access-role').inner_text()=='Luật sư'
        assert page.locator('#workspaces-list .workspace-list-item').count()==2
        assert page.evaluate('document.documentElement.scrollWidth-innerWidth')<=3,('overflow',width)
        if width<=930:
          assert page.locator('.mobile-sections').is_visible()
          assert page.locator('.account-sidebar').is_hidden()
        else:
          assert page.locator('.account-sidebar').is_visible()
        page.locator('#profile-display-name').fill('Hồ sơ QA cập nhật')
        page.locator('#profile-phone').fill('0912345678')
        page.locator('#profile-save').click()
        page.wait_for_function("document.querySelector('#hero-name')?.textContent==='Hồ sơ QA cập nhật'")
        assert state['post_profile']==1
        # A generated opaque PNG is handled via browser canvas and normalized to JPEG.
        png=page.evaluate("""() => {
          const c=document.createElement('canvas');c.width=180;c.height=180;
          const ctx=c.getContext('2d');ctx.fillStyle='#684fc7';ctx.fillRect(0,0,180,180);
          ctx.fillStyle='#fff';ctx.fillRect(55,55,70,70);
          return c.toDataURL('image/png').split(',')[1];
        }""")
        page.locator('#avatar-file').set_input_files({
          'name':'synthetic.png','mimeType':'image/png','buffer':base64.b64decode(png)})
        page.wait_for_function("document.querySelector('#avatar-preview-img')?.hidden === false")
        assert state['post_avatar']==1
        assert page.locator('#avatar-preview-img').get_attribute('src').startswith('data:image/jpeg;base64,')
        page.locator('#avatar-remove').click()
        page.wait_for_function("document.querySelector('#avatar-preview-img')?.hidden === true")
        assert state['post_avatar']==2
        page.locator('#account-current-password').fill('synthetic-old-only')
        page.locator('#account-new-password').fill('synthetic-new-only')
        page.locator('#account-confirm-password').fill('not-matching')
        page.locator('#password-save').click()
        assert state['password']==0
        assert page.locator('#password-feedback').inner_text()
        page.locator('#account-confirm-password').fill('synthetic-new-only')
        page.locator('#password-save').click()
        page.wait_for_url(BASE+'/login?changed=1',timeout=15000)
        assert state['password']==1
        assert 'synthetic-old' not in page.url
        assert not errors,(width,errors)
        context.close()
        print('PASS R67 account center browser synthetic data',width,flush=True)
    finally:
      browser.close()
if __name__=='__main__':
  run()
