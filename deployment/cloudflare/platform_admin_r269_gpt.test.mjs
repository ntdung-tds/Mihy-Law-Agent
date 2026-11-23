import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from './platform_admin_http_gpt.mjs';

const principal={verified:true,kind:'system_admin',id:'sys-test'};
function dbFor(rows) {
  return {prepare(sql) {
    assert.match(sql,/FROM platform_service_plans/);
    return {async all(){return {success:true,results:rows};}};
  },batch(){throw Error('read-only test must not mutate');}};
}
test('R269 bounded normal metadata response remains readable',async()=>{
  const row={plan_id:'p1',plan_name:'Basic',status:'active',max_users:5,max_storage_bytes:100};
  const response=await handlePlatformAdminRequest(new Request('https://example.invalid/api/platform/plans'),{db:dbFor([row]),principal});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).items,[row]);
});
test('R269 oversized UTF-8 metadata fails closed with no partial list',async()=>{
  const rows=Array.from({length:100},(_,i)=>({
    plan_id:'p'+i,plan_name:'😀'.repeat(120),status:'active',
    max_users:100,max_storage_bytes:1000
  }));
  const response=await handlePlatformAdminRequest(new Request('https://example.invalid/api/platform/plans'),{db:dbFor(rows),principal});
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'RESPONSE_TOO_LARGE'});
  assert.equal(response.headers.get('cache-control'),'no-store');
});
test('R269 unauthorized caller cannot query metadata',async()=>{
  let called=false;
  const db={prepare(){called=true;throw Error('forbidden');},batch(){}};
  const response=await handlePlatformAdminRequest(new Request('https://example.invalid/api/platform/plans'),{db,principal:{...principal,kind:'tenant_admin'}});
  assert.equal(response.status,403);
  assert.equal(called,false);
});
