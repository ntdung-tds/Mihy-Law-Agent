"""R48 responsive visual-regression test against the REAL Cloudflare website.
Checks actual text glyph and element bounds, not just document scrollWidth (which
can be hidden by overflow:hidden). Browser images are not uploaded to GitHub.
"""
import os
from playwright.sync_api import sync_playwright

BASE=os.environ.get("AI_LAW_WEBSITE_URL","https://ai-law-web-qa.iaict-platform.workers.dev")
WIDTHS=(320,360,375,390,393,414,430,600,768,1024,1440)
GEOMETRY_JS=r"""() => {
 const width=document.documentElement.clientWidth;
 const cssSelectors=['#hero-title','.hero-buttons .button','.hero-visual .product-window',
 '.section-heading h2','.feature-card','.workspace-copy h2','.workspace-notebook',
 '.cta-panel h2','.cta-panel>a','.solution-card','.solution-card h3',
 '.solution-action','.solution-intro h2'];
 const bad=[];
 for(const selector of cssSelectors){
  for(const el of document.querySelectorAll(selector)){
   const rect=el.getBoundingClientRect();
   // Ignore decorative zero-size elements and transformed desktop illustration edges.
   if(rect.width<2||rect.height<2)continue;
   if(width<=700 && (rect.left < -1.5 || rect.right>width+1.5))
     bad.push({selector,left:Math.round(rect.left),right:Math.round(rect.right),width});
  }
 }
 for(const selector of ['#hero-title','.hero-buttons .button','.cta-panel h2',
   '.workspace-copy h2','.section-heading h2','.solution-card h3','.solution-intro h2']){
  for(const el of document.querySelectorAll(selector)){
   const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
   let n;
   while(n=w.nextNode()){
    if(!n.textContent.trim())continue;
    const range=document.createRange();
    range.selectNodeContents(n);
    for(const rect of range.getClientRects()){
      if(rect.width<1)continue;
      if(rect.left < -1.5 || rect.right>width+1.5)
        bad.push({selector,text:n.textContent.slice(0,40),
          left:Math.round(rect.left),right:Math.round(rect.right),width});
    }
   }
  }
 }
 return {bad,scrollOverflow:document.documentElement.scrollWidth-width};
}"""

def run():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  for width in WIDTHS:
   ctx=browser.new_context(viewport={"width":width,"height":900},device_scale_factor=1)
   page=ctx.new_page()
   errors=[]
   page.on("pageerror",lambda e:errors.append(str(e)))
   response=page.goto(BASE+'/',wait_until='domcontentloaded',timeout=30000)
   assert response.status==200,('home status',width,response.status)
   page.locator('#hero-title').wait_for()
   page.evaluate('document.fonts.ready')
   page.wait_for_timeout(180)
   text=page.locator('#hero-title').inner_text()
   assert 'Sắc bén trong lập luận.' in text,(width,text)
   assert page.locator('.solution-card').count()==2
   assert page.locator('.solution-private').is_visible()
   assert page.locator('.solution-service').is_visible()
   assert page.locator('#solutions').inner_text().count('Mihy Agent')>=2
   assert 'Dịch vụ chưa mở bán' in page.locator('.solution-service').inner_text()
   assert page.locator('.solution-private .solution-action').get_attribute('href')=='/trien-khai-rieng'
   assert page.locator('.solution-service .solution-action').get_attribute('href')=='/dich-vu-theo-goi'
   assert page.locator('.feature-card').count()==3
   assert page.locator('.footer-release-note').count()==1
   assert page.locator('text=Có cần đăng nhập để dùng chức năng không?').count()==0
   m=page.evaluate(GEOMETRY_JS)
   assert m['scrollOverflow']<=3,('horizontal scroll',width,m)
   assert not m['bad'],('clipped content',width,m['bad'])
   if width<=700:
    assert page.locator('.hero-visual .product-window').is_visible()
    assert page.locator('.hero-visual .product-window').evaluate('(e)=>getComputedStyle(e).minWidth')=='0px'
    assert page.locator('.hero-buttons .button').count()==2
    for button in page.locator('.hero-buttons .button').all():
      box=button.bounding_box()
      assert box['width']>=width-65,('CTA too narrow',width,box)
   if width<=970:
    page.locator('#menu-toggle').click()
    assert page.locator('#mobile-menu').is_visible()
    page.locator('#mobile-menu a[href="/giai-phap"]').click()
    assert page.locator('#mobile-menu').is_hidden()
   assert not errors,('JS errors',width,errors)
   if width<=700:
    for card in page.locator('.solution-card').all():
     box=card.bounding_box()
     assert box['width']>=width-65,('offering card too narrow',width,box)
     assert box['x']>=0 and box['x']+box['width']<=width+2,('offering clipped',width,box)
   print('R48 PASS visual mobile geometry',width,'px',flush=True)
   ctx.close()
  browser.close()

if __name__=='__main__':run()
