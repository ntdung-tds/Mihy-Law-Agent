"""R50: inspect both real Mihy Law AI Agent public landing pages in Chromium.
No credentials or customer data. Checks actual geometry and text boxes, not CSS
overflow-hidden alone, and exercises the real mobile navigation.
"""
import os
from playwright.sync_api import sync_playwright

BASE=os.environ.get('MIHY_SITE_URL','https://ai-law-web-qa.iaict-platform.workers.dev').rstrip('/')
WIDTHS=(320,360,375,390,393,414,430,600,768,1024,1440)
PAGES=(
 ('/trien-khai-rieng','AI pháp lý của bạn.','#advantages'),
 ('/dich-vu-theo-goi','Việc pháp lý của bạn.','#experience')
)
GEOMETRY=r"""() => {
 const width=document.documentElement.clientWidth;
 const selectors=['.detail-hero h1','.detail-art','.detail-hero-ctas .detail-button',
 '.detail-section-head h2','.detail-section-head>p','.detail-tier','.detail-value',
 '.detail-use-grid>article','.detail-faq-list summary','.detail-footer-main',
 '.detail-package-notice'];
 const clipped=[];
 for(const selector of selectors){
  for(const el of document.querySelectorAll(selector)){
   const b=el.getBoundingClientRect();
   if(b.width<1||b.height<1)continue;
   if(width<=970 && (b.left < -2 || b.right>width+2))
    clipped.push({selector,left:Math.round(b.left),right:Math.round(b.right),width});
  }
 }
 for(const selector of ['.detail-hero h1','.detail-section-head h2','.detail-faq-grid h2','.detail-end h2']){
  for(const el of document.querySelectorAll(selector)){
   const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
   let t;
   while(t=walker.nextNode()){
    if(!t.textContent.trim())continue;
    const range=document.createRange();range.selectNodeContents(t);
    for(const b of range.getClientRects()){
     if(b.width>=1 && (b.left < -2 || b.right>width+2))
      clipped.push({selector,text:t.textContent.slice(0,40),left:Math.round(b.left),right:Math.round(b.right),width});
    }
   }
  }
 }
 return {scrollOverflow:document.documentElement.scrollWidth-width,clipped};
}"""

def verify(page,path,heading,anchor,width):
 response=page.goto(BASE+path,wait_until='domcontentloaded',timeout=30000)
 assert response.status==200,(path,width,response.status)
 page.locator('#detail-title').wait_for()
 page.evaluate('document.fonts.ready')
 page.wait_for_timeout(190)
 assert heading in page.locator('#detail-title').inner_text(),(path,width)
 assert 'Mihy Law AI Agent' in page.title()
 assert page.locator('.detail-value').count()==4,(path,width,'values')
 assert page.locator('.detail-faq-list details').count()>=5
 assert page.locator('.detail-steps article').count()==4
 assert page.locator('.detail-art').is_visible()
 assert page.locator('.detail-end-actions a').count()==2
 assert page.locator('a[href="/trien-khai-rieng"]').count()>=1
 assert page.locator('a[href="/dich-vu-theo-goi"]').count()>=1
 assert page.locator('#login-form').count()==0
 if path=='/dich-vu-theo-goi':
  assert page.locator('.detail-tier').count()==3
  assert 'chưa mở bán' in page.locator('body').inner_text().lower()
  assert page.locator('form').count()==0
 else:
  assert page.locator('.architecture-flow-row>div').count()==3
 m=page.evaluate(GEOMETRY)
 assert m['scrollOverflow']<=3,(path,width,'horizontal scroll',m)
 assert not m['clipped'],(path,width,'clipped visible content',m['clipped'])
 if width<=970:
  page.locator('#menu-toggle').click()
  assert page.locator('#mobile-menu').is_visible()
  page.locator('#mobile-menu a[href="'+anchor+'"]').click()
  assert page.locator('#mobile-menu').is_hidden()
 print('R50 PASS live landing',path,width,'px',flush=True)

def run():
 with sync_playwright() as playwright:
  browser=playwright.chromium.launch(headless=True)
  for width in WIDTHS:
   for path,heading,anchor in PAGES:
    ctx=browser.new_context(viewport={'width':width,'height':900},device_scale_factor=1)
    page=ctx.new_page()
    errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    verify(page,path,heading,anchor,width)
    assert not errors,(path,width,'JS errors',errors)
    ctx.close()
  browser.close()

if __name__=='__main__':
 run()
