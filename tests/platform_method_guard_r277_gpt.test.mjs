import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from '../deployment/cloudflare/platform_admin_http_gpt.mjs';

const principal={verified:true,kind:'system_admin',id:'sysadmin-qa'};
for (const [method,path] of [
  ['POST','/api/platform/tenant-services'],
  ['DELETE','/api/platform/tenant-services'],
  ['OPTIONS','/api/platform/plans'],
  ['PATCH','/api/platform/plans'],
]) {
  test(`R277 rejects ${method} ${path} before D1 or audit`,async()=>{
    let dbCalls=0, auditCalls=0;
    const db={
      get prepare(){dbCalls++; throw Error('D1 must not be accessed');},
      get batch(){dbCalls++; throw Error('D1 must not be accessed');}
    };
    const request=new Request('https://example.test'+path,{method});
    const response=await handlePlatformAdminRequest(request,{
      db,principal,csrfVerified:true,newAuditId(){auditCalls++;return 'audit-id';}
    });
    assert.equal(response.status,405);
    assert.deepEqual(await response.json(),{error:'METHOD_NOT_ALLOWED'});
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(dbCalls,0);
    assert.equal(auditCalls,0);
  });
}
test('R277 denies unverified identity before method checks',async()=>{
  const response=await handlePlatformAdminRequest(
    new Request('https://example.test/api/platform/plans',{method:'OPTIONS'}),
    {principal:{verified:false,kind:'system_admin',id:'untrusted'}}
  );
  assert.equal(response.status,403);
});
