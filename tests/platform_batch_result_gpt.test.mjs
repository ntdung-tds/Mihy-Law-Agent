import assert from 'node:assert/strict';
import {test} from 'node:test';
import {changeTenantService} from '../deployment/cloudflare/platform_admin_gpt.mjs';
const principal={verified:true,kind:'system_admin',id:'admin-qa'};
const input={tenantId:'tenant-qa',status:'active',auditId:'audit-qa',reasonCode:'OWNER_REQUEST'};
function db(result) {return {prepare(){return {bind(){return this;}}},async batch(){return result;}};}
const row=(changes,success=true)=>({success,meta:{changes}});
test('successful service update requires one audit row',async()=>{
  assert.deepEqual(await changeTenantService(db([row(1),row(1)]),principal,input),{changed:true,tenantId:'tenant-qa',status:'active'});
});
test('clean no-op requires zero audit rows',async()=>{
  assert.deepEqual(await changeTenantService(db([row(0),row(0)]),principal,input),{changed:false});
});
test('missing batch result fails closed',async()=>{
  for(const result of [undefined,[],[row(1)],[row(1),row(1),row(1)]])
    await assert.rejects(changeTenantService(db(result),principal,input),/PLATFORM_BATCH_INCOMPLETE/);
});
test('failed or malformed statement metadata fails closed',async()=>{
  for(const result of [[row(1,false),row(1)],[row(1),{success:true}],[row(-1),row(0)]])
    await assert.rejects(changeTenantService(db(result),principal,input),/PLATFORM_BATCH_INCOMPLETE/);
});
test('inconsistent no-op and missing audit fail closed',async()=>{
  await assert.rejects(changeTenantService(db([row(0),row(1)]),principal,input),/PLATFORM_BATCH_INCOMPLETE/);
  await assert.rejects(changeTenantService(db([row(1),row(0)]),principal,input),/PLATFORM_AUDIT_INCOMPLETE/);
});
