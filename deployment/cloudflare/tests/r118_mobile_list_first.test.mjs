import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('web/r0-preview/index.html','utf8');
const css=readFileSync('web/r0-preview/styles.css','utf8');
const cases=readFileSync('web/r0-preview/matters.js','utf8');
const app=readFileSync('web/r0-preview/app.js','utf8');

test('R118: mobile starts with saved cases only, never expanded create form',()=>{
 assert.match(html,/id="matter-workspace"[^>]*data-mobile-mode="list"/);
 assert.match(css,/#matter-workspace\[data-mobile-mode="list"\] \.qa-case-unified\{display:none!important\}/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(html,/class="matter-card qa-case-saved-list"/);
 assert.match(html,/id="matter-category-filter"/);
 assert.match(html,/id="upload-btn"/);
 assert.match(html,/id="case-close"/);
 assert.match(html,/id="case-mobile-edit"[^>]*hidden/);
});
test('R118: list, create, detail and edit are separate mobile UI modes with back navigation',()=>{
 for(const mode of ['list','create','detail','edit'])
  assert.match(cases,new RegExp("mobileView\\('"+mode+"'"));
 assert.match(css,/#matter-workspace\[data-mobile-mode="detail"\] \.case-unified-actions/);
 assert.match(cases,/lockMobileDetail\(\)/);
 assert.match(cases,/if\(media\.matches\)backToList\(\)/);
 assert.match(cases,/case-mobile-edit/);
 assert.match(cases,/case-row-open/);
 assert.match(cases,/dataFromForm/);
});
test('R118: create entry points route explicitly through case-create intent',()=>{
 const count=(app.match(/new Event\('ai-law:case-create'\)/g)||[]).length;
 assert.equal(count,2,'top CTA and UC Matter setup must both open on demand');
 assert.match(cases,/window\.addEventListener\('ai-law:case-create'/);
 assert.match(cases,/window\.addEventListener\('ai-law:documents-open'/);
 assert.match(cases,/if\(pendingCreate\)startNew\(\)/);
});
test('R118: no new storage API or D1 schema required for navigation-only correction',()=>{
 assert.match(cases,/\/api\/qa\/matters/);
 assert.match(cases,/\/api\/qa\/cases\//);
 assert.match(html,/class="matter-card qa-document-box" hidden/);
 assert.doesNotMatch(css,/max-width:721px/);
});
