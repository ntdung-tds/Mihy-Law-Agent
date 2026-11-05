import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync('web/website/index.html','utf8');
const css=readFileSync('web/website/styles.css','utf8');
test('announcement is in a true left aligned container with a distinct benefit CTA',()=>{
 assert.match(html,/class="container announcement-inner"/);
 assert.match(html,/class="announcement-copy"/);
 assert.match(html,/class="announcement-action"/);
 assert.ok(css.includes('.announcement-inner{display:flex;align-items:center'));
 assert.ok(css.includes('.announcement{padding:0 0;justify-content:initial;text-align:left'));
});
test('hero slogan preserves approved copy and balances the purple legal emblem',()=>{
 assert.match(html,/<span class="hero-headline-line hero-headline-first">Sắc bén trong lập luận\.<\/span>/);
 assert.match(html,/<span class="hero-headline-line hero-headline-accent"><em>Mạch lạc<\/em><span class="hero-law-medallion"/);
 assert.match(html,/class="hero-headline-line hero-headline-last">trong từng hồ sơ\./);
 assert.ok(css.includes('.hero-law-medallion{display:inline-grid'));
 assert.ok(css.includes('.hero-grid{min-height:0!important;padding-top:21px!important'));
 assert.ok(css.includes('.hero h1{font-size:clamp(26px,7.55vw,35px)!important'));
 assert.ok(!html.includes('Bớt việc lặp lại.'));
});
test('three benefits are concise, low-tracking cards not massive uppercase ribbons',()=>{
 assert.match(html,/class="container hero-baseline" aria-label="Ba giá trị thiết kế"/);
 const block=html.match(/<div class="container hero-baseline"[\s\S]*?<\/div><\/div>/)?.[0];
 assert.ok(block);
 assert.equal((block.match(/<b>0[1-3]<\/b>/g)||[]).length,3);
 assert.match(block,/Hồ sơ có tổ chức/);
 assert.match(block,/Lập luận có căn cứ/);
 assert.match(block,/Chuyên môn là trọng tâm/);
 assert.ok(css.includes('.hero-baseline .baseline-values>span{display:flex;align-items:center'));
 assert.ok(css.includes('#solutions{padding-top:56px;padding-bottom:58px}'));
});
test('new homepage chapters add depth without claiming AI functions are already released',()=>{
 assert.ok(html.indexOf('id="case-journey"')<html.indexOf('id="stories"'));
 assert.ok(html.indexOf('id="expertise"')<html.indexOf('id="audiences"'));
 assert.equal((html.match(/class="home-case-step"/g)||[]).length,4);
 assert.equal((html.match(/class="home-perspective-points"/g)||[]).length,1);
 assert.equal((html.match(/class="perspective-art-symbol"/g)||[]).length,3);
 assert.ok(html.includes('lộ trình phát triển'));
 assert.ok(html.includes('phải được chuyên gia xác minh'));
 assert.ok(html.includes('người làm nghề quyết định nội dung cuối cùng'));
 assert.ok(css.includes('.home-case-grid{display:grid'));
 assert.ok(css.includes('.home-perspective-grid{display:grid'));
});
