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
test('R278 POST uses only approved fields and CSRF, no tenant data',async()=>{
  const client=createPlatformAdminClient({csrfToken:'qa-token',fetchImpl:async(path,init)=>{
    assert.equal(path,'/api/platform/services');assert.equal(init.method,'POST');
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

test('R284 aborts oversized streamed metadata before buffering full response',async()=>{
  let pulled=0,cancelled=false;
  const stream=new ReadableStream({
    pull(controller) {
      pulled++;
      controller.enqueue(new Uint8Array(17000));
      if (pulled>10) controller.close();
    },
    cancel(){cancelled=true;}
  },{highWaterMark:0});
  const client=createPlatformAdminClient({fetchImpl:async()=>new Response(stream,{
    headers:{'content-type':'application/json'}
  })});
  await assert.rejects(client.listPlans(),/INVALID_RESPONSE/);
  assert.equal(pulled,2);
  assert.equal(cancelled,true);
});
test('R284 rejects oversized declared content length without reading stream',async()=>{
  let pulled=0;
  const stream=new ReadableStream({pull(){pulled++;}},{highWaterMark:0});
  const client=createPlatformAdminClient({fetchImpl:async()=>new Response(stream,{
    headers:{'content-type':'application/json','content-length':'999999'}
  })});
  await assert.rejects(client.listServices(),/INVALID_RESPONSE/);
  assert.equal(pulled,0);
});

test('R285 accepts valid bounded numeric Content-Length and still validates JSON',async()=>{
  const payload=JSON.stringify({items:[{plan_id:'basic',plan_name:'Basic',status:'active',max_users:2,max_storage_bytes:100}]});
  const client=createPlatformAdminClient({fetchImpl:async()=>new Response(payload,{
    headers:{'content-type':'application/json','content-length':String(new TextEncoder().encode(payload).byteLength)}
  })});
  assert.equal((await client.listPlans())[0].plan_id,'basic');
});
test('R285 rejects malformed Content-Length even if response is otherwise valid',async()=>{
  const client=createPlatformAdminClient({fetchImpl:async()=>new Response('{"items":[]}',{
    headers:{'content-type':'application/json','content-length':'12junk'}
  })});
  await assert.rejects(client.listPlans(),/INVALID_RESPONSE/);
});

// R286 exercise the actual HTTP adapter rather than a mocked URL contract.
import {handlePlatformAdminRequest} from '../deployment/cloudflare/platform_http_gpt.mjs';
test('R286 client and server agree on service list and mutation wire contract',async()=>{
  let batches=0;
  const db={prepare(sql){return {bind(){return this;},async all(){return {success:true,results:[{tenant_id:'t',plan_id:'p',service_status:'active',license_expires_at:null}]};}};},async batch(){batches++;return [{success:true,meta:{changes:1}},{success:true,meta:{changes:1}}];}};
  const principal={verified:true,kind:'system_admin',id:'admin'};
  const client=createPlatformAdminClient({csrfToken:'qa',fetchImpl:(path,init)=>handlePlatformAdminRequest(new Request('https://qa.invalid'+path,{...init,headers:{...init.headers,origin:'https://qa.invalid'}}),{DB:db,verifyPlatformCsrf:async(_r,_p,token)=>token==='qa'},async()=>principal)});
  assert.equal((await client.listServices())[0].tenant_id,'t');
  assert.equal((await client.changeService({tenantId:'t',status:'suspended',reasonCode:'ADMIN_REQUEST'})).changed,true);
  assert.equal(batches,1);
});
