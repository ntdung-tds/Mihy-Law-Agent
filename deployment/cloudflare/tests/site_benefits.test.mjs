import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('web/website/index.html','utf8');
const css=readFileSync('web/website/styles.css','utf8');
test('public Mihy Law AI Agent home communicates outcome and benefit rather than QA process',()=>{
 for(const phrase of [
   'Sắc bén trong lập luận.','Mạch lạc','trong từng hồ sơ.',
   'GIÁ TRỊ MIHY LAW AI AGENT MANG LẠI','Chuẩn bị văn bản','Nắm bắt hồ sơ',
   'Tiếp cận căn cứ','Tập trung chuyên môn','Mục tiêu: bớt công tìm kiếm',
   'Mihy Law AI Agent có gì khác công cụ AI dùng chung?',
   'Vai trò của luật sư khi có AI hỗ trợ là gì?'
 ])assert.ok(html.includes(phrase),phrase);
 for(const phrase of [
   'Có cần đăng nhập để dùng chức năng không?',
   'Từ đăng nhập đến','Truy cập không gian QA','Theo lộ trình SRS',
   'Đã có trên QA','Đang trong giai đoạn thử nghiệm QA',
   'Phiên bản hiện tại đang thử nghiệm QA',
   '>QA</span>','>R0</span>','>R1</span>'
 ])assert.ok(!html.includes(phrase),'Public copy must not center on technical status: '+phrase);
});
test('public claims remain transparent about legal AI and authorized data',()=>{
 assert.match(html,/nghiệp vụ AI chuyên sâu đang được hoàn thiện/);
 assert.match(html,/chưa tiếp nhận hồ sơ khách hàng thật/);
 assert.match(html,/được thiết kế|hướng đến/);
 assert.doesNotMatch(html,/\b100%\b|\b95%\b|tiết kiệm \d+%/i);
});
test('mobile fixes follow old min-width and respect CTA/hero boundaries',()=>{
 assert.ok(css.includes('@media(max-width:380px)'));
 assert.ok(css.lastIndexOf('.hero-visual .product-window{min-width:0;transform:none}')>css.indexOf('min-width:390px'),'320px override must win');
 for(const part of [
   '.hero-visual .product-window{width:100%;max-width:100%;min-width:0',
   '.hero-buttons{display:grid;grid-template-columns:minmax(0,1fr)',
   '.hero h1{font-size:clamp(36px,9.2vw,51px)',
   '.workspace-notebook{width:100%;max-width:100%;min-width:0;transform:none'
 ])assert.ok(css.includes(part),part);
});
test('public CTA and benefit section preserve direct navigation, SRS workspace unchanged',()=>{
 assert.match(html,/id="benefits"/);
 assert.match(html,/href="#benefits">Khám phá lợi ích/);
 assert.match(html,/href="\/login">Bắt đầu với Mihy Law AI Agent/);
 assert.match(html,/class="site-header"/);
 assert.match(html,/class="site-footer"/);
 assert.ok(html.includes('id="faq"'));
 assert.ok(html.includes('class="faq-list"'));
});

test('Mihy Agent offers exactly two prominent, distinct delivery models',()=>{
 assert.equal((html.match(/class="solution-card solution-/g)||[]).length,2);
 assert.ok(html.indexOf('id="solutions"')>html.indexOf('id="hero-title"'));
 assert.ok(html.indexOf('id="solutions"')<html.indexOf('id="features"'));
 for(const phrase of [
   'HAI GIẢI PHÁP TỪ MIHY AGENT','Mihy Agent cung cấp giải pháp',
   'Hệ thống của bạn.','Quyền chủ động của bạn.',
   'Thanh toán phí sử dụng AI','theo mức dùng','phân quyền và kiểm soát dữ liệu',
   'DỊCH VỤ MIHY LAW AI AGENT THEO GÓI','Chọn gói và sử dụng.',
   'hạn mức sử dụng','Đang phát triển','Dịch vụ chưa mở bán',
   'gói, mức phí và hạn mức sẽ được công bố'
 ])assert.ok(html.includes(phrase),'Missing grounded offering claim: '+phrase);
 assert.match(html,/id="faq-deployment"/);
 assert.match(html,/id="faq-saas"/);
 assert.match(html,/href="\/trien-khai-rieng"/);
 assert.match(html,/href="\/dich-vu-theo-goi"/);
 assert.match(html,/href="#solutions"/);
 assert.ok(!html.includes('10.000đ/tháng'));
 assert.ok(!html.includes('Đăng ký gói ngay'));
});
test('delivery model navigation and future-service honesty across mobile',()=>{
 const section=html.slice(html.indexOf('id="solutions"'),html.indexOf('id="features"'));
 assert.equal((section.match(/<article class="solution-card/g)||[]).length,2);
 assert.match(section,/mô hình dịch vụ trực tuyến/);
 assert.match(section,/dịch vụ Mihy Law AI Agent theo gói/);
 assert.match(section,/chưa mở bán/);
 assert.ok(css.includes('.solution-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'));
 assert.ok(css.includes('.solution-grid{grid-template-columns:minmax(0,1fr);gap:15px}'));
 assert.ok(css.includes('.solution-card{padding:23px 20px 22px}'));
 assert.ok(css.includes('.solution-private,.solution-service{'));
 assert.ok(css.includes('.solution-private .solution-action,.solution-service .solution-action{'));
 assert.ok(!html.includes('MihiAgent'));
 assert.ok(!html.includes('Mihi Agent'));
 assert.ok(!html.includes('MIHIAGENT'));
 assert.match(html,/href="\/gioi-thieu"/);
 assert.match(html,/href="\/giai-phap"/);
 assert.match(html,/href="\/chuc-nang"/);
 assert.match(html,/href="\/an-toan-du-lieu"/);
 assert.ok(html.includes('href="/login">Bắt đầu với Mihy Law AI Agent'));
});
