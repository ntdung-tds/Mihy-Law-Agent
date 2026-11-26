import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatformAdminApi} from '../platform_admin_api_gpt.mjs';
const ok=(body)=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
test('plan and service reads use same-origin credentials and no-store',async()=>{
 const calls=[];const api=createPlatformAdminApi({fetchImpl:async(...args)=>{calls.push(args);return ok({items:[]});},csrfToken:()=> 'token'});
 assert.deepEqual(await api.listPlans(),[]);assert.deepEqual(await api.listTenantServices(),[]);
 assert.deepEqual(calls.map(x=>x[0]),['/api/platform/plans','/api/platform/tenant-services']);
 assert.ok(calls.every(x=>x[1].credentials==='same-origin'&&x[1].cache==='no-store'&&x[1].redirect==='error'));
});
test('PATCH uses CSRF and exact payload without impersonation or customer data',async()=>{
 let request;const api=createPlatformAdminApi({fetchImpl:async(...args)=>{request=args;return ok({changed:true,tenantId:'t1',status:'suspended'});},csrfToken:()=> 'safe'});
 await api.changeService({tenantId:'t1',status:'suspended',reasonCode:'POLICY_REVIEW'});
 assert.equal(request[1].headers['x-csrf-token'],'safe');
 assert.deepEqual(JSON.parse(request[1].body),{tenantId:'t1',status:'suspended',reasonCode:'POLICY_REVIEW'});
 assert.equal(request[1].method,'PATCH');
});
test('bad input or missing CSRF never touches network',async()=>{
 let calls=0;const api=createPlatformAdminApi({fetchImpl:async()=>{calls++;return ok({changed:true});},csrfToken:()=>''});
 await assert.rejects(api.changeService({tenantId:'t1',status:'active',reasonCode:'POLICY_REVIEW'}),/CSRF/);
 await assert.rejects(api.changeService({tenantId:'../../matter',status:'active',reasonCode:'POLICY_REVIEW'}),/BAD_INPUT/);
 assert.equal(calls,0);
});
test('HTTP failure and non-JSON response fail closed',async()=>{
 const bad=createPlatformAdminApi({fetchImpl:async()=>new Response('Forbidden',{status:403}),csrfToken:()=> 'x'});
 await assert.rejects(bad.listPlans(),/REQUEST_FAILED/);
 const html=createPlatformAdminApi({fetchImpl:async()=>new Response('<html/>',{status:200,headers:{'content-type':'text/html'}}),csrfToken:()=> 'x'});
 await assert.rejects(html.listTenantServices(),/INVALID_RESPONSE/);
});
test('malformed response and mismatched mutation receipt fail closed',async()=>{
 const malformed=createPlatformAdminApi({fetchImpl:async()=>ok({items:{}}),csrfToken:()=> 'x'});
 await assert.rejects(malformed.listPlans(),/INVALID_RESPONSE/);
 const mismatch=createPlatformAdminApi({fetchImpl:async()=>ok({changed:true,tenantId:'other',status:'active'}),csrfToken:()=> 'x'});
 await assert.rejects(mismatch.changeService({tenantId:'t1',status:'active',reasonCode:'POLICY_REVIEW'}),/INVALID_RESPONSE/);
});
