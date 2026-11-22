import test from 'node:test';
import assert from 'node:assert/strict';
import {listPlatformPlans,listTenantServices} from '../deployment/cloudflare/platform_admin_gpt.mjs';

const admin={id:'sys_qa',kind:'system_admin',verified:true};
const plan={plan_id:'plan_a',plan_name:'Basic',status:'active',max_users:5,max_storage_bytes:1000};
const tenant={tenant_id:'tenant_a',plan_id:'plan_a',service_status:'active',license_expires_at:null};
function dbFor(rows) {
  let calls=0;
  return {
    get calls(){return calls;},
    prepare(sql) {
      calls++;
      assert.match(sql,/^SELECT /);
      return {all:async()=>({success:true,results:rows})};
    },
    batch(){throw new Error('list must never mutate DB');}
  };
}
test('platform plans reject duplicate plan IDs instead of presenting ambiguous metadata',async()=>{
  const db=dbFor([plan,{...plan,plan_name:'Conflicting plan'}]);
  await assert.rejects(listPlatformPlans(db,admin),/PLATFORM_INVALID_RESULT/);
  assert.equal(db.calls,1);
});
test('tenant services reject duplicate tenant IDs instead of presenting ambiguous service state',async()=>{
  const db=dbFor([tenant,{...tenant,service_status:'suspended'}]);
  await assert.rejects(listTenantServices(db,admin),/PLATFORM_INVALID_RESULT/);
  assert.equal(db.calls,1);
});
test('distinct plans and tenants still list successfully',async()=>{
  assert.equal((await listPlatformPlans(dbFor([plan,{...plan,plan_id:'plan_b'}]),admin)).length,2);
  assert.equal((await listTenantServices(dbFor([tenant,{...tenant,tenant_id:'tenant_b'}]),admin)).length,2);
});
test('duplicate plan list does not expose unallowlisted business fields',async()=>{
  const rows=[{...plan,matter_secret:'never expose'}, {...plan}];
  await assert.rejects(listPlatformPlans(dbFor(rows),admin),/PLATFORM_INVALID_RESULT/);
});
