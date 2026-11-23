import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from './platform_admin_http_gpt.mjs';

const principal={verified:true,kind:'system_admin',id:'sys-test'};
const body=JSON.stringify({tenantId:'tenant-test',status:'suspended',reasonCode:'POLICY_REVIEW'});

function makeDb() {
  const calls=[];
  return {calls,prepare(sql) {calls.push(sql);return {bind(){return this;},all:async()=>({success:true,results:[]})};},batch:async()=>{calls.push('batch');return [];}}};
}
async function send(declared, payload=body) {
  const db=makeDb();
  let audits=0;
  const request=new Request('https://example.invalid/api/platform/tenant-services',{
    method:'PATCH',headers:{'content-type':'application/json','content-length':String(declared)},body:payload
  });
  const response=await handlePlatformAdminRequest(request,{db,principal,csrfVerified:true,newAuditId:()=>{audits++;return 'audit-test';}});
  return {response,data:await response.json(),db,audits};
}
test('R266: declared length shorter than body rejects before audit or D1',async()=>{
  const x=await send(new TextEncoder().encode(body).length-1);
  assert.equal(x.response.status,400);
  assert.equal(x.data.error,'INVALID_BODY_LENGTH');
  assert.equal(x.audits,0);
  assert.deepEqual(x.db.calls,[]);
});
test('R266: declared length longer than body rejects before audit or D1',async()=>{
  const x=await send(new TextEncoder().encode(body).length+1);
  assert.equal(x.response.status,400);
  assert.equal(x.data.error,'INVALID_BODY_LENGTH');
  assert.equal(x.audits,0);
  assert.deepEqual(x.db.calls,[]);
});
test('R266: matching body length reaches validation and trusted audit path',async()=>{
  const x=await send(new TextEncoder().encode(body).length);
  assert.notEqual(x.data.error,'INVALID_BODY_LENGTH');
  assert.equal(x.audits,1);
  assert.equal(x.db.calls.includes('batch'),true);
});
