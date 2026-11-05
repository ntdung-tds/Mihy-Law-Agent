import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('web/website/index.html','utf8');
const css=readFileSync('web/website/styles.css','utf8');
test('public AI Law home communicates outcome and benefit rather than QA process',()=>{
 for(const phrase of [
   'Bớt việc lặp lại','Thêm thời gian','cho pháp lý.',
   'GIÁ TRỊ AI LAW MANG LẠI','Chuẩn bị văn bản','Nắm bắt hồ sơ',
   'Tiếp cận căn cứ','Tập trung chuyên môn','Mục tiêu: bớt công tìm kiếm',
   'AI Law có gì khác công cụ AI dùng chung?',
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
 assert.match(html,/href="\/login">Bắt đầu với AI Law/);
 assert.match(html,/class="site-header"/);
 assert.match(html,/class="site-footer"/);
 assert.ok(html.includes('id="faq"'));
 assert.ok(html.includes('class="faq-list"'));
});
