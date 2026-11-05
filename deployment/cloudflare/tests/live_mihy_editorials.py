"""R51 real HTTPS Chromium smoke for four editorial landing pages and shared contact.
No logins, customer data or private credentials. Actual text and box geometry at
six viewport widths across both QA domains.
"""
import os
from playwright.sync_api import sync_playwright

BASE=os.environ.get('MIHY_SITE_URL','https://ai-law-web-qa.iaict-platform.workers.dev').rstrip('/')
WIDTHS=(320,375,390,430,768,1440)
PAGES=(
 ('/gioi-thieu','Công nghệ phụng sự'),
 ('/giai-phap','Chọn cách sử dụng.'),
 ('/chuc-nang','Không chỉ tạo câu trả lời.'),
 ('/an-toan-du-lieu','Niềm tin bắt đầu')
)
JS=r"""() => {
 const w=document.documentElement.clientWidth,clipped=[];
 const sels=['#editorial-title','.editorial-hero-art','.editorial-value-card','.editorial-story-illustration',
 '.editorial-story-grid h2','.editorial-choice h2','.editorial-choice-tiles',
 '.editorial-step','.contact-item','.contact-heading h2'];
 for(const selector of sels) for(const el of document.querySelectorAll(selector)){
  const r=el.getBoundingClientRect();
  if(r.width<1||r.height<1)continue;
  if(w<=970 && (r.left < -2||r.right>w+2))
   clipped.push({selector,left:Math.round(r.left),right:Math.round(r.right),width:w});
 }
 for(const selector of ['#editorial-title','.editorial-story h2','.editorial-choice h2','.contact-heading h2']){
  for(const el of document.querySelectorAll(selector)){
   const tree=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;
   while(n=tree.nextNode()){
    if(!n.textContent.trim())continue;
    const range=document.createRange();range.selectNodeContents(n);
    for(const rect of range.getClientRects())
     if(rect.width>=1&&(rect.left < -2||rect.right>w+2))
      clipped.push({selector,text:n.textContent.slice(0,38),left:Math.round(rect.left),right:Math.round(rect.right),width:w});
   }
  }
 }
 return {scroll:document.documentElement.scrollWidth-w,clipped};
}"""

def run():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  for width in WIDTHS:
   for route,heading in PAGES:
    context=browser.new_context(viewport={'width':width,'height':900},device_scale_factor=1)
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    response=page.goto(BASE+route,wait_until='domcontentloaded',timeout=30000)
    assert response.status==200,(route,width,response.status)
    page.locator('#editorial-title').wait_for()
    page.evaluate('document.fonts.ready')
    page.wait_for_timeout(150)
    assert heading in page.locator('#editorial-title').inner_text(),(route,width)
    assert page.locator('.editorial-value-card').count()==4
    assert page.locator('.editorial-step').count()==4
    assert page.locator('.detail-faq-list details').count()==4
    assert page.locator('.contact-item').count()==4
    assert page.locator('a[href="tel:+84588550000"]').count()==1
    assert page.locator('a[href="mailto:dungnt.myh@outlook.com"]').count()==1
    assert page.locator('.glyph-star').first.inner_text()=='⚖'
    assert not page.locator('#login-form').count()
    bounds=page.evaluate(JS)
    assert bounds['scroll']<=3,('scroll overflow',route,width,bounds)
    assert not bounds['clipped'],('clipped element or glyph',route,width,bounds['clipped'])
    if width<=970:
     page.locator('#menu-toggle').click()
     assert page.locator('#mobile-menu').is_visible()
     assert page.locator('#mobile-menu a[href="/giai-phap"]').count()==1
     page.locator('#mobile-menu a[href="/giai-phap"]').click()
     assert page.locator('#mobile-menu').is_hidden()
    assert not errors,('JS error',route,width,errors)
    context.close()
    print('R51 PASS editorial',route,width,'px',flush=True)
  browser.close()

if __name__=='__main__':run()
