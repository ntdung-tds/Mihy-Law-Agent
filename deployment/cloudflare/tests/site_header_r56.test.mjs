import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const dir='web/website/';
const paths=['index.html','about.html','solutions.html','features.html','security.html','private.html','subscription.html'];
const pages=paths.map(n=>readFileSync(dir+n,'utf8'));
const css=readFileSync(dir+'styles.css','utf8');
const js=readFileSync(dir+'site.js','utf8');

test('R56 uses Be Vietnam Pro for both public header areas and white navigation',()=>{
 assert.match(css,/Be\+Vietnam\+Pro/);
 assert.match(css,/R56 — Adapted from the Owner-supplied MIHY header design sample/);
 assert.match(css,/\.site-page \.announcement,\.site-page \.detail-announcement,\.site-page \.site-header\{/);
 assert.match(css,/\.site-page \.site-header\{background:rgba\(255,255,255,\.97\)!important/);
 assert.match(css,/\.site-page \.site-header \.brand-name\{display:flex;flex-direction:column/);
 assert.match(css,/\.site-page \.site-header \.menu-toggle\{width:44px;height:44px/);
});
test('R56 all seven pages have one real dismiss control, unchanged real navigation and seven-link mobile menu',()=>{
 for(let i=0;i<pages.length;i++){
  const html=pages[i];
  assert.equal((html.match(/data-banner-dismiss/g)||[]).length,1,paths[i]);
  assert.match(html,/aria-label="Ẩn thông báo"/,paths[i]);
  assert.match(html,/class="site-header/,paths[i]);
  assert.match(html,/href="\/gioi-thieu"/,paths[i]);
  assert.match(html,/href="\/giai-phap"/,paths[i]);
  assert.match(html,/href="\/login"/,paths[i]);
  assert.equal((html.match(/class="mobile-signin"/g)||[]).length,1,paths[i]);
  assert.doesNotMatch(html,/>Dùng thử miễn phí</,paths[i]);
 }
 assert.match(js,/data-banner-dismiss/);
 assert.match(js,/banner\.hidden=true/);
 assert.match(css,/\.site-page \.announcement\[hidden\],\.site-page \.detail-announcement\[hidden\]\{display:none!important/);
});
test('R56 reference-inspired compact mobile strips retain approved copy and functional destinations',()=>{
 assert.match(pages[0],/Công nghệ đồng hành cùng tư duy pháp lý\./);
 assert.match(pages[0],/Khám phá điều làm nên khác biệt\./);
 assert.match(pages[0],/href="#benefits" class="announcement-action"/);
 for(const html of pages.slice(1)){
  assert.match(html,/MIHY AGENT/);
  assert.match(html,/Mihy Law AI Agent — công nghệ đồng hành cùng chuyên môn pháp lý/);
  assert.match(html,/href="\/giai-phap" class="detail-announcement-action"/);
 }
 assert.match(css,/\.site-page \.announcement-sub\{display:none!important\}/);
 assert.match(css,/\.site-page \.detail-announcement-copy\{display:none!important\}/);
 assert.match(css,/\.site-page \.detail-announcement-action\{margin-left:auto/);
});
