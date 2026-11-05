import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const names=['index.html','about.html','solutions.html','features.html','security.html','private.html','subscription.html'];
const pages=Object.fromEntries(names.map(n=>[n,readFileSync('web/website/'+n,'utf8')]));
const css=readFileSync('web/website/styles.css','utf8');
const p=css.slice(css.indexOf('/* R57:'));
test('R57 shared typeface and section rhythm',()=>{
 assert.match(css,/Be\+Vietnam\+Pro/);
 assert.match(p,/\.site-page main > :is\(/);
 assert.match(p,/padding-top:40px!important;padding-bottom:42px!important/);
 assert.match(p,/font-size:14\.2px!important/);
});
test('two editorial header patterns have mobile hide for secondary text, full copy remains',()=>{
 assert.match(p,/\.site-page \.announcement-sub\{display:none!important\}/);
 assert.match(p,/\.site-page \.detail-announcement-copy\{display:none!important\}/);
 assert.match(p,/color:#f7d176!important/);
 assert.match(pages['index.html'],/Tra cứu &amp; soạn thảo văn bản pháp lý bằng AI/);
 for(const h of Object.values(pages).slice(1))assert.match(h,/Tra cứu &amp; soạn thảo văn bản pháp lý bằng AI/);
});
test('unified seven public page headers preserve real links and 7-link mobile menus',()=>{
 for(const [name,html] of Object.entries(pages)){
  const h=html.match(/<header class="site-header[\s\S]*?<\/header>/)?.[0];
  assert.ok(h,name);
  assert.match(h,/class="login-link" href="\/login">Đăng nhập/);
  assert.match(h,/class="button button-dark header-cta" href="\/giai-phap">Khám phá giải pháp/);
  assert.match(h,/id="menu-toggle" aria-label="Mở menu"/);
  assert.equal((h.match(/<svg class="icon open-icon"/g)||[]).length,1);
  assert.equal((h.match(/class="mobile-signin"/g)||[]).length,1);
  assert.doesNotMatch(h,/Dùng thử miễn phí|Bảng giá/);
 }
 for(const [file,path] of Object.entries({'about.html':'/gioi-thieu','solutions.html':'/giai-phap','features.html':'/chuc-nang','security.html':'/an-toan-du-lieu'}))
  assert.ok(pages[file].includes('href="'+path+'" aria-current="page"'),file);
});
