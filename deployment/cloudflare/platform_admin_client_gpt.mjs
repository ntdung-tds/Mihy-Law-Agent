// R278: browser-facing platform metadata client. Only use after the Worker
// has established a server-verified System Admin session; this is NOT an auth layer.
// Never put tenant business data, tokens or session identifiers in URLs.
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const REASON=/^[A-Z][A-Z0-9_]{1,79}$/;
const STATUSES=new Set(['active','suspended','revoked']);
const ENDPOINTS={plans:'/api/platform/plans',services:'/api/platform/tenant-services'};
function assertMetadata(items,kind) {
  if (!Array.isArray(items) || items.length>100) throw new Error('INVALID_RESPONSE');
  const keys=kind==='plans'
    ? ['plan_id','plan_name','status','max_users','max_storage_bytes']
    : ['tenant_id','plan_id','service_status','license_expires_at'];
  return items.map(row=>{
    if (!row || typeof row!=='object' || Array.isArray(row) ||
        Object.keys(row).sort().join('|')!==[...keys].sort().join('|'))
      throw new Error('INVALID_RESPONSE');
    if (kind==='plans') {
      if (!ID.test(row.plan_id) || typeof row.plan_name!=='string' ||
          !['active','retired'].includes(row.status) ||
          !Number.isSafeInteger(row.max_users) || row.max_users<1 ||
          !Number.isSafeInteger(row.max_storage_bytes) || row.max_storage_bytes<0)
        throw new Error('INVALID_RESPONSE');
    } else if (!ID.test(row.tenant_id) || !ID.test(row.plan_id) ||
      !['pending',...STATUSES].includes(row.service_status) ||
      !(row.license_expires_at===null || typeof row.license_expires_at==='string'))
      throw new Error('INVALID_RESPONSE');
    return Object.freeze(Object.fromEntries(keys.map(key=>[key,row[key]])));
  });
}
export function createPlatformAdminClient({fetchImpl,csrfToken}={}) {
  if (typeof fetchImpl!=='function') throw new TypeError('fetchImpl required');
  async function send(path,method,body,signal) {
    const headers={'accept':'application/json'};
    if (method==='PATCH') {
      if (typeof csrfToken!=='string' || !csrfToken || /[\r\n]/.test(csrfToken))
        throw new Error('CSRF_UNAVAILABLE');
      headers['content-type']='application/json';
      headers['x-csrf-token']=csrfToken;
    }
    const response=await fetchImpl(path,{
      method,headers,credentials:'same-origin',cache:'no-store',
      redirect:'error',signal,...(body?{body:JSON.stringify(body)}:{})
    });
    if (!response || !Number.isInteger(response.status)) throw new Error('NETWORK_ERROR');
    if (!response.ok) {
      // Do not echo server error bodies: they may contain unexpected sensitive data.
      const error=new Error('HTTP_'+response.status);
      error.status=response.status;
      throw error;
    }
    const type=response.headers?.get?.('content-type')||'';
    if (!/^application\/json(?:\s*;|\s*$)/i.test(type)) throw new Error('INVALID_RESPONSE');
    const text=await response.text();
    if (new TextEncoder().encode(text).byteLength>32768) throw new Error('INVALID_RESPONSE');
    let result;
    try { result=JSON.parse(text); } catch { throw new Error('INVALID_RESPONSE'); }
    return result;
  }
  return Object.freeze({
    async listPlans({signal}={}) {
      const result=await send(ENDPOINTS.plans,'GET',null,signal);
      if (!result || Object.keys(result).join('|')!=='items') throw new Error('INVALID_RESPONSE');
      return assertMetadata(result.items,'plans');
    },
    async listServices({signal}={}) {
      const result=await send(ENDPOINTS.services,'GET',null,signal);
      if (!result || Object.keys(result).join('|')!=='items') throw new Error('INVALID_RESPONSE');
      return assertMetadata(result.items,'services');
    },
    async changeService({tenantId,status,reasonCode,signal}={}) {
      if (typeof tenantId!=='string' || !ID.test(tenantId) ||
          !STATUSES.has(status) || typeof reasonCode!=='string' || !REASON.test(reasonCode))
        throw new Error('BAD_INPUT');
      const result=await send(ENDPOINTS.services,'PATCH',{tenantId,status,reasonCode},signal);
      if (!result || result.changed!==true || result.tenantId!==tenantId || result.status!==status ||
          Object.keys(result).sort().join('|')!=='changed|status|tenantId')
        throw new Error('INVALID_RESPONSE');
      return Object.freeze({changed:true,tenantId,status});
    }
  });
}
