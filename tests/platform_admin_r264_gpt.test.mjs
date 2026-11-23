import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from '../deployment/cloudflare/platform_admin_http_gpt.mjs';

const principal={verified:true,kind:'system_admin',id:'synthetic-admin'};
const db={prepare(){return {}},batch(){return Promise.resolve([])}};
async function requestWithLength(value) {
  const request=new Request('https://example.invalid/api/platform/tenant-services',{
    method:'PATCH',headers:{'content-type':'application/json','content-length':value},
    body:'{'
  });
  return handlePlatformAdminRequest(request,{db,principal,csrfVerified:true});
}
test('valid decimal Content-Length reaches JSON validation',async()=>{
  const response=await requestWithLength('1');
  assert.equal(response.status,400);
  assert.equal((await response.json()).error,'INVALID_JSON');
});
test('oversized Content-Length is rejected before JSON parsing',async()=>{
  const response=await requestWithLength('2049');
  assert.equal(response.status,413);
  assert.equal((await response.json()).error,'PAYLOAD_TOO_LARGE');
});
test('nondecimal Content-Length fails closed',async()=>{
  const response=await requestWithLength('1x');
  assert.equal(response.status,413);
  assert.equal((await response.json()).error,'PAYLOAD_TOO_LARGE');
});
