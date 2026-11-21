import test from 'node:test';
import assert from 'node:assert/strict';
import {changeTenantService} from '../platform_admin_gpt.mjs';
const principal={id:'sys_1',kind:'system_admin',verified:true};
const input={tenantId:'tenant_1',status:'suspended',auditId:'audit_1',reasonCode:'POLICY'};
function db(updateChanges,auditChanges) {
 return {prepare(){return {bind(){return this}}},async batch(){return [{meta:{changes:updateChanges}},{meta:{changes:auditChanges}}]}};
}
test('one update and one audit row confirms mutation',async()=>{
 assert.deepEqual(await changeTenantService(db(1,1),principal,input),{changed:true,tenantId:'tenant_1',status:'suspended'});
});
test('updated row without audit row fails closed',async()=>{
 await assert.rejects(changeTenantService(db(1,0),principal,input),/PLATFORM_AUDIT_INCOMPLETE/);
});
test('missing audit metadata fails closed',async()=>{
 await assert.rejects(changeTenantService(db(1,undefined),principal,input),/PLATFORM_AUDIT_INCOMPLETE/);
});
test('unexpected duplicate audit count fails closed',async()=>{
 await assert.rejects(changeTenantService(db(1,2),principal,input),/PLATFORM_AUDIT_INCOMPLETE/);
});
test('no-op update is not reported as changed',async()=>{
 assert.deepEqual(await changeTenantService(db(0,0),principal,input),{changed:false});
});
