import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from '../deployment/cloudflare/platform_http_gpt.mjs';

const principal = {id:'admin_qa',kind:'system_admin',verified:true};
const env = {DB:{},verifyPlatformCsrf:async()=>true};
const resolve = async()=>principal;
function req(body, headers={}) {
  return new Request('https://example.test/api/platform/services',{
    method:'POST',headers:{origin:'https://example.test','content-type':'application/json',
      'x-csrf-token':'qa-token',...headers},body
  });
}
test('R237: declared oversized content-length rejects before DB',async()=>{
  const res=await handlePlatformAdminRequest(req('{}',{'content-length':'999999'}),env,resolve);
  assert.equal(res.status,413);
});
test('R237: streamed oversized ASCII body rejects before DB',async()=>{
  const res=await handlePlatformAdminRequest(req(' '.repeat(4096)),env,resolve);
  assert.equal(res.status,413);
});
test('R237: byte limit counts UTF-8, not JavaScript characters',async()=>{
  const res=await handlePlatformAdminRequest(req('é'.repeat(1100)),env,resolve);
  assert.equal(res.status,413);
});
test('R237: small malformed JSON remains BAD_JSON',async()=>{
  const res=await handlePlatformAdminRequest(req('{bad}'),env,resolve);
  assert.equal(res.status,400);
  assert.equal((await res.json()).error,'BAD_JSON');
});
test('R237: valid small JSON with extra fields remains BAD_INPUT',async()=>{
  const res=await handlePlatformAdminRequest(req(JSON.stringify({
    tenantId:'t',status:'active',auditId:'a',reasonCode:'QA_REASON',extra:true
  })),env,resolve);
  assert.equal(res.status,400);
  assert.equal((await res.json()).error,'BAD_INPUT');
});
