import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from './platform_http_gpt.mjs';
const principal={verified:true,kind:'system_admin',id:'sys-test'};
const base={DB:{prepare(){throw Error('unexpected DB access');},batch(){throw Error('unexpected mutation');}},verifyPlatformCsrf:async()=>true};
const request=(body)=>new Request('https://example.invalid/api/platform/services',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json','x-csrf-token':'synthetic'},body:JSON.stringify(body)});
test('R270 rejects browser-supplied auditId before DB access',async()=>{
 const response=await handlePlatformAdminRequest(request({tenantId:'t1',status:'active',reasonCode:'APPROVED',auditId:'attacker'}),base,async()=>principal);
 assert.equal(response.status,400);
 assert.deepEqual(await response.json(),{error:'BAD_INPUT'});
});
test('R270 rejects extra mutation instructions before DB access',async()=>{
 const response=await handlePlatformAdminRequest(request({tenantId:'t1',status:'active',reasonCode:'APPROVED',ownerId:'victim'}),base,async()=>principal);
 assert.equal(response.status,400);
});
test('R270 non-admin cannot reach mutation',async()=>{
 const response=await handlePlatformAdminRequest(request({tenantId:'t1',status:'active',reasonCode:'APPROVED'}),base,async()=>({...principal,kind:'tenant_admin'}));
 assert.equal(response.status,403);
});
