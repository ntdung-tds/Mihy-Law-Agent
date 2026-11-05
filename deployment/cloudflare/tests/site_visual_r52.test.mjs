import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root='web/website/';
const pages=['index.html','about.html','solutions.html','features.html','security.html','private.html','subscription.html'];
const loaded=Object.fromEntries(pages.map(p=>[p,readFileSync(root+p,'utf8')]));
const css=readFileSync(root+'styles.css','utf8'),script=readFileSync(root+'site.js','utf8');

test('hero text is a deliberate unbroken first line on mobile',()=>{
 const home=loaded['index.html'];
 assert.match(home,/<span class="hero-headline-line hero-headline-first">Sắc bén trong lập luận\.<\/span>/);
 assert.match(home,/class="hero-headline-line hero-headline-accent"/);
 assert.match(home,/class="hero-headline-line hero-headline-last"/);
 assert.ok(css.includes('.hero-headline-first{white-space:nowrap'));
 assert.ok(css.includes('.hero h1{font-size:clamp(23px,6.7vw,37px)'));
 assert.ok(css.includes('@media(max-width:380px){'));
});

test('every public landing presents the same seven-link polished mobile navigation',()=>{
 const expected=['/gioi-thieu','/giai-phap','/chuc-nang','/an-toan-du-lieu','/trien-khai-rieng','/dich-vu-theo-goi','/login'];
 for(const [filename,html] of Object.entries(loaded)){
  const nav=html.match(/<nav class="mobile-menu" id="mobile-menu"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav,filename+' missing menu');
  assert.equal((nav.match(/<a /g)||[]).length,7,filename+' menu links');
  assert.equal((nav.match(/class="mobile-menu-caption/g)||[]).length,2,filename+' section labels');
  for(const route of expected) assert.ok(nav.includes('href="'+route+'"'),filename+' missing '+route);
 }
 assert.ok(css.includes('.mobile-menu:not([hidden]){display:grid;'));
 assert.ok(css.includes('.mobile-menu .mobile-signin{'));
 assert.ok(css.includes('.mobile-menu-caption{'));
});

test('all landing pages expanded with meaningful analysis and legal decision principles',()=>{
 for(const [filename,html] of Object.entries(loaded)){
  if(filename==='index.html')continue;
  const expectedCount=['private.html','subscription.html'].includes(filename)?11:9;
  assert.ok((html.match(/<section\b/g)||[]).length>=expectedCount,filename+' sections');
  assert.equal((html.match(/class="deep-dive-card"/g)||[]).length,3,filename+' deep-dive cards');
  assert.match(html,/class="perspective-section"/);
  assert.match(html,/class="perspective-copy"/);
  assert.ok(html.length>=14000,filename+' narrative depth');
 }
});

test('unified purple branding and compact contact card on mobile',()=>{
 for(const token of [
  '.solution-service{background:radial-gradient(circle at 80% 13%,#9572b1',
  '.detail-saas .detail-hero{background:radial-gradient(ellipse at 80% 27%,#8e6ba26b',
  '.editorial-hero{background:radial-gradient(ellipse at 81% 24%,#9b73c65e',
  '.home-audience{background:linear-gradient(130deg,#241c42',
  '.contact-item{display:grid;grid-template-columns:44px minmax(0,1fr)',
  '.contact-item-icon{grid-column:1;grid-row:1 / 4',
  '.hero-desc{font-size:14px!important',
  '.detail-lede,.editorial-lede{font-size:14px!important'
 ])assert.ok(css.includes(token),token);
});

test('subtle entrance effects respect user motion preferences and never hide content',()=>{
 assert.ok(script.includes('IntersectionObserver'));
 assert.ok(script.includes("prefers-reduced-motion: reduce"));
 assert.ok(script.includes("classList.add('motion-enter')"));
 assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
 assert.ok(css.includes('@keyframes editorialReveal'));
 assert.ok(!css.includes('.motion-enter{opacity:0'));
});
