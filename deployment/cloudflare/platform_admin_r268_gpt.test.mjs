import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from './platform_admin_http_gpt.mjs';

const principal={verified:true,kind:'system_admin',id:'sys-test'};
const valid={tenantId:'tenant-test',status:'suspended',reasonCode:'POLICY_REVIEW'};
async function probe(payload) {
  let auditCalls=0,dbCalls=0;
  const db={prepare(){dbCalls++;throw Error('D1 should not be called');},batch(){dbCalls++;throw Error('D1 should not be called');}};
  const request=new Request('https://example.invalid/api/platform/tenant-services',{
    method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const response=await handlePlatformAdminRequest(request,{db,principal,csrfVerified:true,newAuditId(){auditCalls++;return 'audit-1';}});
  return {status:response.status,body:await response.json(),auditCalls,dbCalls};
}
for (const [name,payload] of [
  ['empty tenant ID',{...valid,tenantId:''}],
  ['invalid tenant ID',{...valid,tenantId:'tenant with space'}],
  ['unsupported status',{...valid,status:'pending'}],
  ['missing reason',{...valid,reasonCode:''}],
  ['lowercase reason',{...valid,reasonCode:'policy_review'}],
  ['nonstring reason',{...valid,reasonCode:42}],
  ['extra key',{...valid,businessData:'secret'}]
]) test('R268 rejects '+name+' before audit and D1',async()=>{
  const result=await probe(payload);
  assert.equal(result.status,400);
  assert.equal(result.body.error,'BAD_INPUT');
  assert.equal(result.auditCalls,0);
  assert.equal(result.dbCalls,0);
});
