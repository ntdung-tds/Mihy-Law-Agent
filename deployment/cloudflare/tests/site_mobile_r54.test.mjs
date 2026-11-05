import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const base='web/website/';
const sources=['index.html','about.html','solutions.html','features.html','security.html','private.html','subscription.html'];
const pages=Object.fromEntries(sources.map(file=>[file,readFileSync(base+file,'utf8')]));
const css=readFileSync(base+'styles.css','utf8');

test('home announcement uses original full copy, warm gold plain text link on left',()=>{
 const home=pages['index.html'];
 const banner=home.match(/<div class="announcement"><div class="container announcement-inner">[\s\S]*?<\/div><\/div>/)?.[0];
 assert.ok(banner);
 for(const expected of [
   'Tra cứu &amp; soạn thảo văn bản pháp lý bằng AI',
   'nhanh hơn, vẫn chuẩn chuyên môn.',
   'Tìm hiểu thêm',
   'class="announcement-action"'
 ])assert.ok(banner.includes(expected),expected);
 assert.doesNotMatch(banner,/class="pulse-dot"/);
 assert.ok(css.includes('.announcement-action{display:inline!important'));
 assert.ok(css.includes('color:#f7d176!important'));
 assert.ok(css.includes('.announcement-inner{display:block'));
});

test('all six landing banners are short, left-aligned and use a warm yellow editorial link',()=>{
 const sources=Object.entries(pages).filter(([f])=>f!=='index.html');
 for(const [file,page] of sources){
  const banner=page.match(/<div class="detail-announcement"><div class="container detail-announcement-inner">[\s\S]*?<\/div><\/div>/)?.[0];
  assert.ok(banner,'missing structured banner '+file);
  assert.match(banner,/Tra cứu &amp; soạn thảo văn bản pháp lý bằng AI/);
  assert.match(banner,/Tìm hiểu thêm/);
  assert.match(banner,/href="\/#benefits" class="detail-announcement-action">Tìm hiểu thêm/);
  assert.ok(!banner.includes('✳') && !banner.includes('✦'),file);
 }
 assert.ok(css.includes('.detail-announcement-inner{display:flex;align-items:center'));
 assert.ok(css.includes('.detail-announcement-action{display:inline!important'));
 assert.ok(css.includes('.detail-announcement-inner{display:flex;flex-direction:column;align-items:flex-start;'));
});

test('year and company remain in one grouped copyright across ALL marketing pages',()=>{
 for(const [file,page] of Object.entries(pages)){
  assert.equal((page.match(/id="footer-year"/g)||[]).length,1,file);
  assert.match(page,/<span class="footer-copyright">© <span id="footer-year">2026<\/span> Mihy Agent<\/span>/,file);
  if(file!=='index.html'){
   assert.match(page,/class="footer-disclaimer"/,file);
   assert.ok(!page.includes('class="container detail-footer-bottom">© <span'),file);
  }
 }
 assert.ok(css.includes('.detail-footer-bottom .footer-copyright{display:inline-flex'));
 assert.ok(css.includes('white-space:nowrap'));
});

test('mobile fonts and hero offsets improved without changing product/workspace capabilities',()=>{
 for(const token of [
  '.editorial-hero-grid{padding-top:30px!important',
  '.detail-hero-grid{padding-top:29px!important',
  '.editorial-lede,.detail-lede{font-size:14px!important',
  '.detail-footer-main nav a{font-size:13px',
  '.detail-faq-list details summary,.faq-list details summary{font-size:14px!important',
  '.detail-footer-bottom{display:flex;flex-direction:column;align-items:flex-start'
 ])assert.ok(css.includes(token),token);
 assert.ok(!pages['index.html'].includes('Đăng ký gói ngay'));
 assert.ok(pages['subscription.html'].includes('chưa mở bán'));
});
