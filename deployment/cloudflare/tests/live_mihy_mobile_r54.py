"""R54 screenshot-specific real Chromium QA: public mobile banner, compact
header-to-hero gap, yellow plain-text CTAs, footer grouped copyright and
text sizes on home + all six landing pages. No private credentials/data.
"""
import os
from playwright.sync_api import sync_playwright

BASE=os.environ.get("MIHY_SITE_URL","https://ai-law-web-qa.iaict-platform.workers.dev").rstrip("/")
HOME_WIDTHS=(320,360,375,390,414,430,768,1024,1440)
LANDING_WIDTHS=(320,375,390,430,768)
LANDINGS=("/gioi-thieu","/giai-phap","/chuc-nang","/an-toan-du-lieu",
          "/trien-khai-rieng","/dich-vu-theo-goi")
JS=r"""() => {
 const width=document.documentElement.clientWidth;
 const selectors=['.announcement-inner','.announcement-copy','.announcement-action',
  '.detail-announcement-inner','.detail-announcement-copy','.detail-announcement-action',
  '.detail-announcement-brand','.footer-copyright','.footer-disclaimer',
  '.editorial-hero h1','.detail-hero h1','.editorial-lede','.detail-lede',
  '.detail-footer-main nav a','.contact-item','.contact-item a'];
 const errors=[];
 for(const selector of selectors)for(const el of document.querySelectorAll(selector)){
  const r=el.getBoundingClientRect();
  if(r.width<1||r.height<1)continue;
  if(width<=768 && (r.left < -2||r.right>width+2))
    errors.push({selector,left:Math.round(r.left),right:Math.round(r.right),width});
 }
 return {scroll:document.documentElement.scrollWidth-width,errors};
}"""

def font(page,sel):
 return page.locator(sel).first.evaluate("e=>parseFloat(getComputedStyle(e).fontSize)")

def check(page,width,route):
 response=page.goto(BASE+route,wait_until="domcontentloaded",timeout=30000)
 assert response and response.status==200,(route,width,response.status if response else None)
 page.evaluate("document.fonts.ready")
 page.wait_for_timeout(100)
 copyright=page.locator(".footer-copyright")
 assert copyright.count()==1,(route,width,"copyright missing")
 assert " ".join(copyright.inner_text().split())=="© 2026 Mihy Agent",(route,width,copyright.inner_text())
 # A child year must not appear in a different row/column far from ©.
 positions=copyright.evaluate("""el=>{
  const y=el.querySelector('#footer-year').getBoundingClientRect(),
        c=el.getBoundingClientRect();
  return {left:c.left,right:c.right,yearLeft:y.left,yearTop:y.top,top:c.top,width:c.width};
 }""")
 assert positions["yearLeft"]>=positions["left"] and positions["yearLeft"]<positions["right"],(route,width,positions)
 if width<=430:assert positions["width"]<width-20,(route,width,"copyright width",positions)
 assert page.locator(".contact-item").count()==4,(route,width)
 bounds=page.evaluate(JS)
 assert bounds["scroll"]<=3 and not bounds["errors"],(route,width,"horizontal overflow",bounds)

 if route=="/":
  assert page.locator(".announcement-copy").count()==1
  assert "Khám phá điều làm nên khác biệt." in page.locator(".announcement").inner_text()
  link=page.locator(".announcement-action")
  assert link.count()==1
  style=link.evaluate("""e=>{const x=getComputedStyle(e);return {display:x.display,bg:x.backgroundColor,border:x.borderTopWidth,color:x.color,font:x.fontSize}}""")
  assert style["display"]=="inline",(route,width,"looks like pill",style)
  assert style["color"]=="rgb(247, 209, 118)",(route,width,"not golden text",style)
  assert style["border"]=="0px",(route,width,"bordered CTA",style)
  assert style["bg"]=="rgba(0, 0, 0, 0)",(route,width,"painted CTA",style)
  assert "Công nghệ đồng hành cùng tư duy pháp lý." in page.locator(".announcement").inner_text()
  if width<=700:
   copy=page.locator(".announcement-copy").bounding_box()
   hero=page.locator(".hero-copy").bounding_box()
   assert abs(copy["x"]-hero["x"])<=5,(route,width,"not aligned",copy,hero)
  assert page.locator("#solutions").count()==1
 else:
  ann=page.locator(".detail-announcement")
  assert ann.count()==1 and ann.locator(".detail-announcement-inner").count()==1
  assert ann.locator(".detail-announcement-brand").inner_text().startswith("MIHY AGENT")
  link=ann.locator(".detail-announcement-action")
  assert link.count()==1
  style=link.evaluate("""e=>{const x=getComputedStyle(e);return {display:x.display,bg:x.backgroundColor,border:x.borderTopWidth,color:x.color,font:x.fontSize}}""")
  assert style["display"]=="inline",(route,width,"looks like button",style)
  assert style["color"]=="rgb(247, 209, 118)",(route,width,"not gold",style)
  assert style["border"]=="0px",(route,width,"border",style)
  if width<=700:
   box=ann.bounding_box()
   assert box["height"]<=110,(route,width,"header banner too tall",box)
   header=page.locator(".site-header").bounding_box()
   overline=page.locator(".editorial-overline" if page.locator(".editorial-page").count() else ".detail-overline").first.bounding_box()
   gap=overline["y"]-(header["y"]+header["height"])
   assert 0<=gap<=65,(route,width,"large blank gap after logo",gap)
   if page.locator(".editorial-lede").count():
    assert font(page,".editorial-lede")>=13.9,(route,width,"small lede")
   elif page.locator(".detail-lede").count():
    assert font(page,".detail-lede")>=13.9,(route,width,"small lede")
   assert font(page,".detail-footer-main nav a")>=12.9,(route,width,"small footer links")
   assert page.locator(".footer-disclaimer").count()==1
 print("R54 PASS",route or "/",width,"px",flush=True)

def run():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  for width in HOME_WIDTHS:
   context=browser.new_context(viewport={"width":width,"height":900},device_scale_factor=1)
   page=context.new_page()
   check(page,width,"/")
   context.close()
  for route in LANDINGS:
   for width in LANDING_WIDTHS:
    context=browser.new_context(viewport={"width":width,"height":900},device_scale_factor=1)
    page=context.new_page()
    check(page,width,route)
    context.close()
  browser.close()

if __name__=="__main__":run()
