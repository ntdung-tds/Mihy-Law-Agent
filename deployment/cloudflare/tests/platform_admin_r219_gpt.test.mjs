import test from 'node:test';
import assert from 'node:assert/strict';
import {listTenantServices} from '../platform_admin_gpt.mjs';

const admin={verified:true,kind:'system_admin',id:'sys-1'};
function db(rows) {
  const calls=[];
  return {calls,prepare(sql) {
    const stmt={sql,async all(){return {results:rows};}};
    calls.push(stmt);return stmt;
  },async batch(){return [];}};
}
test('verified system admin can list bounded control-plane service metadata',async()=>{
  const store=db([{tenant_id:'tenant-1',plan_id:'solo',service_status:'active',license_expires_at:null}]);
  assert.deepEqual(await listTenantServices(store,admin),[{tenant_id:'tenant-1',plan_id:'solo',service_status:'active',license_expires_at:null}]);
  assert.match(store.calls[0].sql,/LIMIT 100/);
  assert.match(store.calls[0].sql,/ORDER BY tenant_id/);
});
test('deny unverified, tenant admin and impersonating principal before DB read',async()=>{
  for(const p of [null,{}, {verified:false,kind:'system_admin',id:'sys-1'}, {verified:true,kind:'tenant_admin',id:'tenant-admin'}, {...admin,impersonating:true}]) {
    const store=db([]);
    await assert.rejects(listTenantServices(store,p),/PLATFORM_FORBIDDEN/);
    assert.equal(store.calls.length,0);
  }
});
test('SQL selects only explicit control-plane columns and no business tables',async()=>{
  const store=db([]);await listTenantServices(store,admin);
  const sql=store.calls[0].sql;
  assert.match(sql,/SELECT tenant_id, plan_id, service_status, license_expires_at FROM platform_tenant_services/);
  assert.doesNotMatch(sql,/SELECT\s+\*|JOIN|matter|document|client|file_content|owner_id|token/i);
});
test('missing database rejects before query',async()=>{
  await assert.rejects(listTenantServices(null,admin),/PLATFORM_DB_UNAVAILABLE/);
});
test('malformed result fails closed without exposing unexpected fields',async()=>{
  const store=db([{tenant_id:'t',service_status:'active',matter_content:'SECRET'}]);
  assert.deepEqual(await listTenantServices(store,admin),[{tenant_id:'t',plan_id:null,service_status:'active',license_expires_at:null}]);
});
