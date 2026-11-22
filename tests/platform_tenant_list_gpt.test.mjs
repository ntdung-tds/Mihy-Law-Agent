import test from 'node:test';
import assert from 'node:assert/strict';
import {listTenantServices} from '../deployment/cloudflare/platform_admin_gpt.mjs';
const admin={verified:true,kind:'system_admin',id:'sys-1'};
const valid={tenant_id:'tenant-1',plan_id:'solo',service_status:'active',license_expires_at:null};
const db=rows=>({prepare(sql){assert.match(sql,/SELECT tenant_id, plan_id, service_status, license_expires_at/);return {all:async()=>({success:true,results:rows})};},batch:async()=>[]});
test('returns only four allowed metadata fields',async()=>{
 const rows=[{...valid,secret:'never-expose',matter_title:'private'}];
 assert.deepEqual(await listTenantServices(db(rows),admin),[valid]);
});
test('rejects oversized result even if adapter violates SQL LIMIT',async()=>{
 await assert.rejects(listTenantServices(db(Array(101).fill(valid)),admin),/PLATFORM_INVALID_RESULT/);
});
test('rejects missing tenant id and invalid plan id',async()=>{
 for(const row of [{...valid,tenant_id:null},{...valid,plan_id:'../secret'}])
   await assert.rejects(listTenantServices(db([row]),admin),/PLATFORM_INVALID_RESULT/);
});
test('rejects unknown status and malformed expiry',async()=>{
 for(const row of [{...valid,service_status:'admin'},{...valid,license_expires_at:'javascript:evil'}])
   await assert.rejects(listTenantServices(db([row]),admin),/PLATFORM_INVALID_RESULT/);
});
test('rejects tenant admin before database query',async()=>{
 let touched=false;
 const denied={prepare(){touched=true;throw Error('unexpected');},batch(){}};
 await assert.rejects(listTenantServices(denied,{verified:true,kind:'tenant_admin',id:'x'}),/PLATFORM_FORBIDDEN/);
 assert.equal(touched,false);
});

test('accepts ISO calendar date and timestamp expiry metadata',async()=>{
 for (const date of ['2026-12-31','2026-12-31T23:59:59Z','2026-12-31 23:59:59+07:00']) {
   const row={...valid,license_expires_at:date};
   assert.deepEqual(await listTenantServices(db([row]),admin),[row]);
 }
});
test('rejects non-ISO expiry metadata',async()=>{
 for (const date of ['tomorrow','2026/12/31','2026-12-31T23:59:59+0700']) {
   await assert.rejects(listTenantServices(db([{...valid,license_expires_at:date}]),admin),/PLATFORM_INVALID_RESULT/);
 }
});
