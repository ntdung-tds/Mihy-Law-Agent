import test from 'node:test';
import assert from 'node:assert/strict';
import {listTenantServices} from '../deployment/cloudflare/platform_admin_gpt.mjs';

const principal={verified:true,kind:'system_admin',id:'sys-qa',impersonating:false};
function db(expiry) {
  return {
    prepare(sql) {
      assert.match(sql,/SELECT tenant_id, plan_id, service_status, license_expires_at/);
      return {async all(){return {success:true,results:[{tenant_id:'tenant-qa',plan_id:'plan-qa',service_status:'active',license_expires_at:expiry}]}}};
    },
    async batch(){throw new Error('No writes expected');}
  };
}
for (const expiry of [
  '2026-11-22T02:00:00+14:01',
  '2026-11-22T02:00:00-15:00',
  '2026-11-22T02:00:00+23:00'
]) {
  test('rejects impossible timezone '+expiry,async()=>{
    await assert.rejects(listTenantServices(db(expiry),principal),/PLATFORM_INVALID_RESULT/);
  });
}
for (const expiry of [
  '2026-11-22T02:00:00+14:00',
  '2026-11-22T02:00:00-12:45'
]) {
  test('retains valid timezone '+expiry,async()=>{
    const rows=await listTenantServices(db(expiry),principal);
    assert.equal(rows[0].license_expires_at,expiry);
  });
}
