"""R53: real Chrome visual geometry matching owner mobile screenshots.
Checks safe visual spacing, readability, announcement alignment, mobile legal seal,
short benefits ribbon and content depth, on nonproduction Mihy Law AI Agent Workers.
"""
import os
from playwright.sync_api import sync_playwright

BASE=os.environ.get('MIHY_SITE_URL','https://ai-law-web-qa.iaict-platform.workers.dev').rstrip('/')
WIDTHS=(320,360,375,390,393,414,430,600,768,1024,1440)
JS=r"""() => {
 const width=document.documentElement.clientWidth;
 const selectors=['.announcement-inner','.announcement-copy','.announcement-action','#hero-title',
  '.hero-headline-first','.hero-headline-accent','.hero-headline-last','.hero-law-medallion',
  '.hero-desc','.hero-buttons','.hero-baseline','.baseline-values>span',
  '.home-case-heading h2','.home-case-step','.home-perspective-art',
  '.home-perspective-copy h2','.home-perspective-points>div'];
 const clipped=[];
 for(const selector of selectors)for(const el of document.querySelectorAll(selector)){
  const r=el.getBoundingClientRect();
  if(r.width<1||r.height<1)continue;
  if(width<=768&&(r.left<-2||r.right>width+2))
   clipped.push({selector,left:Math.round(r.left),right:Math.round(r.right),width});
 }
 for(const selector of ['.hero-headline-first','.hero-headline-last','.home-case-heading h2','.home-perspective-copy h2']){
  for(const el of document.querySelectorAll(selector)){
   const tree=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
   while(node=tree.nextNode()){
    if(!node.textContent.trim())continue;
    const range=document.createRange();range.selectNodeContents(node);
    for(const r of range.getClientRects())if(r.width>1&&(r.left<-2||r.right>width+2))
      clipped.push({selector,text:node.textContent.slice(0,40),left:Math.round(r.left),right:Math.round(r.right)});
   }
  }
 }
 return {scroll:document.documentElement.scrollWidth-width,clipped};
}"""
def run():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  for width in WIDTHS:
   ctx=browser.new_context(viewport={'width':width,'height':900},device_scale_factor=1)
   page=ctx.new_page()
   errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   res=page.goto(BASE+'/',wait_until='domcontentloaded',timeout=30000)
   assert res.status==200,(width,res.status)
   page.locator('#hero-title').wait_for()
   page.evaluate('document.fonts.ready')
   page.wait_for_timeout(170)
   assert page.locator('.home-case-step').count()==4
   assert page.locator('.home-perspective-points>div').count()==3
   assert page.locator('.baseline-values>span').count()==3
   assert page.locator('.home-story').count()==4
   assert page.locator('.solution-card').count()==2
   assert page.locator('.contact-item').count()==4
   bounds=page.evaluate(JS)
   assert bounds['scroll']<=3 and not bounds['clipped'],('overflow',width,bounds)
   if width<=700:
    header=page.locator('.site-header').bounding_box()
    eyebrow=page.locator('.eyebrow').bounding_box()
    gap=eyebrow['y']-(header['y']+header['height'])
    assert 0<=gap<=60,('large header to headline gap',width,round(gap,2))
    first=page.locator('.hero-headline-first')
    assert first.inner_text()=='Sắc bén trong lập luận.'
    line=first.evaluate("""el=>{const range=document.createRange();range.selectNodeContents(el);const rects=[...range.getClientRects()];return {rectCount:rects.length,left:rects[0]?.left,right:rects[0]?.right,fontSize:parseFloat(getComputedStyle(el).fontSize)}}""")
    assert line['rectCount']==1,('first slogan line split',width,line)
    assert line['left']>=-1.5 and line['right']<=width+1.5,('first slogan clips',width,line)
    if width>=390:assert line['fontSize']>=28,('slogan too small',width,line)
    emblem=page.locator('.hero-law-medallion').bounding_box()
    emphasized=page.locator('.hero-headline-accent em').bounding_box()
    assert emblem['x']>=emphasized['x']+emphasized['width']+3,('emblem overlaps accent',width,emblem,emphasized)
    baseline=page.locator('.hero-baseline').bounding_box()
    assert baseline['height']<=145,('oversized baseline ribbons',width,baseline['height'])
    announcement=page.locator('.announcement-copy').bounding_box()
    content=page.locator('.hero-copy').bounding_box()
    assert abs(announcement['x']-content['x'])<=5,('announcement not left aligned with hero',width,announcement,content)
    ann=page.locator('.announcement').bounding_box()
    assert ann['height']<=100,('announcement too tall',width,ann['height'])
   if width<=970:
    page.locator('#menu-toggle').click()
    assert page.locator('#mobile-menu').is_visible()
    assert page.locator('#mobile-menu a').count()==7
    page.locator('#menu-toggle').click()
   assert not errors,('JS errors',width,errors)
   print('R53 PASS live home layout',width,'px',flush=True)
   ctx.close()
  browser.close()

if __name__=='__main__':run()
