import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from '../deployment/cloudflare/platform_http_gpt.mjs';

const principal = {verified:true,kind:'system_admin',id:'synthetic-admin'};
const env = {
  DB:{prepare(){throw Error('DB_MUST_NOT_BE_CALLED');}},
  verifyPlatformCsrf:async()=>true
};
test('oversized streaming payload remains 413 even if stream cancel rejects', async()=>{
  const body = new ReadableStream({
    pull(controller){ controller.enqueue(new Uint8Array(2049)); },
    cancel(){ throw new Error('synthetic stream cancel failure'); }
  });
  const req = new Request('https://example.test/api/platform/services',{
    method:'POST',duplex:'half',body,
    headers:{origin:'https://example.test','sec-fetch-site':'same-origin',
      'content-type':'application/json','x-csrf-token':'synthetic'}
  });
  const response = await handlePlatformAdminRequest(req,env,async()=>principal);
  assert.equal(response.status,413);
  assert.deepEqual(await response.json(),{error:'PAYLOAD_TOO_LARGE'});
});
