"""Owner-approved MIHY Mẫu 08 header E2E on public NONPRODUCTION Worker.
Actual Chromium: all seven public routes, no login or real case files.
"""
import os
from playwright.sync_api import sync_playwright

BASE=os.environ.get("MIHY_SITE_URL","https://ai-law-web-qa.iaict-platform.workers.dev").rstrip("/")
ROUTES=("/","/gioi-thieu","/giai-phap","/chuc-nang","/an-toan-du-lieu",
        "/trien-khai-rieng","/dich-vu-theo-goi")
WIDTHS=(320,390,768,1024,1440)

def check(page,route,width):
 response=page.goto(BASE+route,wait_until="domcontentloaded",timeout=40000)
 assert response and response.status==200,(route,width,"HTTP")
 page.evaluate("document.fonts.ready")
 ticker=page.locator(".announcement,.detail-announcement")
 assert ticker.count()==1,(route,width,"ticker missing")
 m=page.evaluate("""() => {
 const t=document.querySelector('.announcement,.detail-announcement');
 const h=document.querySelector('.site-header');
 const r=e=>{const b=e.getBoundingClientRect();return {w:b.width,h:b.height,left:b.left,right:b.right}};
 return {
  doc:document.documentElement.scrollWidth-document.documentElement.clientWidth,
  ticker:r(t),nav:r(h),tilt:getComputedStyle(document.querySelector('.brand-symbol')).transform,
  mobileMessage:getComputedStyle(document.querySelector('.mihy08-mobile-copy')).display,
  normalMessage:getComputedStyle(document.querySelector('.mihy08-full-copy')).display,
  logo:r(document.querySelector('.site-header .brand')),
  login:document.querySelector('.site-header .login-link')?.getAttribute('href'),
  solution:document.querySelector('.site-header .header-cta')?.getAttribute('href')
 } }""")
 assert m["doc"]<=3,(route,width,"horizontal overflow",m)
 assert m["ticker"]["h"]<=104,(route,width,"ticker too tall",m)
 assert m["nav"]["h"]<=75,(route,width,"nav too tall",m)
 assert m["tilt"]!="none",(route,width,"tilted approved logo lost",m)
 assert m["login"]=="/login" and m["solution"]=="/giai-phap",(route,width,"real navigation",m)
 assert m["logo"]["left"]>=-1 and m["logo"]["right"]<=width+2,(route,width,"logo overflow",m)
 assert page.locator(".mihy08-prev").count()==1
 assert page.locator(".mihy08-next").count()==1
 assert page.locator(".mihy08-close").count()==1
 assert page.locator(".mihy08-dots button").count()==3
 assert page.locator(".mihy08-dots button.on").count()==1
 if width<=700:
  assert m["nav"]["h"]<=68,(route,width,"mobile navbar oversized")
  assert m["normalMessage"]=="none" and m["mobileMessage"]!="none",(route,width,"short message")
 if width<=970:
  assert page.locator(".menu-toggle").is_visible(),(route,width,"burger")
  page.locator(".menu-toggle").click()
  assert page.locator("#mobile-menu").is_visible(),(route,width)
  assert page.locator("#mobile-menu a").count()==7,(route,width)
  page.keyboard.press("Escape")
  assert page.locator("#mobile-menu").is_hidden(),(route,width)
 else:
  assert page.locator(".desktop-nav").is_visible(),(route,width)
 print("R58 LAYOUT PASS",route,width,flush=True)

def interactions(browser,route):
 context=browser.new_context(viewport={"width":390,"height":844},device_scale_factor=1)
 page=context.new_page()
 page.goto(BASE+route,wait_until="domcontentloaded",timeout=40000)
 banner=page.locator(".announcement,.detail-announcement")
 dots=page.locator(".mihy08-dots button")
 assert dots.nth(0).get_attribute("aria-pressed")=="true"
 page.locator(".mihy08-next").click()
 assert dots.nth(1).get_attribute("aria-pressed")=="true"
 assert page.locator(".announcement-action,.detail-announcement-action").get_attribute("href")=="/giai-phap"
 page.locator(".mihy08-next").click()
 assert dots.nth(2).get_attribute("aria-pressed")=="true"
 assert page.locator(".announcement-action,.detail-announcement-action").get_attribute("href")=="/gioi-thieu"
 page.locator(".mihy08-prev").click()
 assert dots.nth(1).get_attribute("aria-pressed")=="true"
 dots.nth(0).click()
 assert dots.nth(0).get_attribute("aria-pressed")=="true"
 page.locator(".mihy08-close").click()
 assert banner.is_hidden(),"close ticker failed"
 assert page.locator(".site-header").is_visible()
 print("R58 INTERACTIVE PASS",route,flush=True)
 context.close()

def no_motion(browser):
 context=browser.new_context(viewport={"width":390,"height":844},reduced_motion="reduce")
 page=context.new_page()
 page.goto(BASE+"/",wait_until="domcontentloaded",timeout=40000)
 assert page.locator(".mihy08-dots button.on").count()==1
 page.wait_for_timeout(4300)
 assert page.locator(".mihy08-dots button").nth(0).get_attribute("aria-pressed")=="true","reduced-motion rotated ticker"
 print("R58 REDUCED MOTION PASS",flush=True)
 context.close()

def autoplay(browser):
 context=browser.new_context(viewport={"width":390,"height":844})
 page=context.new_page()
 page.goto(BASE+"/",wait_until="domcontentloaded",timeout=40000)
 # Default Playwright pointer (0,0) can hover the top banner, which must pause
 # rotation per the approved sample. Move it away before testing autoplay.
 page.mouse.move(300,700)
 page.wait_for_timeout(4200)
 assert page.locator(".mihy08-dots button").nth(1).get_attribute("aria-pressed")=="true","autoplay did not reach second slide after 3.8s"
 print("R58 AUTO ROTATION PASS",flush=True)
 context.close()

def run():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  for route in ROUTES:
   for width in WIDTHS:
    ctx=browser.new_context(viewport={"width":width,"height":844},device_scale_factor=1)
    check(ctx.new_page(),route,width)
    ctx.close()
  for route in ("/","/gioi-thieu"):interactions(browser,route)
  no_motion(browser)
  autoplay(browser)
  browser.close()

if __name__=="__main__":run()
