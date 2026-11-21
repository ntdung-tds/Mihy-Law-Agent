// R234: platform-only HTTP adapter. Mount only behind a server-side session resolver.
// The resolver MUST validate the session against the server's session store.
// Never derive the principal from request headers, cookies alone, or JSON body.
import {listPlatformPlans, listTenantServices, changeTenantService} from './platform_admin_gpt.mjs';

const json = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff'}
});
const error = (status, code) => json({error:code},status);
const paths = new Set(['/api/platform/plans','/api/platform/services']);
export async function handlePlatformAdminRequest(request, env, resolveVerifiedPrincipal) {
  let url;
  try { url = new URL(request.url); } catch { return error(400,'BAD_REQUEST'); }
  if (!paths.has(url.pathname)) return error(404,'NOT_FOUND');
  if (request.method !== 'GET' && request.method !== 'POST') return error(405,'METHOD_NOT_ALLOWED');
  if (request.method === 'POST' && url.pathname !== '/api/platform/services') return error(405,'METHOD_NOT_ALLOWED');
  if (url.search) return error(400,'BAD_REQUEST');
  if (!env?.DB || typeof resolveVerifiedPrincipal !== 'function') return error(503,'UNAVAILABLE');
  let principal;
  try { principal = await resolveVerifiedPrincipal(request,env); }
  catch { return error(401,'UNAUTHORIZED'); }
  if (!principal || principal.verified !== true || principal.kind !== 'system_admin' ||
      principal.impersonating === true) return error(403,'FORBIDDEN');
  try {
    if (request.method === 'GET') {
      const result = url.pathname === '/api/platform/plans'
        ? await listPlatformPlans(env.DB,principal)
        : await listTenantServices(env.DB,principal);
      return json({items:result});
    }
    // Origin and Fetch Metadata are defense-in-depth; actual session + CSRF is mandatory.
    const origin = request.headers.get('origin');
    const site = request.headers.get('sec-fetch-site');
    if (!origin || origin !== url.origin || site === 'cross-site') return error(403,'CROSS_ORIGIN');
    const contentType = request.headers.get('content-type') || '';
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return error(415,'UNSUPPORTED_MEDIA_TYPE');
    const csrf = request.headers.get('x-csrf-token');
    if (!csrf || typeof env.verifyPlatformCsrf !== 'function' ||
        await env.verifyPlatformCsrf(request,principal,csrf) !== true) return error(403,'CSRF_INVALID');
    let input;
    try {
      const raw = await request.text();
      if (raw.length > 2048) return error(413,'PAYLOAD_TOO_LARGE');
      input = JSON.parse(raw);
    } catch { return error(400,'BAD_JSON'); }
    if (!input || Array.isArray(input) || typeof input !== 'object') return error(400,'BAD_INPUT');
    // Exact mutation schema: reject extra fields rather than silently accepting\n    // unreviewed client instructions or prototype-polluting JSON properties.\n    const allowed = new Set(['tenantId','status','auditId','reasonCode']);\n    if (Object.keys(input).length !== allowed.size ||\n        Object.keys(input).some(key => !allowed.has(key))) return error(400,'BAD_INPUT');\n    const result = await changeTenantService(env.DB,principal,input);
    return json(result);
  } catch (e) {
    const code = typeof e?.message === 'string' ? e.message : '';
    if (code === 'PLATFORM_FORBIDDEN') return error(403,'FORBIDDEN');
    if (code.startsWith('PLATFORM_BAD_')) return error(400,'BAD_INPUT');
    // Do not disclose SQL, tenant identifiers, session details or audit internals.
    return error(503,'PLATFORM_UNAVAILABLE');
  }
}
