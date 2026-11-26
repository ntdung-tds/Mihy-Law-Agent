import test from 'node:test';
import assert from 'node:assert/strict';
import {changeTenantService, listTenantServices} from '../deployment/cloudflare/platform_admin_gpt.mjs';

const admin={verified:true,kind:'system_admin',id:'sys-qa'};
function dbFixture({updateChanges=1,auditChanges=1,throwBatch=false,rows=[]}={}) {
  const statements=[];
  const db={
    prepare(sql) {
      const statement={sql,bind(...args){this.args=args;return this;},async all(){return {results:rows};}};
      statements.push(statement);
      return statement;
    },
    async batch(batch) {
      if(throwBatch) throw Error('synthetic D1 transaction failed');
      return [{success:true,meta:{changes:updateChanges}},{success:true,meta:{changes:auditChanges}}];
    }
  };
  return {db,statements};
}
const mutation={tenantId:'tenant-qa',status:'suspended',auditId:'audit-qa',reasonCode:'OWNER_APPROVED'};
test('control-plane update and audit are submitted in one batch',async()=>{
  const f=dbFixture();
  assert.deepEqual(await changeTenantService(f.db,admin,mutation),{changed:true,tenantId:'tenant-qa',status:'suspended'});
  assert.equal(f.statements.length,2);
  assert.match(f.statements[0].sql,/UPDATE platform_tenant_services/);
  assert.match(f.statements[1].sql,/INSERT INTO platform_admin_audit/);
  assert.match(f.statements[1].sql,/WHERE changes\(\) = 1/);
});
test('no transition does not claim success',async()=>{
  assert.deepEqual(await changeTenantService(dbFixture({updateChanges:0,auditChanges:0}).db,admin,mutation),{changed:false});
});
test('missing audit confirmation fails closed',async()=>{
  await assert.rejects(changeTenantService(dbFixture({auditChanges:0}).db,admin,mutation),/PLATFORM_AUDIT_INCOMPLETE/);
});
test('D1 batch failure is not reported as success',async()=>{
  await assert.rejects(changeTenantService(dbFixture({throwBatch:true}).db,admin,mutation),/synthetic D1 transaction failed/);
});
test('tenant admin cannot access control-plane data or mutate',async()=>{
  const f=dbFixture({rows:[{tenant_id:'tenant-qa',plan_id:'basic',service_status:'active',license_expires_at:null}]});
  const tenantAdmin={verified:true,kind:'tenant_admin',id:'tenant-qa'};
  await assert.rejects(listTenantServices(f.db,tenantAdmin),/PLATFORM_FORBIDDEN/);
  await assert.rejects(changeTenantService(f.db,tenantAdmin,mutation),/PLATFORM_FORBIDDEN/);
  assert.equal(f.statements.length,0);
});
