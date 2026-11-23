import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from '../deployment/cloudflare/platform_http_gpt.mjs';

const principal = {verified:true,kind:'system_admin',id:'admin-qa'};
function request(contentType) {
  return new Request('https://example.test/api/platform/services', {
    method:'POST',
    headers:{origin:'https://example.test','sec-fetch-site':'same-origin',
      'content-type':contentType,'x-csrf-token':'synthetic'},
    body:JSON.stringify({tenantId:'tenant-qa',status:'active',reasonCode:'TEST_CHANGE'})
  });
}
const env={DB:{prepare(){throw Error('DB_MUST_NOT_BE_CALLED');}},
  verifyPlatformCsrf:async()=>true};
for (const [mediaType,expected] of [
  ['application/json; malicious=1',415],
  ['application/json; charset=iso-8859-1',415],
  ['application/json; charset=utf-8; malicious=1',415],
  ['application/json;charset=UTF-8',503],
  ['application/json',503]
]) {
  test('platform JSON media type '+mediaType,async()=>{
    const response=await handlePlatformAdminRequest(request(mediaType),env,async()=>principal);
    assert.equal(response.status,expected);
    if(expected===415) assert.deepEqual(await response.json(),{error:'UNSUPPORTED_MEDIA_TYPE'});
  });
}

// A caller-supplied audit ID must still be rejected by the trusted adapter.
test('platform rejects caller-provided auditId after valid media type',async()=>{
  const r=new Request('https://example.test/api/platform/services',{
    method:'POST',headers:{origin:'https://example.test','sec-fetch-site':'same-origin',
      'content-type':'application/json','x-csrf-token':'synthetic'},
    body:JSON.stringify({tenantId:'tenant-qa',status:'active',reasonCode:'TEST_CHANGE',auditId:'forged'})
  });
  const response=await handlePlatformAdminRequest(r,env,async()=>principal);
  assert.equal(response.status,400);
  assert.deepEqual(await response.json(),{error:'INVALID_FIELDS'});
});
