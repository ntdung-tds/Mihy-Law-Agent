import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatformAdminApi} from '../deployment/cloudflare/platform_admin_api_gpt.mjs';

const headers={'content-type':'application/json; charset=utf-8'};
const plan={plan_id:'basic',plan_name:'Cơ bản',status:'active',max_users:2,max_storage_bytes:100};
function api(fetchImpl){return createPlatformAdminApi({fetchImpl,csrfToken:()=> 'csrf'});}

test('bounded platform browser transport accepts a valid small UTF-8 response',async()=>{
 const client=api(async()=>new Response(JSON.stringify({items:[plan]}),{headers}));
 assert.equal((await client.listPlans())[0].plan_name,'Cơ bản');
});
test('rejects oversized declared response before parsing',async()=>{
 const client=api(async()=>new Response('{}',{headers:{...headers,'content-length':'65537'}}));
 await assert.rejects(client.listPlans(),/PLATFORM_INVALID_RESPONSE/);
});
test('rejects oversized streamed response without trusting content length',async()=>{
 const client=api(async()=>new Response(JSON.stringify({items:[],padding:'x'.repeat(66000)}),{headers}));
 await assert.rejects(client.listPlans(),/PLATFORM_INVALID_RESPONSE/);
});
test('rejects invalid UTF-8 in JSON response',async()=>{
 const client=api(async()=>new Response(Uint8Array.from([0xff,0xfe]),{headers}));
 await assert.rejects(client.listPlans(),/PLATFORM_INVALID_RESPONSE/);
});
