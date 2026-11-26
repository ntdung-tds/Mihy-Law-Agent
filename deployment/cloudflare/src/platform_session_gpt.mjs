// R288: isolated QA platform session boundary. Never use qa_memberships or tenant roles.
import {platformCatalogApi} from './platform_catalog_gpt.mjs';
import {loginPlatform,logoutPlatform} from './platform_login_gpt.mjs';
import {handlePlatformAdminRequest} from '../platform_http_gpt.mjs';
const TOKEN=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const COOKIE='__Host-al_platform_session';
const PATHS=new Set(['/api/platform/session','/api/platform/plans','/api/platform/services','/api/platform/login','/api/platform/logout','/api/platform/catalog']);
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','cross-origin-resource-policy':'same-origin'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
export const PLATFORM_SESSION_SQL=[
  'SELECT s.actor_id FROM platform_admin_sessions s',
  'JOIN platform_admin_principals p ON p.installation_id=s.installation_id AND p.actor_id=s.actor_id',
  "WHERE s.installation_id=? AND s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND p.status='active' LIMIT 1"
].join(' ');
async function digest(value){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
}
function tokenFrom(req){
  const matches=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
  if(matches.length!==1)return null;
  const token=matches[0].slice(COOKIE.length+1);
  return TOKEN.test(token)?token:null;
}
function equal(a,b){
  if(typeof a!=='string'||typeof b!=='string'||!TOKEN.test(a)||!TOKEN.test(b))return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
export async function platformSessionApi(request,env,options={}){
  const url=new URL(request.url);
  if(!PATHS.has(url.pathname))return reply(404,{error:'NOT_FOUND'});
  if(url.protocol!=='https:'||url.search)return reply(400,{error:'BAD_REQUEST'});
  const postOnly=['/api/platform/login','/api/platform/logout'].includes(url.pathname);
  if(postOnly?request.method!=='POST':request.method!=='GET'&&!(request.method==='POST'&&['/api/platform/services','/api/platform/catalog'].includes(url.pathname)))
    return reply(405,{error:'METHOD_NOT_ALLOWED'});
  if(env?.AI_LAW_CF_MODE!=='isolated-qa-only'||!UUID.test(env.INSTALLATION_ID||'')||
     !env.DB||typeof env.DB.prepare!=='function'||typeof env.DB.batch!=='function')
    return reply(503,{error:'UNAVAILABLE'});
  const now=options.now??Math.floor(Date.now()/1000);
  if(url.pathname==='/api/platform/login')return loginPlatform(request,env,now);
  const token=tokenFrom(request);
  if(!token)return reply(401,{error:'UNAUTHORIZED'});
  try{
    const tokenHash=await digest(token);
    const row=await env.DB.prepare(PLATFORM_SESSION_SQL).bind(env.INSTALLATION_ID,tokenHash,now).first();
    if(!row||typeof row.actor_id!=='string'||!ID.test(row.actor_id))return reply(403,{error:'FORBIDDEN'});
    const principal=Object.freeze({verified:true,kind:'system_admin',id:row.actor_id,impersonating:false});
    const csrf=await digest('mihy-platform-csrf-v1:'+token);
    if(url.pathname==='/api/platform/catalog')return platformCatalogApi(request,env,{actor:row.actor_id,tokenHash,csrf,now});
    if(url.pathname==='/api/platform/logout')return logoutPlatform(request,env,now,token,csrf);
    if(url.pathname==='/api/platform/session')return reply(200,{kind:'system_admin',csrfToken:csrf});
    // Only the validated platform session can produce the principal and CSRF verdict.
    // No client-provided role, tenant header or ordinary QA cookie is consulted.
    return await handlePlatformAdminRequest(request,{DB:env.DB,verifyPlatformCsrf:async(req,p,value)=>p===principal&&equal(value,csrf)},async()=>principal);
  }catch{return reply(503,{error:'UNAVAILABLE'});}
}
