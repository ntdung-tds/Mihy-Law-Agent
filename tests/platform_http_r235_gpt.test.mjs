import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from '../deployment/cloudflare/platform_http_gpt.mjs';

const principal = {id:'admin-1',verified:true,kind:'system_admin'};
const base = {tenantId:'tenant-1',status:'active',auditId:'audit-1',reasonCode:'OWNER_APPROVED'};
const env = {DB:{prepare(){throw Error('DB must not be reached for malformed payload')}},verifyPlatformCsrf:async()=>true};
async function invoke(body) {
  return handlePlatformAdminRequest(new Request('https://example.test/api/platform/services',{
    method:'POST',headers:{origin:'https://example.test','content-type':'application/json','x-csrf-token':'synthetic'},
    body:JSON.stringify(body)
  }),env,async()=>principal);
}
test('R235 unknown instruction is rejected before DB',async()=>{
  const r=await invoke({...base, impersonate:true});
  assert.equal(r.status,400);assert.equal((await r.json()).error,'BAD_INPUT');
});
test('R235 missing reason is rejected before DB',async()=>{
  const {reasonCode,...input}=base;const r=await invoke(input);assert.equal(r.status,400);
});
test('R235 prototype key is rejected before DB',async()=>{
  const input=JSON.parse(JSON.stringify(base).replace(/}$/,',"__proto__":{"admin":true}}'));
  const r=await invoke(input);assert.equal(r.status,400);
});
test('R235 nested unknown object is rejected before DB',async()=>{
  const r=await invoke({...base,context:{tenantData:'never'}});assert.equal(r.status,400);
});
test('R235 valid schema reaches DB boundary (not mock PASS)',async()=>{
  const r=await invoke(base);assert.equal(r.status,503);assert.equal((await r.json()).error,'PLATFORM_UNAVAILABLE');
});
