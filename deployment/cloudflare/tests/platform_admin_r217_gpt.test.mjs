import test from 'node:test';
import assert from 'node:assert/strict';
import {listPlatformPlans, changeTenantService} from '../platform_admin_gpt.mjs';
const admin = {verified:true,kind:'system_admin',id:'sys-1'};
function fakeDb(changes=1) {
  const statements=[];
  const db={statements,prepare(sql) {
    const s={sql,args:[],bind(...args){this.args=args;return this;},async all(){return {results:[{plan_id:'solo',plan_name:'Solo',status:'active',max_users:1,max_storage_bytes:0}]};}};
    statements.push(s);return s;
  },async batch(items){return [{meta:{changes}}, {meta:{changes}}];}};
  return db;
}
test('unverified and tenant admins cannot access control plane',async()=>{
  for(const p of [null,{}, {verified:false,kind:'system_admin',id:'x'}, {verified:true,kind:'tenant_admin',id:'x'}, {...admin,impersonating:true}])
    await assert.rejects(listPlatformPlans(fakeDb(),p),/PLATFORM_FORBIDDEN/);
});
test('plans query is metadata-only and bounded',async()=>{
  const db=fakeDb();assert.equal((await listPlatformPlans(db,admin))[0].plan_id,'solo');
  assert.match(db.statements[0].sql,/LIMIT 100/);
  assert.doesNotMatch(db.statements[0].sql,/matter|document|client|file_content/i);
});
test('rejects invalid IDs status and reasons before any SQL',async()=>{
  for(const input of [{tenantId:'../x',status:'active',auditId:'a',reasonCode:'OK'},
    {tenantId:'t',status:'pending',auditId:'a',reasonCode:'OK'},
    {tenantId:'t',status:'active',auditId:'a',reasonCode:'private data'}]){
    const db=fakeDb();await assert.rejects(changeTenantService(db,admin,input));
    assert.equal(db.statements.length,0);
  }
});
test('service update and audit share a single batch and use bound values',async()=>{
  const db=fakeDb();assert.deepEqual(await changeTenantService(db,admin,{tenantId:'tenant-1',status:'suspended',auditId:'audit-1',reasonCode:'POLICY'}),{changed:true,tenantId:'tenant-1',status:'suspended'});
  assert.equal(db.statements.length,2);
  assert.deepEqual(db.statements[0].args,['suspended','tenant-1','revoked','suspended']);
  assert.deepEqual(db.statements[1].args,['audit-1','sys-1','tenant-1','service_suspend','POLICY']);
});
test('no-op transition reports unchanged',async()=>{
  assert.deepEqual(await changeTenantService(fakeDb(0),admin,{tenantId:'t',status:'active',auditId:'a',reasonCode:'REVIEW'}),{changed:false});
});
