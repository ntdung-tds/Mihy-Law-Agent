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

test('rejects unexpected metadata at service boundary before DB access',async()=>{
  let called=false; const guarded={prepare(){called=true;throw Error('unexpected DB access')},batch(){called=true;}};
  await assert.rejects(changeTenantService(guarded,principal,{...input,client_name:'secret'}),/PLATFORM_BAD_INPUT/);
  assert.equal(called,false);
});
test('rejects array payloads before database access',async()=>{
  await assert.rejects(changeTenantService(db([]),principal,[input]),/PLATFORM_BAD_INPUT/);
});
test('rejects inherited mutation fields',async()=>{
  const inherited=Object.create({reasonCode:'OWNER_REQUEST'});
  Object.assign(inherited,{tenantId:'tenant-qa',status:'active',auditId:'audit-qa'});
  await assert.rejects(changeTenantService(db([]),principal,inherited),/PLATFORM_BAD_INPUT/);
});
test('rejects prototype pollution keys and symbols',async()=>{
  const polluted=Object.assign(Object.create(null),input);
  Object.defineProperty(polluted,'__proto__',{value:{admin:true},enumerable:true});
  await assert.rejects(changeTenantService(db([]),principal,polluted),/PLATFORM_BAD_INPUT/);
  const symbol={...input,[Symbol('hidden')]:'secret'};
  await assert.rejects(changeTenantService(db([]),principal,symbol),/PLATFORM_BAD_INPUT/);
});
test('allows exact null-prototype payload with no audit on no-op',async()=>{
  const exact=Object.assign(Object.create(null),input);
  assert.deepEqual(await changeTenantService(db([row(0),row(0)]),principal,exact),{changed:false});
});
