import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePlatformAdminRequest} from '../deployment/cloudflare/platform_admin_http_gpt.mjs';

test('alternate adapter retains 413 when oversized stream cancellation rejects', async () => {
  let dbCalls = 0;
  let auditCalls = 0;
  const db = {
    prepare() { dbCalls++; throw Error('DB must not be reached'); },
    batch() { dbCalls++; throw Error('DB must not be reached'); }
  };
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(2049)); },
    cancel() { throw Error('synthetic cancellation failure'); }
  });
  const request = new Request('https://example.test/api/platform/tenant-services', {
    method:'PATCH', headers:{'content-type':'application/json'}, body:stream, duplex:'half'
  });
  const response = await handlePlatformAdminRequest(request, {
    db, principal:{verified:true,kind:'system_admin',id:'qa-admin',impersonating:false},
    csrfVerified:true, newAuditId(){ auditCalls++; return 'audit-1'; }
  });
  assert.equal(response.status,413);
  assert.deepEqual(await response.json(),{error:'PAYLOAD_TOO_LARGE'});
  assert.equal(dbCalls,0);
  assert.equal(auditCalls,0);
});
