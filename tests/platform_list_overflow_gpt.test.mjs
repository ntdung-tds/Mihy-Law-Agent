import test from 'node:test';
import assert from 'node:assert/strict';
import {listPlatformPlans, listTenantServices} from '../deployment/cloudflare/platform_admin_gpt.mjs';

const principal={id:'admin_1',kind:'system_admin',verified:true};
const plan=i=>({plan_id:'p'+i,plan_name:'Plan '+i,status:'active',max_users:1,max_storage_bytes:0});
const tenant=i=>({tenant_id:'t'+i,plan_id:'p1',service_status:'active',license_expires_at:null});
const db=rows=>({batch:async()=>[],prepare(sql){return {all:async()=>({results:rows}),sql}}});
test('plans: exactly 100 rows are returned',async()=>assert.equal((await listPlatformPlans(db(Array.from({length:100},(_,i)=>plan(i))),principal)).length,100));
test('plans: 101 rows fail closed instead of truncating',async()=>assert.rejects(listPlatformPlans(db(Array.from({length:101},(_,i)=>plan(i))),principal),/PLATFORM_INVALID_RESULT/));
test('tenant services: exactly 100 rows are returned',async()=>assert.equal((await listTenantServices(db(Array.from({length:100},(_,i)=>tenant(i))),principal)).length,100));
test('tenant services: 101 rows fail closed',async()=>assert.rejects(listTenantServices(db(Array.from({length:101},(_,i)=>tenant(i))),principal),/PLATFORM_INVALID_RESULT/));
test('both queries request 101 rows to detect overflow',async()=>{
 const seen=[];
 const adapter={batch:async()=>[],prepare(sql){seen.push(sql);return {all:async()=>({results:[]})}}};
 await listPlatformPlans(adapter,principal);
 await listTenantServices(adapter,principal);
 assert.equal(seen.length,2);
 assert.ok(seen.every(sql=>/LIMIT 101\b/.test(sql)));
});
