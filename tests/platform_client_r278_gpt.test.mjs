import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatformAdminClient} from '../deployment/cloudflare/platform_admin_client_gpt.mjs';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
test('R278 GET uses same-origin session, no-store, and metadata allowlist',async()=>{
  let calls=0;
  const client=createPlatformAdminClient({fetchImpl:async(path,init)=>{
    calls++;assert.equal(path,'/api/platform/plans');
    assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');
    assert.equal(init.redirect,'error');assert.equal(init.method,'GET');
    assert.equal(init.headers['x-csrf-token'],undefined);
    return json({items:[{plan_id:'basic',plan_name:'Basic',status:'active',max_users:2,max_storage_bytes:100}]});
  }});
  assert.equal((await client.listPlans())[0].plan_id,'basic');assert.equal(calls,1);
});
test('R278 PATCH uses only approved fields and CSRF, no tenant data',async()=>{
  const client=createPlatformAdminClient({csrfToken:'qa-token',fetchImpl:async(path,init)=>{
    assert.equal(path,'/api/platform/tenant-services');assert.equal(init.method,'PATCH');
    assert.equal(init.headers['x-csrf-token'],'qa-token');
    assert.equal(init.credentials,'same-origin');
    assert.deepEqual(JSON.parse(init.body),{tenantId:'tenant-1',status:'suspended',reasonCode:'ADMIN_REQUEST'});
    return json({changed:true,tenantId:'tenant-1',status:'suspended'});
  }});
  assert.equal((await client.changeService({tenantId:'tenant-1',status:'suspended',reasonCode:'ADMIN_REQUEST'})).changed,true);
});
test('R278 invalid mutations never call fetch',async()=>{
  let calls=0;
  const client=createPlatformAdminClient({csrfToken:'qa',fetchImpl:async()=>{calls++;throw Error('should not fetch');}});
  for (const input of [{tenantId:'x',status:'pending',reasonCode:'ADMIN_REQUEST'},
    {tenantId:'x',status:'active',reasonCode:'bad'},
    {tenantId:'../x',status:'active',reasonCode:'ADMIN_REQUEST'}])
    await assert.rejects(client.changeService(input),/BAD_INPUT/);
  assert.equal(calls,0);
});
test('R278 missing CSRF never calls fetch',async()=>{
  let calls=0;
  const client=createPlatformAdminClient({fetchImpl:async()=>{calls++;throw Error('unexpected');}});
  await assert.rejects(client.changeService({tenantId:'x',status:'active',reasonCode:'ADMIN_REQUEST'}),/CSRF_UNAVAILABLE/);
  assert.equal(calls,0);
});
test('R278 refuses unexpected business columns instead of exposing them',async()=>{
  const client=createPlatformAdminClient({fetchImpl:async()=>json({items:[{
    tenant_id:'t',plan_id:'p',service_status:'active',license_expires_at:null,
    client_matter_notes:'secret'
  }]})});
  await assert.rejects(client.listServices(),/INVALID_RESPONSE/);
});
test('R278 refuses oversized or non-JSON metadata',async()=>{
  const client=createPlatformAdminClient({fetchImpl:async()=>json({items:[],padding:'x'.repeat(33000)})});
  await assert.rejects(client.listPlans(),/INVALID_RESPONSE/);
  const bad=createPlatformAdminClient({fetchImpl:async()=>new Response('<html>oops</html>',{headers:{'content-type':'text/html'}})});
  await assert.rejects(bad.listPlans(),/INVALID_RESPONSE/);
});
test('R278 server errors are redacted',async()=>{
  const client=createPlatformAdminClient({fetchImpl:async()=>json({detail:'private-data'},403)});
  await assert.rejects(client.listPlans(),e=>e.message==='HTTP_403' && !e.message.includes('private-data'));
});
