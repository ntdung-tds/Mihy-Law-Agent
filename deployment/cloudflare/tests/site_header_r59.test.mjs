import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const names=['index.html','about.html','solutions.html','features.html','security.html','private.html','subscription.html'];
const h=names.map(n=>readFileSync('web/website/'+n,'utf8'));
const css=readFileSync('web/website/styles.css','utf8');
const js=readFileSync('web/website/site.js','utf8');
const patch=css.slice(css.indexOf('/* R59 —'));
test('Mẫu 11 approved inline CTA on all seven routes, with no close or arrow buttons',()=>{
 for(const html of h){
  assert.match(html,/class="mihy11-line"><span class="(?:announcement-copy|detail-announcement-copy)"/);
  assert.match(html,/Tìm hiểu thêm <span aria-hidden="true">↗<\/span>/);
  assert.match(html,/Tra cứu &amp; soạn thảo văn bản pháp lý bằng AI/);
  assert.doesNotMatch(html,/class="mihy08-(?:prev|next|close)"/);
  assert.equal((html.match(/class="mihy08-dots"/g)||[]).length,1);
  assert.doesNotMatch(html,/Thông điệp 1 ·/);
 }
});
test('Mobile 10.8px / 10.3px and dots hidden; desktop dots below inline text',()=>{
 assert.match(patch,/\.site-page \.mihy11-line\{font-size:10\.8px!important;line-height:1\.58!important/);
 assert.match(patch,/\.site-page \.mihy11-line\{font-size:10\.3px!important;line-height:1\.55!important/);
 assert.match(patch,/\.site-page \.announcement-inner>\.mihy08-dots,\.site-page \.detail-announcement-inner>\.mihy08-dots\{display:none!important\}/);
 assert.match(patch,/\.site-page \.mihy11-line\{/);
 assert.match(patch,/display:inline!important/);
 assert.match(patch,/justify-content:center!important/);
 assert.match(patch,/background:linear-gradient\(112deg,#171233/);
});
test('Exact user-approved Mẫu 11 messages and real public links rotate 3.8 seconds',()=>{
 for(const text of ['Tra cứu &amp; soạn thảo văn bản pháp lý bằng AI','nhanh hơn, vẫn chuẩn chuyên môn.',
  'Hai giải pháp linh hoạt:','triển khai riêng cho tổ chức','dùng theo gói.',
  'Dữ liệu của bạn được bảo mật','con người luôn là người quyết định cuối cùng.'])
  assert.ok(js.includes(text),text);
 for(const text of ["url:home?'#benefits':'/#benefits'","url:'/giai-phap'","url:'/an-toan-du-lieu'","setInterval(()=>show(index+1),3800)"])
  assert.ok(js.includes(text),text);
 assert.doesNotMatch(js,/const prev=banner\.querySelector/);
 assert.doesNotMatch(js,/close\.addEventListener/);
 assert.match(js,/prefers-reduced-motion: reduce/);
 assert.match(js,/banner\.addEventListener\('focusin',stop\)/);
});
