import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatformAdminApi} from '../platform_admin_api_gpt.mjs';
const response = items => new Response(JSON.stringify({items}), {status:200,headers:{'content-type':'application/json'}});
const api = items => createPlatformAdminApi({fetchImpl:async()=>response(items),csrfToken:()=> 'synthetic'});
const plan = {plan_id:'basic',plan_name:'Basic',status:'active',max_users:5,max_storage_bytes:1024};
const service = {tenant_id:'t1',plan_id:'basic',service_status:'active',license_expires_at:null};
test('plan response strips injected customer data fields',async()=>{
 const rows=await api([{...plan,matter_title:'private',customer_email:'secret'}]).listPlans();
 assert.deepEqual({...rows[0]},plan);assert.equal('matter_title' in rows[0],false);
});
test('tenant service response strips injected business and credential fields',async()=>{
 const rows=await api([{...service,document_body:'private',access_token:'secret'}]).listTenantServices();
 assert.deepEqual({...rows[0]},service);assert.equal('access_token' in rows[0],false);
});
test('invalid plan quota values fail closed',async()=>{
 await assert.rejects(api([{...plan,max_users:-1}]).listPlans(),/INVALID_RESPONSE/);
 await assert.rejects(api([{...plan,max_storage_bytes:'unlimited'}]).listPlans(),/INVALID_RESPONSE/);
});
test('invalid tenant metadata shapes fail closed',async()=>{
 await assert.rejects(api([{...service,tenant_id:{id:'t1'}}]).listTenantServices(),/INVALID_RESPONSE/);
 await assert.rejects(api([null]).listTenantServices(),/INVALID_RESPONSE/);
});
test('oversized result sets fail closed instead of silently truncating',async()=>{
 await assert.rejects(api(Array.from({length:101},()=>plan)).listPlans(),/INVALID_RESPONSE/);
 assert.deepEqual(await api([]).listTenantServices(),[]);
});
