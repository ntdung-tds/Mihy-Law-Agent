"""Mẫu 11: real Chromium checks against public NONPRODUCTION Workers only."""
import os
from playwright.sync_api import sync_playwright

BASE=os.environ.get("MIHY_SITE_URL","https://ai-law-web-qa.iaict-platform.workers.dev").rstrip("/")
ROUTES=("/", "/gioi-thieu", "/giai-phap", "/chuc-nang", "/an-toan-du-lieu",
        "/trien-khai-rieng", "/dich-vu-theo-goi")
WIDTHS=(320,350,390,430,700,768,1024,1440)
FIRST="Tra cứu & soạn thảo văn bản pháp lý bằng AI"
SECOND="Hai giải pháp linh hoạt:"
THIRD="Dữ liệu của bạn được bảo mật"

def check_layout(page, route, width):
    response=page.goto(BASE+route,wait_until="domcontentloaded",timeout=40000)
    assert response and response.status==200,(route,width,"HTTP",response.status if response else None)
    page.evaluate("document.fonts.ready")
    meta=page.evaluate("""() => {
      const q=s=>document.querySelector(s), cs=x=>getComputedStyle(x);
      const r=x=>{let a=x.getBoundingClientRect();return {left:a.left,right:a.right,width:a.width,height:a.height,top:a.top,bottom:a.bottom};};
      const ticker=q('.announcement,.detail-announcement'), line=q('.mihy11-line');
      const text=q('.announcement-copy,.detail-announcement-copy'), a=q('.announcement-action,.detail-announcement-action');
      return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
       banner:r(ticker), header:r(q('.site-header')),brand:r(q('.site-header .brand')),
       lineFont:cs(line).fontSize,lineHeight:cs(line).lineHeight,
       textDisplay:cs(text).display,anchorDisplay:cs(a).display,
       link:r(a),dotsDisplay:cs(q('.mihy08-dots')).display,
       tilt:cs(q('.brand-symbol')).transform,
       linkPrev:a.previousElementSibling===text,
       anchor:a.getAttribute('href'),linkColor:cs(a).color,
       login:q('.site-header .login-link').getAttribute('href')};
    }""")
    assert meta["overflow"]<=3,(route,width,"horizontal overflow",meta)
    assert meta["banner"]["height"]<=110,(route,width,"banner too tall",meta)
    assert meta["header"]["height"]<=76,(route,width,"header too tall",meta)
    assert meta["tilt"]!="none" and meta["login"]=="/login",(route,width,"header",meta)
    assert meta["linkPrev"] and meta["textDisplay"]=="inline" and meta["anchorDisplay"]=="inline",(route,width,"inline text+CTA",meta)
    assert meta["anchor"]==("#benefits" if route=="/" else "/#benefits"),(route,width,"wrong first destination",meta)
    assert page.locator('.mihy08-prev,.mihy08-next,.mihy08-close').count()==0,(route,width,"unwanted buttons")
    assert page.locator('.mihy08-dots button').count()==3,(route,width,"dot count")
    assert FIRST in page.locator('.mihy11-line').inner_text(),(route,width,"content")
    if width<=700:
      assert meta["dotsDisplay"]=="none",(route,width,"dots not hidden on mobile",meta)
      expected=10.3 if width<=350 else 10.8
      assert abs(float(meta["lineFont"][:-2])-expected)<.15,(route,width,"mobile text size",meta)
      assert meta["header"]["height"]<=68,(route,width,"mobile navbar oversized",meta)
    else:
      assert meta["dotsDisplay"]!="none",(route,width,"desktop dots hidden",meta)
      assert abs(float(meta["lineFont"][:-2])-12.7)<.15,(route,width,"desktop text size",meta)
    if width<=970:
      page.locator("#menu-toggle").click()
      assert page.locator("#mobile-menu").is_visible(),(route,width,"burger")
      assert page.locator("#mobile-menu a").count()==7
      page.keyboard.press("Escape")
      assert page.locator("#mobile-menu").is_hidden(),(route,width,"Escape")
    else: assert page.locator('.desktop-nav').is_visible(),(route,width)
    print("M11 LAYOUT PASS",route,width,flush=True)

def dots_manual(browser,route):
    c=browser.new_context(viewport={"width":1024,"height":900})
    p=c.new_page()
    p.goto(BASE+route,wait_until="domcontentloaded",timeout=40000)
    p.mouse.move(900,700)
    dots=p.locator(".mihy08-dots button")
    assert dots.nth(0).get_attribute("aria-pressed")=="true"
    dots.nth(1).click()
    assert SECOND in p.locator(".mihy11-line").inner_text()
    assert dots.nth(1).get_attribute("aria-pressed")=="true"
    assert p.locator(".mihy11-line a").get_attribute("href")=="/giai-phap"
    dots.nth(2).click()
    assert THIRD in p.locator(".mihy11-line").inner_text()
    assert p.locator(".mihy11-line a").get_attribute("href")=="/an-toan-du-lieu"
    dots.nth(0).click()
    assert FIRST in p.locator(".mihy11-line").inner_text()
    print("M11 DOTS PASS",route,flush=True)
    c.close()

def autoplay(browser,reduce=False):
    c=browser.new_context(viewport={"width":390,"height":844},reduced_motion="reduce" if reduce else "no-preference")
    p=c.new_page()
    p.goto(BASE+"/",wait_until="domcontentloaded",timeout=40000)
    p.mouse.move(350,700)
    assert FIRST in p.locator(".mihy11-line").inner_text()
    p.wait_for_timeout(4150)
    if reduce: assert FIRST in p.locator(".mihy11-line").inner_text(),"reduced-motion still auto cycles"
    else: assert SECOND in p.locator(".mihy11-line").inner_text(),"ticker did not autoplay after 3.8s"
    print("M11 AUTO PASS", "reduced-motion" if reduce else "regular",flush=True)
    c.close()

def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        for route in ROUTES:
            for width in WIDTHS:
                c=browser.new_context(viewport={"width":width,"height":900})
                check_layout(c.new_page(),route,width)
                c.close()
        for route in ("/","/gioi-thieu"):dots_manual(browser,route)
        autoplay(browser)
        autoplay(browser,True)
        browser.close()

if __name__=="__main__":run()
