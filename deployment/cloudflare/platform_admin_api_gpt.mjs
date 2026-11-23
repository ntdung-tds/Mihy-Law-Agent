// R221: browser transport for the isolated platform admin UI.
// The hosting Worker must authenticate the session and authorize the route.
// Never read bearer tokens, roles or tenant identity from browser storage.
const PATH='/api/platform/';
const STATUS=new Set(['active','suspended','revoked']);
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const REASON=/^[A-Z][A-Z0-9_]{1,79}$/;
const PLAN_FIELDS=['plan_id','plan_name','status','max_users','max_storage_bytes'];
const SERVICE_FIELDS=['tenant_id','plan_id','service_status','license_expires_at'];
function safeList(items,fields) {
  if (!Array.isArray(items)||items.length>100) throw new Error('PLATFORM_INVALID_RESPONSE');
  return items.map(item=>{
    if (!item||typeof item!=='object'||Array.isArray(item)) throw new Error('PLATFORM_INVALID_RESPONSE');
    const clean=Object.create(null);
    for(const field of fields){
      const value=item[field];
      if (field==='max_users'||field==='max_storage_bytes') {
        if (!Number.isSafeInteger(value)||value<0) throw new Error('PLATFORM_INVALID_RESPONSE');
      } else if (field==='license_expires_at') {
        if (value!==null&&typeof value!=='string') throw new Error('PLATFORM_INVALID_RESPONSE');
      } else if (typeof value!=='string'||value.length>256) throw new Error('PLATFORM_INVALID_RESPONSE');
      clean[field]=value;
    }
    return clean;
  });
}
export function createPlatformAdminApi({fetchImpl=globalThis.fetch,csrfToken}={}) {
  if (typeof fetchImpl!=='function' || typeof csrfToken!=='function') throw new Error('PLATFORM_TRANSPORT_UNAVAILABLE');
  async function call(path,options={}) {
    const response=await fetchImpl(PATH+path,{
      ...options,credentials:'same-origin',redirect:'error',cache:'no-store',
      headers:{accept:'application/json',...(options.headers||{})}
    });
    if (!response || !response.ok) throw new Error('PLATFORM_REQUEST_FAILED');
    if (!(response.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))
      throw new Error('PLATFORM_INVALID_RESPONSE');
    // Bound untrusted response bytes before JSON parsing. A compromised or misrouted
    // endpoint must not force an unbounded browser allocation.
    const declared=response.headers.get('content-length');
    if (declared && (!/^\\d+$/.test(declared) || Number(declared)>65536))
      throw new Error('PLATFORM_INVALID_RESPONSE');
    if (!response.body || typeof response.body.getReader!=='function')
      throw new Error('PLATFORM_INVALID_RESPONSE');
    const reader=response.body.getReader();
    const chunks=[];
    let bytes=0;
    try {
      while (true) {
        const {done,value}=await reader.read();
        if (done) break;
        bytes+=value.byteLength;
        if (bytes>65536) {
          await reader.cancel();
          throw new Error('PLATFORM_INVALID_RESPONSE');
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const buffer=new Uint8Array(bytes);
    let offset=0;
    for (const chunk of chunks) {buffer.set(chunk,offset);offset+=chunk.byteLength;}
    let data;
    try {data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));}
    catch {throw new Error('PLATFORM_INVALID_RESPONSE');}
    if (!data || !Array.isArray(data.items) && options.method!=='PATCH')
      throw new Error('PLATFORM_INVALID_RESPONSE');
    return data;
  }
  return Object.freeze({
    async listPlans(){return safeList((await call('plans')).items,PLAN_FIELDS);},
    async listTenantServices(){return safeList((await call('tenant-services')).items,SERVICE_FIELDS);},
    async changeService({tenantId,status,reasonCode}={}) {
      if (typeof tenantId!=='string'||!ID.test(tenantId)||!STATUS.has(status)||
          typeof reasonCode!=='string'||!REASON.test(reasonCode))
        throw new Error('PLATFORM_BAD_INPUT');
      const csrf=csrfToken();
      if (typeof csrf!=='string'||!csrf||csrf.length>512) throw new Error('PLATFORM_CSRF_UNAVAILABLE');
      const result=await call('tenant-services',{method:'PATCH',headers:{
        'content-type':'application/json','x-csrf-token':csrf
      },body:JSON.stringify({tenantId,status,reasonCode})});
      if (result.changed!==true || result.tenantId!==tenantId || result.status!==status)
        throw new Error('PLATFORM_INVALID_RESPONSE');
      return result;
    }
  });
}
