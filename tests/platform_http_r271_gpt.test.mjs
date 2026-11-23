import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from '../deployment/cloudflare/platform_http_gpt.mjs';

const principal={id:'admin-qa',kind:'system_admin',verified:true};
const resolver=async()=>principal;
function env(){return {DB:{},verifyPlatformCsrf:async()=>true};}
function patch(body,headers={}){
  return new Request('https://example.test/api/platform/services',{method:'POST',headers:{
    origin:'https://example.test','sec-fetch-site':'same-origin',
    'content-type':'application/json','x-csrf-token':'synthetic',...headers},body});
}
test('alternate adapter rejects missing verified principal id before DB',async()=>{
  const r=await handlePlatformAdminRequest(new Request('https://example.test/api/platform/plans'),env(),async()=>({kind:'system_admin',verified:true}));
  assert.equal(r.status,403);
});
test('alternate adapter rejects transformed mutation before DB',async()=>{
  const r=await handlePlatformAdminRequest(patch('{}',{'content-encoding':'gzip'}),env(),resolver);
  assert.equal(r.status,415);
});
test('alternate adapter rejects mismatched declared byte count before DB',async()=>{
  const r=await handlePlatformAdminRequest(patch('{}',{'content-length':'3'}),env(),resolver);
  assert.equal(r.status,400);
});
test('alternate adapter rejects invalid fields before audit generation',async()=>{
  const r=await handlePlatformAdminRequest(patch(JSON.stringify({tenantId:'x',status:'active',reasonCode:'bad'})),env(),resolver);
  assert.equal(r.status,400);
});
test('alternate adapter rejects unsafe content-length before body allocation',async()=>{
  const r=await handlePlatformAdminRequest(patch('{}',{'content-length':'9007199254740992'}),env(),resolver);
  assert.equal(r.status,413);
});
