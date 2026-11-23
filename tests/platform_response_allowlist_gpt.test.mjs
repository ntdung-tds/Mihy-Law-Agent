import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from '../deployment/cloudflare/platform_http_gpt.mjs';
const principal={verified:true,kind:'system_admin',id:'qa-admin',impersonating:false};
function dbFor(rows){return {batch:async()=>{throw Error('GET must never mutate DB');},prepare(sql){return {async all(){return {success:true,results:rows};}};}};}
async function get(path,rows,identity=principal){
  return handlePlatformAdminRequest(new Request('https://example.test'+path),{DB:dbFor(rows)},async()=>identity);
}
test('plans GET serializes metadata only, never leaked extra columns',async()=>{
  const res=await get('/api/platform/plans',[{plan_id:'basic',plan_name:'Basic',status:'active',max_users:2,max_storage_bytes:100,customer_secret:'NEVER_RETURN'}]);
  assert.equal(res.status,200);
  const body=await res.json();
  assert.deepEqual(body,{items:[{plan_id:'basic',plan_name:'Basic',status:'active',max_users:2,max_storage_bytes:100}]});
  assert.equal(JSON.stringify(body).includes('NEVER_RETURN'),false);
});
test('services GET serializes only control-plane metadata',async()=>{
  const res=await get('/api/platform/services',[{tenant_id:'t1',plan_id:'basic',service_status:'active',license_expires_at:null,matter_title:'PRIVATE'}]);
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{items:[{tenant_id:'t1',plan_id:'basic',service_status:'active',license_expires_at:null}]});
});
test('non-admin GET cannot read metadata or query DB',async()=>{
  let calls=0;
  const db={prepare(){calls++;throw Error('DB access forbidden');}};
  const res=await handlePlatformAdminRequest(new Request('https://example.test/api/platform/services'),{DB:db},async()=>({verified:true,kind:'tenant_admin',id:'qa-tenant'}));
  assert.equal(res.status,403);
  assert.equal(calls,0);
});
