import test from 'node:test';
import assert from 'node:assert/strict';
import {changeTenantService} from '../deployment/cloudflare/platform_admin_gpt.mjs';

const admin = {verified:true,kind:'system_admin',id:'sys-1'};
const valid = () => ({tenantId:'tenant-1',status:'suspended',auditId:'audit-1',reasonCode:'POLICY_REVIEW'});
function dbSpy() {
  let calls=0;
  return {get calls(){return calls;},prepare(){calls++;throw new Error('DB_SHOULD_NOT_BE_TOUCHED');},batch(){calls++;throw new Error('DB_SHOULD_NOT_BE_TOUCHED');}};
}
test('rejects own getter without evaluating it or touching database',async()=>{
  let invoked=0;
  const input=valid();
  Object.defineProperty(input,'status',{enumerable:true,configurable:true,get(){invoked++;return 'suspended';}});
  const db=dbSpy();
  await assert.rejects(changeTenantService(db,admin,input),/PLATFORM_BAD_INPUT/);
  assert.equal(invoked,0);
  assert.equal(db.calls,0);
});
test('rejects own setter without evaluating it',async()=>{
  let invoked=0;
  const input=valid();
  Object.defineProperty(input,'auditId',{enumerable:true,configurable:true,set(){invoked++;}});
  const db=dbSpy();
  await assert.rejects(changeTenantService(db,admin,input),/PLATFORM_BAD_INPUT/);
  assert.equal(invoked,0);
  assert.equal(db.calls,0);
});
test('rejects nonenumerable or readonly input fields before database',async()=>{
  for (const descriptor of [{enumerable:false},{writable:false}]) {
    const input=valid();
    Object.defineProperty(input,'tenantId',{...descriptor});
    const db=dbSpy();
    await assert.rejects(changeTenantService(db,admin,input),/PLATFORM_BAD_INPUT/);
    assert.equal(db.calls,0);
  }
});
test('ordinary own data properties reach validation and database boundary',async()=>{
  const db=dbSpy();
  await assert.rejects(changeTenantService(db,admin,valid()),/DB_SHOULD_NOT_BE_TOUCHED/);
  assert.equal(db.calls,1);
});
