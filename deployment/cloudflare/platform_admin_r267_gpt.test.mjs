import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from './platform_admin_http_gpt.mjs';

const principal={verified:true,kind:'system_admin',id:'sys-test'};
const payload=JSON.stringify({tenantId:'tenant-test',status:'suspended',reasonCode:'POLICY_REVIEW'});
async function send(encoding) {
  let calls=0,audits=0;
  const db={prepare(){calls++;throw Error('unexpected D1 access');},batch(){calls++;throw Error('unexpected D1 batch');}};
  const headers={'content-type':'application/json'};
  if (encoding!==null) headers['content-encoding']=encoding;
  const request=new Request('https://example.invalid/api/platform/tenant-services',{method:'PATCH',headers,body:payload});
  const response=await handlePlatformAdminRequest(request,{db,principal,csrfVerified:true,newAuditId:()=>{audits++;return 'audit-test';}});
  return {response,data:await response.json(),calls,audits};
}
for (const encoding of ['gzip','br','gzip, identity']) {
  test('R267: reject '+encoding+' before audit and D1',async()=>{
    const x=await send(encoding);
    assert.equal(x.response.status,415);
    assert.equal(x.data.error,'UNSUPPORTED_CONTENT_ENCODING');
    assert.equal(x.calls,0);
    assert.equal(x.audits,0);
  });
}
test('R267: identity encoding is not rejected as unsupported',async()=>{
  const x=await send('identity');
  assert.notEqual(x.data.error,'UNSUPPORTED_CONTENT_ENCODING');
});
