"""R55 real Chromium checks against NONPRODUCTION QA Worker.
No customer credentials, files or private API requests.
"""
import os
from playwright.sync_api import sync_playwright

BASE=os.environ.get("MIHY_SITE_URL","https://ai-law-web-qa.iaict-platform.workers.dev").rstrip("/")
WIDTHS=(320,360,375,390,414,430,768,1440)
PAGES=("/","/gioi-thieu","/giai-phap","/chuc-nang","/an-toan-du-lieu",
       "/trien-khai-rieng","/dich-vu-theo-goi")

def run():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  for route in PAGES:
   for width in WIDTHS:
    context=browser.new_context(viewport={"width":width,"height":900},device_scale_factor=1)
    page=context.new_page()
    resp=page.goto(BASE+route,wait_until="domcontentloaded",timeout=30000)
    assert resp and resp.status==200,(route,width,"bad HTTP status")
    page.evaluate("document.fonts.ready")
    metrics=page.evaluate("""() => ({
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      bar:document.querySelector('.announcement,.detail-announcement')?.getBoundingClientRect().height||0
    })""")
    assert metrics["overflow"]<=3,(route,width,metrics)
    if route=="/":
     assert page.locator(".announcement-action").count()==1
     assert page.locator(".hero-offering-choices-links a").count()==2
     assert page.locator(".hero-offering-choices-links a").nth(0).get_attribute("href")=="/trien-khai-rieng"
     assert page.locator(".hero-offering-choices-links a").nth(1).get_attribute("href")=="/dich-vu-theo-goi"
     m=page.evaluate("""() => ({
      kicker:parseFloat(getComputedStyle(document.querySelector('.hero-offering-kicker')).fontSize),
      offeringHeight:document.querySelector('.hero-offering-choices').getBoundingClientRect().height,
      arrows:[...document.querySelectorAll('.hero-offering-choices-links a')].map(a=>{
       let t=a.getBoundingClientRect(),s=a.querySelector('svg').getBoundingClientRect();
       return {linkLeft:t.left,linkRight:t.right,arrowRight:s.right,arrowTop:s.top,linkTop:t.top,deltaY:s.top-t.top}
      })
     })""")
     assert m["kicker"]<=10.5,(width,m)
     assert all(a["arrowRight"]<=a["linkRight"]+2 and a["deltaY"]<15 for a in m["arrows"]),(width,m)
     if width<=430:
      assert metrics["bar"]<=100,(width,"home banner height",metrics)
      assert m["offeringHeight"]<=105,(width,"offering too tall",m)
    else:
     if width<=430:
      assert metrics["bar"]<=84,(route,width,"landing banner too tall",metrics)
      f=page.locator(".detail-announcement-copy").evaluate("e=>parseFloat(getComputedStyle(e).fontSize)")
      assert f<=11.1,(route,width,"banner copy too large",f)
     assert page.locator(".detail-announcement-action").count()==1
    print("R55 PASS",route,width,flush=True)
    context.close()
  browser.close()

if __name__=="__main__":run()
