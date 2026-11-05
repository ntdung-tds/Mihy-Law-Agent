import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const base='web/website/';
const home=readFileSync(base+'index.html','utf8');
const css=readFileSync(base+'styles.css','utf8');
const articleFiles=[
 ['gioi-thieu','about.html','Giới thiệu'],
 ['giai-phap','solutions.html','Giải pháp'],
 ['chuc-nang','features.html','Chức năng'],
 ['an-toan-du-lieu','security.html','An toàn dữ liệu']
];
const details=[home,readFileSync(base+'private.html','utf8'),readFileSync(base+'subscription.html','utf8')];
const contact=readFileSync(base+'contact.html','utf8');

test('new hero message is polished, original repetition slogan removed',()=>{
 assert.match(home,/Sắc bén trong lập luận\./);
 assert.match(home,/Mạch lạc/);
 assert.doesNotMatch(home,/Bớt việc lặp lại\./);
 assert.equal((home.match(/class="home-story"/g)||[]).length,4);
 assert.equal((home.match(/class="home-audience-card"/g)||[]).length,3);
 assert.match(home,/id="stories"/);
 assert.match(home,/id="audiences"/);
 assert.ok(css.includes('.home-story-grid{'));
 assert.ok(css.includes('.home-audience-grid{'));
});

test('homepage/mobile menus point to independent, substantial editorial landings',()=>{
 const menu=home.match(/<nav class="mobile-menu" id="mobile-menu"[\s\S]*?<\/nav>/)?.[0];
 assert.ok(menu);
 for(const [url,file,label] of articleFiles){
  const html=readFileSync(base+file,'utf8');
  assert.match(menu,new RegExp('href="/'+url+'"'));
  assert.ok(html.includes('Mihy Law AI Agent'),url);
  assert.ok(html.includes('Mihy Agent'),url);
  assert.ok(html.length>=8000,url+' substantive depth');
  assert.ok((html.match(/<section\b/g)||[]).length>=6,url+' sections');
  assert.equal((html.match(/class="editorial-value-card"/g)||[]).length,4);
  assert.equal((html.match(/class="editorial-step"/g)||[]).length,4);
  assert.ok((html.match(/<details>/g)||[]).length>=4);
  assert.match(html,/id="menu-toggle"/);
  assert.match(html,/id="mobile-menu"/);
  assert.match(html,/class="site-footer detail-footer"/);
  assert.ok(!html.includes('MihiAgent'),url);
 }
});

test('all branding logos visibly use law scales instead of Claude-like asterisk',()=>{
 const pages=[...details,readFileSync(base+'login.html','utf8'),...articleFiles.map(x=>readFileSync(base+x[1],'utf8'))];
 for(const [i,html] of pages.entries()){
  assert.ok(html.includes('<span class="glyph-star">⚖</span>'),'law logo '+i);
  assert.ok(!html.includes('<span class="glyph-star">✳</span>'),'old star logo '+i);
 }
 assert.match(home,/<div class="mock-logo">M⚖<\/div>/);
 assert.ok(css.includes('.glyph-star{right:-13px'));
});

test('future hosted service uses refined ink-teal palette, equally visible card',()=>{
 assert.ok(css.includes('.solution-service{background:radial-gradient(circle at 88% 12%,#2d7f82'));
 assert.ok(css.includes('.detail-saas .detail-hero{background:radial-gradient(ellipse at 79%'));
 assert.ok(css.includes('.detail-band-saas{background:linear-gradient(120deg,#103945'));
 assert.ok(css.includes('.detail-end-saas{background:radial-gradient(ellipse at 30%'));
 assert.match(readFileSync(base+'subscription.html','utf8'),/chưa mở bán/i);
 assert.match(readFileSync(base+'subscription.html','utf8'),/không có chức năng đăng ký hoặc thanh toán/i);
});

test('Mihy Agent contact is exact, usable, and Facebook is not impersonated',()=>{
 for(const phrase of [
  'Số 9 Tôn Thất Thuyết, Cầu Giấy, Hà Nội',
  'href="tel:+84588550000"',
  'href="mailto:dungnt.myh@outlook.com"',
  'https://www.facebook.com/search/top?q=Mihy%20Agent',
  'chưa xác minh fanpage chính thức'
 ])assert.ok(contact.includes(phrase),phrase);
 assert.ok(!contact.includes('facebook.com/mihyagent'));
});

test('actual public Worker returns contact block on every editorial and legacy landing without weakening auth',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'mihy-editorial-'));
 try{
  const compiled=spawnSync(process.execPath,[resolve('tools/build_cf_site.mjs'),folder],{encoding:'utf8'});
  assert.equal(compiled.status,0,compiled.stderr||compiled.stdout);
  const {handleSite}=await import(pathToFileURL(join(folder,'site_worker.mjs')).href);
  const baseUrl='https://ai-law-web.iaict-platform.workers.dev';
  for(const url of ['/',...articleFiles.map(x=>'/'+x[0]),'/trien-khai-rieng','/dich-vu-theo-goi']){
   const response=await handleSite(new Request(baseUrl+url),{});
   assert.equal(response.status,200,url);
   const html=await response.text();
   assert.equal((html.match(/class="contact-section"/g)||[]).length,1,url);
   assert.match(html,/tel:\+84588550000/);
   assert.match(html,/mailto:dungnt\.myh@outlook\.com/);
   assert.ok(!html.includes('id="matter-form"'));
  }
  const unauth=await handleSite(new Request(baseUrl+'/app'),{QA_AUTH:{fetch:async()=>new Response('unauthorized',{status:401})}});
  assert.equal(unauth.status,302);
  assert.equal(unauth.headers.get('Location'),'/login');
 }finally{rmSync(folder,{recursive:true,force:true});}
});
