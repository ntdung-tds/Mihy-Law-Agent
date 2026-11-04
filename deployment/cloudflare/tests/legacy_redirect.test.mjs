import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyRedirect} from '../src/legacy_preview_redirect.mjs';
const old='https://ai-law-r0-preview.iaict-platform.workers.dev';
const next='https://ai-law-web.iaict-platform.workers.dev';
test('original links move safely to new AI Law homepage',()=>{
 for(const p of ['/', '/?utm_source=chatgpt.com', '/index.html']){
  const r=legacyRedirect(new Request(old+p));
  assert.equal(r.status,308);assert.equal(r.headers.get('Location'),next+'/');
 }
});
test('old app links move to new protected app, not to an unprotected resource',()=>{
 for(const p of ['/app','/app/','/login']){
  const r=legacyRedirect(new Request(old+p));
  assert.equal(r.status,308);
  assert.equal(r.headers.get('Location'),next+(p==='/app/'?'/app':p));
 }
});
test('legacy APIs cannot forward cookies/passwords to new hostname',()=>{
 for(const p of ['/api/qa/login','/api/qa/matters','/v1/runs/example']){
  const r=legacyRedirect(new Request(old+p));
  assert.equal(r.status,410);
  assert.equal(r.headers.get('Location'),null);
 }
 const posted=legacyRedirect(new Request(old+'/api/qa/login',{method:'POST',body:'{}'}));
 assert.equal(posted.status,410);
});
test('no arbitrary redirect target can come from a query string',()=>{
 const r=legacyRedirect(new Request(old+'/?next=https://attacker.invalid'));
 assert.equal(r.headers.get('Location'),next+'/');
});
