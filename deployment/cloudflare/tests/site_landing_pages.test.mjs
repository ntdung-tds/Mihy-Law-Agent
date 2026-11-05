import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const files={
 home:readFileSync('web/website/index.html','utf8'),
 private:readFileSync('web/website/private.html','utf8'),
 service:readFileSync('web/website/subscription.html','utf8'),
 login:readFileSync('web/website/login.html','utf8'),
 workspace:readFileSync('web/r0-preview/index.html','utf8'),
 css:readFileSync('web/website/styles.css','utf8')
};
const {home,private:privatePage,service,login,workspace,css}=files;

test('correct Mihy Agent and Mihy Law AI Agent branding on all live-facing pages',()=>{
 for(const [key,html] of Object.entries({home,private:privatePage,service,login,workspace})){
  assert.ok(html.includes('Mihy Law AI Agent'),key+' product identity');
  assert.doesNotMatch(html,/MihiAgent|Mihi Agent|MIHIAGENT|AI<span>LAW<\/span>/,key+' stale name');
 }
 assert.match(home,/BY MIHY AGENT/);
 assert.match(privatePage,/Mihy Agent/);
 assert.match(service,/Mihy Agent/);
 assert.match(login,/<title>Đăng nhập \| Mihy Law AI Agent<\/title>/);
});

test('both landing pages have comparable editorial depth and full nav',()=>{
 const pages=[['private',privatePage],['service',service]];
 for(const [key,html] of pages){
  assert.ok((html.match(/<section\b/g)||[]).length>=8,key+' section count');
  assert.ok(html.length>=13000,key+' editorial length');
  assert.ok((html.match(/<details>/g)||[]).length>=5,key+' FAQ depth');
  for(const id of ['main','detail-title','advantages','questions']) {
   if(key==='service' && id==='advantages')continue;
   assert.ok(html.includes('id="'+id+'"'),key+' missing '+id);
  }
  assert.match(html,/id="menu-toggle"/);
  assert.match(html,/id="mobile-menu"/);
  assert.match(html,/href="\/site.css"/);
  assert.match(html,/src="\/site.js"/);
  assert.match(html,/href="\/trien-khai-rieng"/);
  assert.match(html,/href="\/dich-vu-theo-goi"/);
  assert.match(html,/class="site-footer detail-footer"/);
 }
 assert.match(privatePage,/id="architecture"/);
 assert.match(privatePage,/id="journey"/);
 assert.match(service,/id="packages"/);
 assert.match(service,/id="journey"/);
 assert.match(home,/href="\/trien-khai-rieng"/);
 assert.match(home,/href="\/dich-vu-theo-goi"/);
 assert.equal((home.match(/class="solution-card solution-/g)||[]).length,2);
});

test('private deployment accurately explains management, AI costs and staged integrations',()=>{
 for(const phrase of [
  'Chủ động quản trị','Chủ động dữ liệu','Chủ động dịch vụ AI',
  'Google Drive','OneDrive','NAS','máy chủ',
  'phí dùng AI','điều kiện của nhà cung cấp',
  'quyền sở hữu mã nguồn','không mặc định bao gồm chuyển giao',
  'chưa tiếp nhận hồ sơ khách hàng thật'
 ])assert.ok(privatePage.toLowerCase().includes(phrase.toLowerCase()),phrase);
 assert.doesNotMatch(privatePage,/đã tích hợp tất cả|100% an toàn|cam kết tiết kiệm \d+%/i);
});

test('subscription remains future-only: no invented prices, entitlement, payment, order buttons',()=>{
 for(const phrase of [
  'ĐANG PHÁT TRIỂN','chưa mở bán','không có chức năng đăng ký',
  'Chưa công bố giá & hạn mức','minh họa định hướng phân gói',
  'không phải sản phẩm đang bán','môi trường thử nghiệm',
  'chưa có chính sách chính thức'
 ])assert.ok(service.toLowerCase().includes(phrase.toLowerCase()),phrase);
 for(const rejected of ['₫/tháng','đăng ký ngay','trả tiền ngay','100%','tiết kiệm 95%'])assert.ok(!service.toLowerCase().includes(rejected.toLowerCase()),rejected);
 assert.ok(!service.includes('<form'));
 assert.ok(!privatePage.includes('<form'));
});

test('shared visual system gives equal card prominence and mobile breakpoints',()=>{
 for(const token of [
 '.solution-private,.solution-service{',
 '.solution-private .solution-action,.solution-service .solution-action{',
 '.detail-hero-grid{display:grid;',
 '.detail-value-grid{display:grid;',
 '.detail-tiers{display:grid;',
 '@media(max-width:700px){',
 '.detail-hero-grid{grid-template-columns:minmax(0,1fr);',
 '.detail-tiers{grid-template-columns:minmax(0,1fr);',
 '@media(max-width:380px){'
 ])assert.ok(css.includes(token),'missing '+token);
 assert.ok(css.includes('.detail-saas .detail-hero'));
 assert.ok(css.includes('.detail-private .detail-hero'));
});
