import test from 'node:test';
import assert from 'node:assert/strict';
import {listPlatformPlans} from '../platform_admin_gpt.mjs';
const principal={id:'sys_1',kind:'system_admin',verified:true};
const good={plan_id:'basic',plan_name:'Basic',status:'active',max_users:5,max_storage_bytes:1024};
const db=rows=>({prepare(){return {async all(){return {results:rows}}}},batch(){}});
test('returns only control-plane allowlisted fields',async()=>{
 const rows=await listPlatformPlans(db([{...good,secret:'DO_NOT_EXPOSE',tenant_case:'private'}]),principal);
 assert.deepEqual(rows,[good]);
});
test('rejects malformed or missing result arrays',async()=>{
 await assert.rejects(listPlatformPlans(db(null),principal),/PLATFORM_INVALID_RESULT/);
});
test('rejects excessive results instead of silently truncating',async()=>{
 await assert.rejects(listPlatformPlans(db(Array.from({length:101},()=>good)),principal),/PLATFORM_INVALID_RESULT/);
});
test('rejects invalid numeric quotas',async()=>{
 for(const max_users of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])
   await assert.rejects(listPlatformPlans(db([{...good,max_users}]),principal),/PLATFORM_INVALID_RESULT/);
});
test('rejects malformed plan identity or status',async()=>{
 for(const row of [{...good,plan_id:'../secret'},{...good,status:'deleted'},{...good,plan_name:''}])
   await assert.rejects(listPlatformPlans(db([row]),principal),/PLATFORM_INVALID_RESULT/);
});
