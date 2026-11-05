import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const home=readFileSync('web/website/index.html','utf8');
const css=readFileSync('web/website/styles.css','utf8');
const pages=['about.html','solutions.html','features.html','security.html','private.html','subscription.html']
 .map(file=>readFileSync('web/website/'+file,'utf8'));

test('R55 home makes the two delivery models distinct, accessible non-wrapping text links',()=>{
 const offer=home.match(/<div class="hero-offering hero-offering-choices"[\s\S]*?<\/div><\/div>/)?.[0];
 assert.ok(offer);
 assert.match(offer,/aria-label="Hai hình thức sử dụng Mihy Law AI Agent"/);
 assert.match(offer,/href="\/trien-khai-rieng">Triển khai riêng/);
 assert.match(offer,/href="\/dich-vu-theo-goi">Dịch vụ theo gói/);
 assert.equal((offer.match(/class="icon"/g)||[]).length,2);
 assert.doesNotMatch(offer,/Triển khai riêng cùng Mihy Agent hoặc sử dụng theo gói/);
 assert.match(css,/\.hero-offering\.hero-offering-choices \.hero-offering-choices-links a\{[^}]*white-space:nowrap/);
 assert.match(css,/\.hero-offering\.hero-offering-choices \.hero-offering-choices-links a \.icon\{[^}]*flex-shrink:0/);
});

test('R55 small mobile strip keeps the exact approved full home wording and warm gold action',()=>{
 for(const text of ['Tra cứu &amp; soạn thảo văn bản pháp lý bằng AI','nhanh hơn, vẫn chuẩn chuyên môn.','Tìm hiểu thêm'])assert.ok(home.includes(text));
 const mobile=css.slice(css.indexOf('/* R55 —'));
 assert.ok(mobile.includes('.announcement-copy,.announcement-action{font-size:11.2px!important'));
 assert.ok(mobile.includes('.announcement-inner{padding:7px 0 8px!important'));
 assert.ok(css.includes('color:#f7d176!important'));
});

test('R55 all landing pages retain banner content, with compact grid on mobile',()=>{
 for(const page of pages){
  assert.match(page,/class="mihy11-line"/);
  assert.match(page,/Tìm hiểu thêm/);
  assert.match(page,/Tra cứu &amp; soạn thảo văn bản pháp lý bằng AI/);
 }
 const override=css.slice(css.indexOf('/* R55 —'));
 assert.match(override,/\.detail-announcement-inner\{display:grid;grid-template-columns:auto minmax\(0,1fr\)/);
 assert.match(override,/\.detail-announcement-action\{grid-column:1\/-1;justify-self:start/);
 assert.ok(override.includes('.detail-announcement-copy{min-width:0;font-size:10.7px'));
});

test('R55 only changes public marketing presentation and retains the sign-in CTA',()=>{
 assert.match(home,/href="\/login">Bắt đầu với Mihy Law AI Agent/);
 assert.ok(!home.includes('Đăng ký gói ngay'));
 assert.match(home,/id="solutions"/);
});
