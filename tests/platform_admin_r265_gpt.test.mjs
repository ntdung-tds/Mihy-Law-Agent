import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from '../deployment/cloudflare/platform_admin_http_gpt.mjs';

const principal={verified:true,kind:'system_admin',id:'synthetic-admin'};
let touched=0;
const db={prepare(){touched++;throw Error('DB must not be touched')},batch(){touched++;throw Error('DB must not be touched')}};
async function send(length,body='{') {
  const req=new Request('https://example.invalid/api/platform/tenant-services',{
    method:'PATCH',headers:{'content-type':'application/json','content-length':String(length)},body
  });
  return handlePlatformAdminRequest(req,{db,principal,csrfVerified:true,newAuditId:()=>{touched++;return 'audit-test'}});
}
test('shorter declared body fails closed before audit or DB',async()=>{
  touched=0;
  const res=await send(2,'{');
  assert.equal(res.status,400);
  assert.equal((await res.json()).error,'INVALID_BODY_LENGTH');
  assert.equal(touched,0);
});
test('longer streamed body than declaration fails closed',async()=>{
  touched=0;
  const res=await send(1,'{}');
  assert.equal(res.status,400);
  assert.equal((await res.json()).error,'INVALID_BODY_LENGTH');
  assert.equal(touched,0);
});
test('matching length continues to normal JSON validation',async()=>{
  touched=0;
  const res=await send(1,'{');
  assert.equal(res.status,400);
  assert.equal((await res.json()).error,'INVALID_JSON');
  assert.equal(touched,0);
});
