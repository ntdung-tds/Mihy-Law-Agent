import test from 'node:test';
import assert from 'node:assert/strict';
import {listTenantServices} from '../deployment/cloudflare/platform_admin_gpt.mjs';
const admin={verified:true,kind:'system_admin',id:'qa-admin'};
const row={tenant_id:'qa-tenant',plan_id:'qa-plan',service_status:'active',license_expires_at:null};
const db=(date)=>({batch(){},prepare(){return {all:async()=>({results:[{...row,license_expires_at:date}]})}}});
for (const [label,date,ok] of [
 ['leap day','2028-02-29',true],
 ['nonleap day','2027-02-29',false],
 ['invalid month','2026-13-01',false],
 ['invalid clock','2026-12-31T25:00:00Z',false],
 ['valid offset timestamp','2026-12-31T23:59:59+07:00',true],
]) test(label,async()=>{
 if(ok) assert.equal((await listTenantServices(db(date),admin))[0].license_expires_at,date);
 else await assert.rejects(listTenantServices(db(date),admin),/PLATFORM_INVALID_RESULT/);
});
