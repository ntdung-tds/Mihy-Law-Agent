"""R52 mobile visual acceptance tests on REAL Cloudflare QA URLs.
Tests the owner's screenshots: hero first line never splits "luận", coherent
seven-link menu, compact contact cards, readable font and six richer pages.
"""
import os
from playwright.sync_api import sync_playwright

BASE=os.environ.get('MIHY_SITE_URL','https://ai-law-web-qa.iaict-platform.workers.dev').rstrip('/')
HOME_WIDTHS=(320,360,375,390,414,430,768,1024)
PAGES=('/gioi-thieu','/giai-phap','/chuc-nang','/an-toan-du-lieu',
       '/trien-khai-rieng','/dich-vu-theo-goi')
SIZES=(320,390,768)
JS=r"""() => {
 const w=document.documentElement.clientWidth;
 const sel=['#hero-title','.hero-headline-first','.hero-buttons','.contact-item',
 '.deep-dive-card','.deep-dive-header h2','.perspective-copy h2',
 '.editorial-hero h1','.detail-hero h1'];
 const errors=[];
 for(const selector of sel)for(const el of document.querySelectorAll(selector)){
  const rect=el.getBoundingClientRect();
  if(rect.width<1 || rect.height<1)continue;
  if(w<=768 && (rect.left < -2 || rect.right>w+2))
   errors.push({selector,left:Math.round(rect.left),right:Math.round(rect.right)});
 }
 for(const selector of ['.hero-headline-first','.deep-dive-header h2','.perspective-copy h2']){
  for(const el of document.querySelectorAll(selector)){
   const tree=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;
   while(n=tree.nextNode()){
    if(!n.textContent.trim())continue;
    const range=document.createRange();range.selectNodeContents(n);
    for(const r of range.getClientRects()){
     if(r.width>1 && (r.left < -2 || r.right>w+2))
      errors.push({selector,text:n.textContent.slice(0,40),left:Math.round(r.left),right:Math.round(r.right)});
    }
   }
  }
 }
 return {errors,scroll:document.documentElement.scrollWidth-w};
}"""
def test_home(page,width):
 r=page.goto(BASE+'/',wait_until='domcontentloaded',timeout=30000)
 assert r.status==200,(width,r.status)
 page.locator('#hero-title').wait_for()
 page.evaluate('document.fonts.ready')
 page.wait_for_timeout(210)
 line=page.locator('.hero-headline-first')
 assert line.count()==1
 assert line.inner_text()=='Sắc bén trong lập luận.'
 first=line.evaluate('el=>{const r=document.createRange();r.selectNodeContents(el);const a=[...r.getClientRects()];return {count:a.length,width:a[0]?.width,rect:el.getBoundingClientRect().width}}')
 if width<=430:assert first['count']==1,('hero first line wraps',width,first)
 desc=page.locator('.hero-desc').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')
 if width<=430:assert desc>=13.9,('hero caption too small',width,desc)
 assert page.locator('.home-story').count()==4
 assert page.locator('.home-audience-card').count()==3
 assert page.locator('.solution-card').count()==2
 assert page.locator('.contact-item').count()==4
 check=page.evaluate(JS)
 assert check['scroll']<=3 and not check['errors'],('home geometry',width,check)
 if width<=970:
  page.locator('#menu-toggle').click()
  menu=page.locator('#mobile-menu')
  assert menu.is_visible()
  assert menu.locator('a').count()==7
  assert menu.locator('.mobile-menu-caption').count()==2
  assert menu.locator('a[href="/giai-phap"]').is_visible()
  if width<=430:
   size=menu.locator('a[href="/giai-phap"]').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')
   assert size>=14,('menu text too small',width,size)
   first_card=page.locator('.contact-item').first.bounding_box()
   assert first_card['height']<=175,('contact card tall',width,first_card)
  page.locator('#menu-toggle').click()
 assert page.locator('.mobile-menu').is_hidden() if width<=970 else True
 print('R52 PASS screenshot hero/menu/contact',width,flush=True)

def test_page(page,width,path):
 r=page.goto(BASE+path,wait_until='domcontentloaded',timeout=30000)
 assert r.status==200,(path,width,r.status)
 page.locator('.deep-dive-section').wait_for()
 page.evaluate('document.fonts.ready')
 page.wait_for_timeout(150)
 assert page.locator('.deep-dive-card').count()==3,(path,width)
 assert page.locator('.perspective-section').count()==1,(path,width)
 assert page.locator('.contact-item').count()==4
 assert page.locator('.mobile-menu a').count()==7
 check=page.evaluate(JS)
 assert check['scroll']<=3 and not check['errors'],('landing geometry',path,width,check)
 if width<=970:
  page.locator('#menu-toggle').click()
  assert page.locator('#mobile-menu').is_visible()
  menuheight=page.locator('#mobile-menu').bounding_box()['height']
  assert menuheight<=900,('menu too tall',path,width,menuheight)
  page.locator('#menu-toggle').click()
  assert page.locator('#mobile-menu').is_hidden()
 print('R52 PASS long-form visual',path,width,flush=True)

def run():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  for width in HOME_WIDTHS:
   context=browser.new_context(viewport={'width':width,'height':900},device_scale_factor=1)
   page=context.new_page()
   errors=[]
   page.on('pageerror',lambda err:errors.append(str(err)))
   test_home(page,width)
   assert not errors,('JS error home',width,errors)
   context.close()
  for width in SIZES:
   for path in PAGES:
    context=browser.new_context(viewport={'width':width,'height':900},device_scale_factor=1)
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    test_page(page,width,path)
    assert not errors,('JS error landing',width,path,errors)
    context.close()
  # Dedicated reduced-motion check: no entrance animations.
  context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
  page=context.new_page();page.goto(BASE+'/',wait_until='domcontentloaded')
  assert page.evaluate("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
  assert page.locator('.home-story.motion-enter').count()==0
  context.close()
  browser.close()
if __name__=='__main__':run()
