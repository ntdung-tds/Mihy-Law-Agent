import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const names=['index.html','about.html','solutions.html','features.html','security.html','private.html','subscription.html'];
const h=Object.fromEntries(names.map(n=>[n,readFileSync('web/website/'+n,'utf8')]));
const css=readFileSync('web/website/styles.css','utf8');
const js=readFileSync('web/website/site.js','utf8');
test('Mẫu 08 is shared by both approved header types, all seven pages',()=>{
 for(const [name,html] of Object.entries(h)){
  assert.equal((html.match(/class="mihy08-prev"/g)||[]).length,0,name);
  assert.equal((html.match(/class="mihy08-next"/g)||[]).length,0,name);
  assert.equal((html.match(/class="mihy08-close"/g)||[]).length,0,name);
  assert.equal((html.match(/class="mihy08-dots"/g)||[]).length,1,name);
  assert.equal((html.match(/aria-label="Thông điệp [1-3]"/g)||[]).length,3,name);
  assert.match(html,/class="mihy11-line"/,name);
  assert.match(html,/href="\/giai-phap" class="header-cta"/.test(html)?/MIHY/:/class="button button-dark header-cta" href="\/giai-phap"/);
  assert.ok(!html.includes('Dùng thử miễn phí'),name);
 }
 assert.match(h['index.html'],/href="#benefits" class="announcement-action">Tìm hiểu thêm/);
 for(const name of names.slice(1))assert.match(h[name],/href="\/#benefits" class="detail-announcement-action">Tìm hiểu thêm/);
});
test('Mẫu 11 has 3.8s rotation, keyboard/focus/hover and reduced-motion support',()=>{
 assert.match(js,/setInterval\(\(\)=>show\(index\+1\),3800\)/);
 assert.match(js,/banner\.addEventListener\('mouseenter',stop\)/);
 assert.match(js,/banner\.addEventListener\('focusin',stop\)/);
 assert.doesNotMatch(js,/banner\.hidden=true/);
 assert.match(js,/prefers-reduced-motion: reduce/);
 assert.match(js,/visibilitychange/);
 assert.match(js,/link\.setAttribute\('href',s\.url\)/);
 assert.doesNotMatch(js,/Dùng thử miễn phí/);
});
test('R58 retains tilted MIHY logo and realistic current destinations',()=>{
 const patch=css.slice(css.indexOf('/* R58 —'));
 assert.match(patch,/transform:rotate\(-4deg\)!important/);
 assert.match(patch,/background:#171233!important/);
 assert.match(patch,/background:#f6c453/);
 assert.match(patch,/\.site-page \.mihy08-dots button\.on/);
 assert.match(patch,/\.site-page \.announcement-inner,\.site-page \.detail-announcement-inner/);
 for(const name of names){
  const html=h[name];
  assert.match(html,/class="login-link" href="\/login">Đăng nhập/);
  assert.match(html,/href="\/giai-phap">Khám phá giải pháp/);
  assert.match(html,/class="mobile-signin" href="\/login"/);
 }
});
