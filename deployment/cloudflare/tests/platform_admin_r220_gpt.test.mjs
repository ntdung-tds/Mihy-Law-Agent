import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest as handle} from '../platform_admin_http_gpt.mjs';
const admin={verified:true,kind:'system_admin',id:'sys-1'};
function store(rows=[]) {
  const calls=[];
  return {calls,prepare(sql){const q={sql,bind(...args){q.args=args;return q;},async all(){return {success:true,results:rows};}};calls.push(q);return q;},
    async batch(items){return [{success:true,meta:{changes:1}},{success:true,meta:{changes:1}}];}};
}
const req=(path,init)=>new Request('https://example.test'+path,init);
test('unauthenticated and tenant-admin requests fail before DB read',async()=>{
  for(const principal of [null,{verified:false,kind:'system_admin',id:'sys-1'},{verified:true,kind:'tenant_admin',id:'t1'},{...admin,impersonating:true}]){
    const db=store();const r=await handle(req('/api/platform/plans'),{db,principal});
    assert.equal(r.status,403);assert.equal(db.calls.length,0);
  }
});
test('GET plans strips unexpected customer fields and disables caching',async()=>{
  const db=store([{plan_id:'solo',plan_name:'Solo',status:'active',max_users:1,max_storage_bytes:100,matter_secret:'LEAK'}]);
  const r=await handle(req('/api/platform/plans'),{db,principal:admin});
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  assert.doesNotMatch(await r.text(),/LEAK|matter_secret/);
});
test('GET tenant services only exposes bounded metadata',async()=>{
  const db=store([{tenant_id:'t1',plan_id:'solo',service_status:'active',license_expires_at:null,client_name:'LEAK'}]);
  const r=await handle(req('/api/platform/tenant-services'),{db,principal:admin});
  assert.equal(r.status,200);assert.doesNotMatch(await r.text(),/LEAK|client_name/);
  assert.match(db.calls[0].sql,/LIMIT 101/);
});
test('PATCH requires CSRF and rejects client audit identifiers before DB writes',async()=>{
  const db=store();const init={method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId:'t1',status:'active',reasonCode:'POLICY_REVIEW',auditId:'forged'})};
  assert.equal((await handle(req('/api/platform/tenant-services',init),{db,principal:admin})).status,403);
  assert.equal((await handle(req('/api/platform/tenant-services',init),{db,principal:admin,csrfVerified:true,newAuditId:()=> 'audit-1'})).status,400);
  assert.equal(db.calls.length,0);
});
test('PATCH writes only trusted audit ID, refuses unapproved method and unknown routes',async()=>{
  const db=store();const init={method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId:'t1',status:'suspended',reasonCode:'POLICY_REVIEW'})};
  const r=await handle(req('/api/platform/tenant-services',init),{db,principal:admin,csrfVerified:true,newAuditId:()=> 'server-audit-1'});
  assert.equal(r.status,200);assert.equal(db.calls.length,2);
  assert.ok(db.calls[1].args.includes('server-audit-1'));
  assert.equal((await handle(req('/api/platform/plans',{method:'POST'}),{db,principal:admin})).status,405);
  assert.equal((await handle(req('/api/platform/matters'),{db,principal:admin})).status,404);
});
