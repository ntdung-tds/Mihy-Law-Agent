// R220: isolated HTTP adapter. The Worker must supply a server-verified principal
// and CSRF verdict. Never derive either from request headers, body or query params.
// Not mounted into Worker routes until session integration is reviewed.
import {listPlatformPlans, listTenantServices, changeTenantService} from './platform_admin_gpt.mjs';

const JSON_HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const PATHS = new Set(['/api/platform/plans','/api/platform/tenant-services']);
function reply(status, body) {
  const payload=JSON.stringify(body);
  // Bound responses at the server, not only in the browser client. Fail closed
  // without returning a truncated JSON document or partial tenant metadata.
  if (new TextEncoder().encode(payload).byteLength > 32768)
    return new Response(JSON.stringify({error:'RESPONSE_TOO_LARGE'}), {status:503,headers:JSON_HEADERS});
  return new Response(payload, {status, headers:JSON_HEADERS});
}
function permitted(principal) {
  return principal?.verified === true && principal.kind === 'system_admin' &&
    typeof principal.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(principal.id) &&
    principal.impersonating !== true;
}
export async function handlePlatformAdminRequest(request, {db, principal, csrfVerified=false, newAuditId}={}) {
  if (!(request instanceof Request)) return reply(400,{error:'BAD_REQUEST'});
  const url = new URL(request.url);
  if (!PATHS.has(url.pathname)) return reply(404,{error:'NOT_FOUND'});
  if (!permitted(principal)) return reply(403,{error:'FORBIDDEN'});
  // Unsupported methods must not touch D1 or generate audit identifiers.
  // In particular, a PATCH to the read-only plans endpoint is never a mutation.
  if (request.method !== 'GET' && request.method !== 'PATCH')
    return reply(405,{error:'METHOD_NOT_ALLOWED'});
  if (request.method === 'PATCH' && url.pathname !== '/api/platform/tenant-services')
    return reply(405,{error:'METHOD_NOT_ALLOWED'});
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') return reply(503,{error:'SERVICE_UNAVAILABLE'});
  if (url.search) return reply(400,{error:'QUERY_NOT_SUPPORTED'});
  try {
    if (request.method === 'GET') {
      if (url.pathname === '/api/platform/plans') {
        const rows = await listPlatformPlans(db,principal);
        // Explicit response allowlist, even if a DB mock returns extra fields.
        return reply(200,{items:rows.map(x=>({
          plan_id:x.plan_id,plan_name:x.plan_name,status:x.status,
          max_users:x.max_users,max_storage_bytes:x.max_storage_bytes
        }))});
      }
      const rows = await listTenantServices(db,principal);
      // Never serialize unexpected business-data columns, even on a faulty DB adapter.
      return reply(200,{items:rows.map(x=>({
        tenant_id:x.tenant_id,plan_id:x.plan_id,service_status:x.service_status,
        license_expires_at:x.license_expires_at
      }))});
    }
    if (request.method !== 'PATCH' || url.pathname !== '/api/platform/tenant-services')
      return reply(405,{error:'METHOD_NOT_ALLOWED'});
    if (csrfVerified !== true) return reply(403,{error:'CSRF_FORBIDDEN'});
    // Reject unsupported media types and cap bytes before allocating the JSON body.
    const contentType=request.headers.get('content-type')||'';
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8")\s*)?$/i.test(contentType))
      return reply(415,{error:'UNSUPPORTED_MEDIA_TYPE'});
    // Only identity-encoded JSON is accepted; never interpret compressed or transformed bodies.
    const contentEncoding=request.headers.get('content-encoding');
    if (contentEncoding && contentEncoding.trim().toLowerCase() !== 'identity')
      return reply(415,{error:'UNSUPPORTED_CONTENT_ENCODING'});
    const declared=request.headers.get('content-length');
    if (declared && (!/^[0-9]+$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared)>2048))
      return reply(413,{error:'PAYLOAD_TOO_LARGE'});
    if (!request.body) return reply(400,{error:'INVALID_JSON'});
    let data;
    try {
      const reader=request.body.getReader();
      const chunks=[];
      let bytes=0;
      try {
        while (true) {
          const {done,value}=await reader.read();
          if (done) break;
          bytes+=value.byteLength;
          if (bytes>2048) { try { await reader.cancel(); } catch { /* best-effort cleanup */ } return reply(413,{error:'PAYLOAD_TOO_LARGE'}); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      // A declared length that differs from the streamed body is malformed; fail before mutation.
      if (declared !== null && bytes !== Number(declared)) return reply(400,{error:'INVALID_BODY_LENGTH'});
      const buffer=new Uint8Array(bytes);
      let offset=0;
      for (const chunk of chunks) { buffer.set(chunk,offset); offset+=chunk.byteLength; }
      data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
    } catch { return reply(400,{error:'INVALID_JSON'}); }
    if (!data || Array.isArray(data) || typeof data !== 'object' ||
        Object.keys(data).sort().join(',') !== 'reasonCode,status,tenantId')
      return reply(400,{error:'BAD_INPUT'});
    // Validate mutation fields before requesting an audit ID or opening D1.
    // The domain service independently validates the same fields (defence in depth).
    const validId = value => typeof value === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value);
    if (!validId(data.tenantId) ||
        !['active','suspended','revoked'].includes(data.status) ||
        typeof data.reasonCode !== 'string' ||
        !/^[A-Z][A-Z0-9_]{1,79}$/.test(data.reasonCode))
      return reply(400,{error:'BAD_INPUT'});
    if (typeof newAuditId !== 'function') return reply(503,{error:'AUDIT_UNAVAILABLE'});
    // Audit ID generated by trusted Worker, not supplied by client.
    let auditId;
    try {
      auditId=newAuditId();
    } catch {
      // Trusted infrastructure failure: do not attempt a tenant service mutation.
      return reply(503,{error:'AUDIT_UNAVAILABLE'});
    }
    // Failure of the trusted audit-ID generator is infrastructure failure, not client input.
    // Reject before any D1 mutation; never leak generated IDs to the response.
    if (typeof auditId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(auditId))
      return reply(503,{error:'AUDIT_UNAVAILABLE'});
    const result=await changeTenantService(db,principal,{...data,auditId});
    return reply(result.changed?200:409,result.changed?{changed:true,tenantId:result.tenantId,status:result.status}:{error:'NO_TRANSITION'});
  } catch (error) {
    if (/^PLATFORM_BAD_/.test(error?.message||'')) return reply(400,{error:'BAD_INPUT'});
    return reply(503,{error:'SERVICE_UNAVAILABLE'});
  }
}
