// QA-only catalog commands; verified platform session supplied exclusively by platformSessionApi.
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const HASH=/^[0-9a-f]{64}$/;
const REASON=/^[A-Z][A-Z0-9_]{1,79}$/;
const CONTROL=/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','cross-origin-resource-policy':'same-origin'};
const json=(status,data)=>{const body=JSON.stringify(data);return new Response(new TextEncoder().encode(body).byteLength<=32768?body:'{"error":"RESPONSE_TOO_LARGE"}',{status:new TextEncoder().encode(body).byteLength<=32768?status:503,headers:HEADERS});};
const validId=(v,max=120)=>typeof v==='string'&&v.length<=max&&ID.test(v);
const sameKeys=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.slice().sort().join('|');
function validDate(v){
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v.startsWith('0000'))return false;
 const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
async function body(req){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get('content-type')||'')||req.headers.has('content-encoding')||!req.body)throw Error('format');
 const l=req.headers.get('content-length');if(l!==null&&(!/^\d{1,5}$/.test(l)||Number(l)>2048))throw Error('size');
 const reader=req.body.getReader(),chunks=[];let n=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>2048){try{await reader.cancel();}catch{}throw Error('size');}chunks.push(value);}}finally{reader.releaseLock();}
 if(l!==null&&Number(l)!==n)throw Error('length');
 const out=new Uint8Array(n);let i=0;for(const c of chunks){out.set(c,i);i+=c.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(out));
}
function normalize(v){
 const base=['action','objectId','reasonCode'];
 if(!v||!validId(v.objectId)||typeof v.reasonCode!=='string'||!REASON.test(v.reasonCode))return null;
 if(['plan_create','plan_update'].includes(v.action)){
  if(!sameKeys(v,[...base,'planName','maxUsers','maxStorageBytes'])||!validId(v.objectId,80)||typeof v.planName!=='string'||v.planName!==v.planName.trim().normalize('NFC')||!v.planName.length||v.planName.length>120||CONTROL.test(v.planName)||!Number.isSafeInteger(v.maxUsers)||v.maxUsers<1||!Number.isSafeInteger(v.maxStorageBytes)||v.maxStorageBytes<0)return null;
  return [v.action,v.objectId,null,v.planName,v.maxUsers,v.maxStorageBytes,null,v.reasonCode];
 }
 if(v.action==='plan_retire'&&sameKeys(v,base)&&validId(v.objectId,80))return [v.action,v.objectId,null,null,null,null,null,v.reasonCode];
 if(['service_create','license_update'].includes(v.action)&&sameKeys(v,[...base,'planId','licenseExpiresAt'])&&validId(v.planId,80)&&validDate(v.licenseExpiresAt))
  return [v.action,v.objectId,v.planId,null,null,null,v.licenseExpiresAt,v.reasonCode];
 return null;
}
// Recheck current token and active principal inside the write statement, not just in a prior read.
const INSERT="INSERT INTO platform_catalog_events(event_id,installation_id,actor_id,action,object_id,plan_id,plan_name,max_users,max_storage_bytes,license_expires_at,reason_code,event_at) SELECT ?,s.installation_id,s.actor_id,?,?,?,?,?,?,?,?,? FROM platform_admin_sessions s JOIN platform_admin_principals p ON p.installation_id=s.installation_id AND p.actor_id=s.actor_id WHERE s.installation_id=? AND s.token_hash=? AND s.actor_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND p.status='active'";
export async function platformCatalogApi(req,env,context){
 const {actor,tokenHash,csrf,now}=context||{};
 if(!validId(actor)||!HASH.test(tokenHash||'')||!HASH.test(csrf||'')||!Number.isSafeInteger(now))return json(403,{error:'FORBIDDEN'});
 if(req.method==='GET'){
  try{
   const r=await env.DB.prepare('SELECT event_id,actor_id,action,object_id,reason_code,event_at FROM platform_catalog_events WHERE installation_id=? ORDER BY event_at DESC,event_id DESC LIMIT 50').bind(env.INSTALLATION_ID).all();
   if(r?.success!==true||!Array.isArray(r.results)||r.results.length>50)return json(503,{error:'UNAVAILABLE'});
   return json(200,{items:r.results.map(x=>({event_id:x.event_id,actor_id:x.actor_id,action:x.action,object_id:x.object_id,reason_code:x.reason_code,event_at:x.event_at}))});
  }catch{return json(503,{error:'UNAVAILABLE'});}
 }
 if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'});
 if(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site'||req.headers.get('x-csrf-token')!==csrf)return json(403,{error:'FORBIDDEN'});
 let values;try{values=normalize(await body(req));}catch{return json(400,{error:'BAD_INPUT'});}
 if(!values)return json(400,{error:'BAD_INPUT'});
 try{
  const eventId=crypto.randomUUID();
  const r=await env.DB.prepare(INSERT).bind(eventId,...values,now,env.INSTALLATION_ID,tokenHash,actor,now).run();
  if(r?.success!==true||r.meta?.changes!==1)return json(403,{error:'FORBIDDEN'});
  return json(201,{ok:true,eventId});
 }catch(e){
  // Do not expose raw SQL or database error text. Known SQLite constraints are safe generic conflicts.
  const message=typeof e?.message==='string'?e.message:'';
  return /constraint|conflict|invalid plan/i.test(message)?json(409,{error:'CONFLICT'}):json(503,{error:'UNAVAILABLE'});
 }
}
