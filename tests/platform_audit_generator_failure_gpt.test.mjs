import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from '../deployment/cloudflare/platform_admin_http_gpt.mjs';

const principal={id:'sys_1',kind:'system_admin',verified:true};
function request() {
  return new Request('https://example.test/api/platform/tenant-services',{
    method:'PATCH',headers:{'content-type':'application/json'},
    body:JSON.stringify({tenantId:'tenant_1',status:'suspended',reasonCode:'OWNER_APPROVED'})
  });
}
for (const error of [new Error('secret must not leak'),new TypeError('generator failed'),'unexpected']) {
  test('throwing trusted audit generator returns stable 503 and never touches DB',async()=>{
    let writes=0;
    const db={prepare(){writes++;throw Error('DB must not be called')},
      batch(){writes++;throw Error('batch must not be called')}};
    const response=await handlePlatformAdminRequest(request(),{
      db,principal,csrfVerified:true,newAuditId:()=>{throw error}
    });
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'AUDIT_UNAVAILABLE'});
    assert.equal(writes,0);
    assert.equal(response.headers.get('cache-control'),'no-store');
  });
}
