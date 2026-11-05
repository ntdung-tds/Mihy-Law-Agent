"""R56 real Chromium: supplied-header-inspired typography, two compact
promo patterns, reachable menu/links and accessible dismiss controls.
Nonproduction only; no customer credentials or legal files.
"""
import os
from playwright.sync_api import sync_playwright

BASE=os.environ.get("MIHY_SITE_URL","https://ai-law-web-qa.iaict-platform.workers.dev").rstrip("/")
WIDTHS=(320,360,375,390,414,430,560,700,768,1024,1440)
ROUTES=("/","/gioi-thieu","/giai-phap","/chuc-nang","/an-toan-du-lieu",
        "/trien-khai-rieng","/dich-vu-theo-goi")

def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  for route in ROUTES:
   for width in WIDTHS:
    context=browser.new_context(viewport={"width":width,"height":900},device_scale_factor=1)
    page=context.new_page()
    response=page.goto(BASE+route,wait_until="domcontentloaded",timeout=35000)
    assert response and response.status==200,(route,width,"HTTP")
    page.evaluate("document.fonts.ready")
    banner=page.locator(".announcement,.detail-announcement").first
    assert banner.count()==1,(route,width,"banner missing")
    header=page.locator(".site-header")
    assert header.count()==1
    g=page.evaluate("""() => {
      const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right}};
      const sel=x=>document.querySelector(x);
      return {
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        banner:rect(sel('.announcement,.detail-announcement')),
        header:rect(sel('.site-header')),
        family:getComputedStyle(sel('.site-header')).fontFamily,
        logo:rect(sel('.site-header .brand-symbol')),
        burger:rect(sel('#menu-toggle')),
        close:rect(sel('[data-banner-dismiss]')),
        message:rect(sel('.announcement-copy,.detail-announcement-brand')),
        link:rect(sel('.announcement-action,.detail-announcement-action')),
        brand:rect(sel('.site-header .brand')),
        menuColor:getComputedStyle(sel('.site-header')).backgroundColor
      }
    }""")
    assert g["overflow"]<=3,(route,width,"overflow",g)
    assert "Be Vietnam Pro" in g["family"],(route,width,"wrong font",g)
    assert g["banner"]["h"]<=90,(route,width,"promo too tall",g)
    if width<=700:
     assert g["header"]["h"]<=72,(route,width,"header too tall",g)
     assert g["burger"]["w"]>=43 and g["burger"]["h"]>=43,(route,width,"small menu button",g)
     assert g["message"]["x"]>=-2 and g["link"]["right"]<=width+2,(route,width,"overflow item",g)
    if width<=560 and route!="/":
     assert page.locator('.detail-announcement-copy').is_hidden(),(route,width,"landing copy not compact")
    if width<=560 and route=="/":
     assert page.locator('.announcement-sub').is_hidden(),(route,width,"home copy not compact")
    if width<=970:
     page.locator('#menu-toggle').click()
     assert page.locator('#mobile-menu').is_visible(),(route,width,"menu not visible")
     assert page.locator('#mobile-menu a').count()==7
     assert page.locator('#mobile-menu a[href="/login"]').count()==1
     page.keyboard.press('Escape')
     assert page.locator('#mobile-menu').is_hidden(),(route,width,"Escape failed")
    page.locator('[data-banner-dismiss]').click()
    assert banner.is_hidden(),(route,width,"banner dismiss failed")
    assert page.locator(".site-header .brand").is_visible()
    print("R56 PASS",route,width,flush=True)
    context.close()
  browser.close()

if __name__=="__main__":main()
