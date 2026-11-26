import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from '../deployment/cloudflare/platform_admin_http_gpt.mjs';

const principal={id:'sys_1',kind:'system_admin',verified:true};
const payload=JSON.stringify({tenantId:'tenant_1',status:'suspended',reasonCode:'OWNER_APPROVED'});
function request(){
  return new Request('https://example.test/api/platform/tenant-services',{
    method:'PATCH',headers:{'content-type':'application/json'},body:payload
  });
}
for (const auditId of [undefined,null,'',' bad','x'.repeat(121),42,{},'bad/id']) {
  test('invalid trusted audit ID fails closed before database writes: '+String(auditId),async()=>{
    let writes=0;
    const db={prepare(){writes++;throw Error('must not reach DB')},batch(){writes++;throw Error('must not batch')}};
    const response=await handlePlatformAdminRequest(request(),{
      db,principal,csrfVerified:true,newAuditId:()=>auditId
    });
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'AUDIT_UNAVAILABLE'});
    assert.equal(writes,0);
  });
}
