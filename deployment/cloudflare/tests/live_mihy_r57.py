"""R57 public marketing UI: consistent font, compact dual banners, restrained
section spacing and functional mobile navigation. Chromium on NONPRODUCTION only.
"""
import os
from playwright.sync_api import sync_playwright

BASE=os.environ.get("MIHY_SITE_URL","https://ai-law-web-qa.iaict-platform.workers.dev").rstrip("/")
WIDTHS=(320,360,390,430,700,768,1024,1440)
ROUTES=("/","/gioi-thieu","/giai-phap","/chuc-nang","/an-toan-du-lieu",
        "/trien-khai-rieng","/dich-vu-theo-goi")
SHORT=[".section",".faq-section",".cta-section",".home-case-journey",
       ".home-editorial",".home-perspective",".home-audience",".detail-section",
       ".deep-dive-section",".perspective-section",".editorial-story",
       ".editorial-choice",".detail-band",".detail-end"]

def check(page,width,route):
 response=page.goto(BASE+route,wait_until="domcontentloaded",timeout=35000)
 assert response and response.status==200,(route,width,"http")
 page.evaluate("document.fonts.ready")
 m=page.evaluate("""() => {
  const q=s=>document.querySelector(s), css=e=>getComputedStyle(e);
  const r=e=>{let b=e.getBoundingClientRect();return {left:b.left,right:b.right,width:b.width,height:b.height}};
  const intro=q('.announcement,.detail-announcement'),header=q('.site-header');
  const sections=[...document.querySelectorAll('main > section')];
  return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    family:css(document.body).fontFamily,bar:r(intro),header:r(header),
    brand:r(q('.brand')),burger:r(q('#menu-toggle')),
    sections:sections.map(e=>({kind:e.className,padTop:parseFloat(css(e).paddingTop),
       padBottom:parseFloat(css(e).paddingBottom),rect:r(e)})),
    login:q('.site-header .login-link')?.getAttribute('href'),
    solutions:q('.site-header .header-cta')?.getAttribute('href')};
 }""")
 assert m["overflow"]<=3,(route,width,"overflow",m)
 assert "Be Vietnam Pro" in m["family"],(route,width,"wrong font",m["family"])
 assert m["login"]=="/login" and m["solutions"]=="/giai-phap",(route,width,"header navigation")
 assert m["header"]["height"]<=75,(route,width,"oversized navbar",m["header"])
 assert m["bar"]["height"]<=90,(route,width,"oversized banner",m["bar"])
 assert m["brand"]["left"]>=-1 and m["brand"]["right"]<=width+2,(route,width,"clipped brand")
 if width<=700:
  assert m["header"]["height"]<=68,(route,width,"mobile navbar")
  assert m["burger"]["width"]>=43 and m["burger"]["height"]>=43,(route,width,"touch target")
  # First class is the hero. All regular sections now have a shared compact rhythm.
  for s in m["sections"]:
   if any(k in s["kind"].split() for k in [x[1:] for x in SHORT]):
    assert s["padTop"]<=44 and s["padBottom"]<=45,(route,width,"gapped section",s)
  if route=="/":
   assert page.locator(".announcement-sub").is_hidden(),(route,width)
  else:
   assert page.locator(".detail-announcement-copy").is_hidden(),(route,width)
 if width<=970:
  toggle=page.locator('#menu-toggle')
  toggle.click()
  assert page.locator('#mobile-menu').is_visible(),(route,width)
  assert page.locator('#mobile-menu a').count()==7,(route,width,"menu link count")
  page.keyboard.press('Escape')
  assert page.locator('#mobile-menu').is_hidden(),(route,width,"Escape navigation")
 else:
  assert page.locator('.desktop-nav').is_visible(),(route,width)
 print('R57 PASS',route,width,flush=True)

def run():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  for route in ROUTES:
   for width in WIDTHS:
    ctx=browser.new_context(viewport={"width":width,"height":900},device_scale_factor=1)
    page=ctx.new_page()
    check(page,width,route)
    ctx.close()
  browser.close()

if __name__=="__main__":run()
