import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../platform_admin_ui_gpt.mjs',import.meta.url),'utf8');
test('platform UI does not use HTML injection or customer data endpoints',()=>{
  assert.doesNotMatch(src,/innerHTML|outerHTML|insertAdjacentHTML|eval\s*\(/);
  assert.doesNotMatch(src,/\/api\/(?:matters|documents|clients|files)/i);
  assert.match(src,/textContent/);
});
test('mobile view has stacked controls and usable tap targets',()=>{
  assert.match(src,/@media\(max-width:640px\)/);
  assert.match(src,/grid-template-columns:minmax\(0,1fr\)/);
  assert.match(src,/min-height:44px/);
});
test('only metadata APIs are injected, not browser credentials',()=>{
  assert.match(src,/api\.listPlans\(\)/);
  assert.match(src,/api\.listTenantServices\(\)/);
  assert.match(src,/api\.changeService\(/);
  assert.doesNotMatch(src,/localStorage|sessionStorage|document\.cookie|Authorization\s*:/);
});
test('state transitions are bounded, revoked is terminal and reason is constrained',()=>{
  assert.match(src,/item\.status !== 'revoked'/);
  assert.match(src,/REASON\.test\(code\)/);
  assert.match(src,/globalThis\.confirm/);
});
test('stale responses and disposed views cannot render',()=>{
  assert.match(src,/token !== generation/);
  assert.match(src,/disposed=true;generation\+\+/);
  assert.match(src,/if \(busy \|\| disposed\) return/);
});
