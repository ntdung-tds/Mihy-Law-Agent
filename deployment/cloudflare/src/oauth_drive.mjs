/* R73 isolated QA Google Drive OAuth, using PKCE and encrypted per-tenant refresh tokens.
   Application OAuth credentials are not the ChatGPT Google Drive connector. */
import {mobileSession} from './mobile_auth.mjs';
import {GoogleDriveAdapter} from './google_drive.mjs';
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const FILE_ID=/^[A-Za-z0-9_-]{10,200}$/;
const SCOPE='https://www.googleapis.com/auth/drive.file';
const CALLBACK='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev/api/qa/drive/callback';
const RETURN_URL='https://ai-law-web-qa.iaict-platform.workers.dev/drive-return';
const te=new TextEncoder(),td=new TextDecoder();
const out=(status,data)=>new Response(JSON.stringify(data),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const unavailable=()=>out(503,{error:'Google Drive chưa được cấu hình cho AI Law QA.'});
export function ready(env){
 return env?.AI_LAW_CF_MODE==='isolated-qa-only'&&env.DB&&UUID.test(env.INSTALLATION_ID||'')&&
  /^[0-9a-zA-Z_.-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_OAUTH_CLIENT_ID||'')&&
  typeof env.GOOGLE_OAUTH_CLIENT_SECRET==='string'&&env.GOOGLE_OAUTH_CLIENT_SECRET.length>=8&&
  /^[a-fA-F0-9]{64}$/.test(env.QA_DRIVE_TOKEN_KEY||'');
}
const originOkay=req=>{const u=new URL(req.url);return u.protocol==='https:'&&
 req.headers.get('Origin')===u.origin&&req.headers.get('Sec-Fetch-Site')!=='cross-site'};
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const b64=b=>btoa(String.fromCharCode(...b)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
function un64(s){if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s))throw Error('encoding');
 const a=s.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(a+'='.repeat((4-a.length%4)%4)),c=>c.charCodeAt(0));}
const digest=async v=>new Uint8Array(await crypto.subtle.digest('SHA-256',typeof v==='string'?te.encode(v):v));
const key=env=>crypto.subtle.importKey('raw',Uint8Array.from(env.QA_DRIVE_TOKEN_KEY.match(/../g),x=>parseInt(x,16)),
 'AES-GCM',false,['encrypt','decrypt']);
const aad=(kind,env,t)=>te.encode(kind+'|'+env.INSTALLATION_ID+'|'+t);
async function encrypt(v,env,kind,t){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const c=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(kind,env,t)},
  await key(env),te.encode(v)));
 return b64(new Uint8Array([...iv,...c]));
}
async function decrypt(v,env,kind,t){
 const b=un64(v);if(b.length<29)throw Error('ciphertext too short');
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b.slice(0,12),
  additionalData:aad(kind,env,t)},await key(env),b.slice(12));
 return td.decode(plain);
}
async function token(fields,env,opts){
 const res=await (opts.googleFetch??fetch)('https://oauth2.googleapis.com/token',{
  method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded',
   'Accept':'application/json'},body:new URLSearchParams({
    client_id:env.GOOGLE_OAUTH_CLIENT_ID,client_secret:env.GOOGLE_OAUTH_CLIENT_SECRET,...fields
   }).toString()
 });
 if(!res||res.status!==200)throw Error('Token endpoint denied');
 const d=await res.json();
 if(typeof d.access_token!=='string'||d.access_token.length<15||
    (d.token_type&&String(d.token_type).toLowerCase()!=='bearer')||
    (d.scope&&!String(d.scope).split(/\s+/).includes(SCOPE)))throw Error('Unexpected grant');
 return d;
}
export const CHECK_SESSION_SQL=[
 'SELECT s.user_id,s.tenant_id,m.role_key FROM qa_sessions s',
 "JOIN qa_principals p ON p.installation_id=s.installation_id AND p.user_id=s.user_id AND p.status='active'",
 "JOIN qa_memberships m ON m.installation_id=s.installation_id AND m.tenant_id=s.tenant_id AND m.user_id=s.user_id AND m.status='active'",
 "JOIN qa_login_verifiers v ON v.installation_id=s.installation_id AND v.user_id=s.user_id AND v.subject=s.subject AND v.status='active'",
 'WHERE s.installation_id=? AND s.sid=? AND s.issuer=? AND s.tenant_id=?',
 'AND s.user_id=? AND s.revoked_at IS NULL AND s.expires_at>? LIMIT 1'
].join(' ');
// A personal workspace may be connected only by its sole active member.
// Organization Drive still requires tenant_admin; role alone never changes
// another organization's storage grant.
export const PERSONAL_OWNER_SQL=[
 'SELECT 1 AS ok FROM qa_tenants t JOIN qa_memberships m',
 'ON m.installation_id=t.installation_id AND m.tenant_id=t.tenant_id',
 "WHERE t.installation_id=? AND t.tenant_id=? AND t.kind='personal'",
 "AND m.user_id=? AND m.role_key='lawyer' AND m.status='active'",
 'AND NOT EXISTS (SELECT 1 FROM qa_memberships other',
 'WHERE other.installation_id=t.installation_id AND other.tenant_id=t.tenant_id',
 "AND other.user_id<>m.user_id AND other.status='active') LIMIT 1"
].join(' ');
async function canConnect(env,session){
 if(!UUID.test(session?.tenant_id||'')||!UUID.test(session?.user_id||''))return false;
 if(session.role_key==='tenant_admin')return true;
 if(session.role_key!=='lawyer')return false;
 const row=await env.DB.prepare(PERSONAL_OWNER_SQL)
  .bind(env.INSTALLATION_ID,session.tenant_id,session.user_id).first();
 return !!row;
}
async function begin(req,env,now){
 if(!originOkay(req))return out(403,{error:'CSRF_DENIED'});
 const p=await mobileSession(req,env,now);
 if(!p)return out(401,{error:'Phiên đăng nhập không hợp lệ.'});
 if(!await canConnect(env,p))return out(403,{error:'Không có quyền kết nối Drive cho không gian này.'});
 const state=b64(crypto.getRandomValues(new Uint8Array(32)));
 const verifier=b64(crypto.getRandomValues(new Uint8Array(32)));
 const hash=hex(await digest(state));
 const sql='INSERT INTO qa_drive_oauth_pending (installation_id,state_hash,tenant_id,user_id,sid_cipher,verifier_cipher,created_at,expires_at,used_at) VALUES(?,?,?,?,?,?,?,?,NULL)';
 await env.DB.prepare(sql).bind(env.INSTALLATION_ID,hash,p.tenant_id,p.user_id,
  await encrypt(p.sid,env,'sid',p.tenant_id),
  await encrypt(verifier,env,'pkce',p.tenant_id),now,now+600).run();
 const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 u.search=new URLSearchParams({client_id:env.GOOGLE_OAUTH_CLIENT_ID,
  redirect_uri:CALLBACK,response_type:'code',scope:SCOPE,access_type:'offline',
  prompt:'consent',state,code_challenge_method:'S256',
  code_challenge:b64(await digest(verifier))}).toString();
 return out(200,{authorization_url:u.toString(),expires_in:600});
}
// The Google callback is cross-site. A direct 303 to /app can hide the
// SameSite=Strict QA session cookie and trigger an unnecessary login screen.
// A public first-party /drive-return document (HTTP 200) makes the next
// same-origin navigation to /app without relaxing cookie security.
function finished(kind,reason){
 const target=new URL(RETURN_URL);
 target.searchParams.set('drive',kind);
 if(kind==='failed'&&['consent','session','provider','drive','save'].includes(reason))
  target.searchParams.set('issue',reason);
 // Never put authorization code, state, session or provider token in a URL.
 return new Response(null,{status:303,headers:{
  Location:target.toString(),'Cache-Control':'no-store',
  'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
}
const failed=reason=>finished('failed',reason||'consent');
async function folder(access,opts,existing){
 const f=opts.googleFetch??fetch;
 if(existing){
  if(!FILE_ID.test(existing))throw Error('Bad root');
  const r=await f('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(existing)+
   '?fields=id,mimeType,trashed&supportsAllDrives=true',
   {method:'GET',redirect:'manual',headers:{Authorization:'Bearer '+access}});
  if(!r||r.status!==200)throw Error('Old root denied');
  const d=await r.json();
  if(d.id!==existing||d.mimeType!=='application/vnd.google-apps.folder'||d.trashed!==false)
   throw Error('Old root invalid');
  return existing;
 }
 const r=await f('https://www.googleapis.com/drive/v3/files?fields=id,mimeType,trashed',
  {method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},
   body:JSON.stringify({name:'AI Law QA - Private Documents',mimeType:'application/vnd.google-apps.folder'})});
 if(!r||![200,201].includes(r.status))throw Error('Root creation failed');
 const d=await r.json();
 if(!FILE_ID.test(d.id||'')||d.mimeType!=='application/vnd.google-apps.folder'||d.trashed===true)
  throw Error('Unexpected root');
 return d.id;
}
async function callback(req,env,now,opts){
 const u=new URL(req.url),state=u.searchParams.get('state'),code=u.searchParams.get('code');
 if(u.searchParams.has('error')||!state||state.length!==43||!code||code.length>2048)return failed();
 const hash=hex(await digest(state));
 const record=await env.DB.prepare('SELECT tenant_id,user_id,sid_cipher,verifier_cipher,expires_at,used_at FROM qa_drive_oauth_pending WHERE installation_id=? AND state_hash=?')
  .bind(env.INSTALLATION_ID,hash).first();
 if(!record||record.used_at!==null||record.expires_at<=now||!UUID.test(record.tenant_id))return failed();
 const consumed=await env.DB.prepare('UPDATE qa_drive_oauth_pending SET used_at=? WHERE installation_id=? AND state_hash=? AND used_at IS NULL AND expires_at>?')
  .bind(now,env.INSTALLATION_ID,hash,now).run();
 if(consumed.meta?.changes!==1)return failed();
 const sid=await decrypt(record.sid_cipher,env,'sid',record.tenant_id);
 const verifier=await decrypt(record.verifier_cipher,env,'pkce',record.tenant_id);
 const params=[env.INSTALLATION_ID,sid,env.JWT_ISSUER,record.tenant_id,record.user_id,now];
 const actor=await env.DB.prepare(CHECK_SESSION_SQL).bind(...params).first();
 if(!actor||!await canConnect(env,actor))return failed('session');
 let grant;
 try{
  grant=await token({grant_type:'authorization_code',code,
   redirect_uri:CALLBACK,code_verifier:verifier},env,opts);
 }catch{return failed('provider');}
 if(typeof grant.refresh_token!=='string'||grant.refresh_token.length<15)return failed('provider');
 const old=await env.DB.prepare('SELECT root_id FROM qa_drive_connections WHERE installation_id=? AND tenant_id=?')
  .bind(env.INSTALLATION_ID,record.tenant_id).first();
 let root;
 try{root=await folder(grant.access_token,opts,old?.root_id);}
 catch{return failed('drive');}
 const after=await env.DB.prepare(CHECK_SESSION_SQL).bind(...params).first();
 if(!after||!await canConnect(env,after))return failed('session');
 const secret=await encrypt(grant.refresh_token,env,'refresh',record.tenant_id);
 try{
  await env.DB.prepare('INSERT INTO qa_drive_connections (installation_id,tenant_id,encrypted_refresh,root_id,scope,connected_by,connected_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(installation_id,tenant_id) DO UPDATE SET encrypted_refresh=excluded.encrypted_refresh,root_id=excluded.root_id,connected_by=excluded.connected_by,connected_at=excluded.connected_at')
   .bind(env.INSTALLATION_ID,record.tenant_id,secret,root,SCOPE,record.user_id,now).run();
 }catch{return failed('save');}
 return finished('connected');
}
// Disconnect only the current tenant's AI Law-held credential. Deliberately
// do not call Google's global revocation endpoint, which could invalidate the
// same Google account's grant for another tenant, or delete any Drive files.
// Existing receipts and file links remain for a future reconnection.
async function disconnect(req,env,now){
 if(env?.AI_LAW_CF_MODE!=='isolated-qa-only'||!env.DB||!UUID.test(env.INSTALLATION_ID||''))
  return unavailable();
 if(!originOkay(req))return out(403,{error:'CSRF_DENIED'});
 const p=await mobileSession(req,env,now);
 if(!p)return out(401,{error:'Phiên đăng nhập không hợp lệ.'});
 if(!await canConnect(env,p))return out(403,{error:'Không có quyền ngắt kết nối Drive của không gian này.'});
 // A single D1 batch is transactional. Remove stored refresh credentials and
 // invalidate pending authorizations for this tenant, never other tenants.
 const changes=await env.DB.batch([
  env.DB.prepare('DELETE FROM qa_drive_connections WHERE installation_id=? AND tenant_id=?')
   .bind(env.INSTALLATION_ID,p.tenant_id),
  env.DB.prepare('DELETE FROM qa_drive_oauth_pending WHERE installation_id=? AND tenant_id=?')
   .bind(env.INSTALLATION_ID,p.tenant_id)
 ]);
 if(!Array.isArray(changes)||changes.length!==2||changes.some(x=>x.success===false))
  return unavailable();
 return out(200,{connected:false,disconnected:true,files_preserved:true});
}
// Reuse only the connected person's existing authorization for the browser.
// Tenant-wide Drive access is NOT a delegation to every tenant member.
// Returns short-lived ACCESS token only (never an encrypted refresh grant).
async function browserAccess(req,env,now,opts){
 if(!originOkay(req))return out(403,{error:'CSRF_DENIED'});
 const p=await mobileSession(req,env,now);
 if(!p)return out(401,{error:'Phiên AI Law đã hết hạn.'});
 if(!await canConnect(env,p))return out(403,{error:'Chỉ tài khoản đã kết nối Drive mới được sử dụng quyền này.'});
 const row=await env.DB.prepare(
  'SELECT encrypted_refresh,connected_by,scope FROM qa_drive_connections WHERE installation_id=? AND tenant_id=?')
  .bind(env.INSTALLATION_ID,p.tenant_id).first();
 if(!row||row.connected_by!==p.user_id||row.scope!==SCOPE)
  return out(403,{error:'Tài khoản này chưa có kết nối Google riêng.'});
 let grant;
 try{
  const refresh=await decrypt(row.encrypted_refresh,env,'refresh',p.tenant_id);
  grant=await token({grant_type:'refresh_token',refresh_token:refresh},env,opts);
 }catch{return out(503,{error:'Không thể gia hạn kết nối Google Drive. Hãy kết nối lại khi cần.'});}
 // Recheck the owner and the active session after remote refresh. A concurrent
 // disconnect/account switch must fail closed.
 const [latest,active]=await Promise.all([
  env.DB.prepare('SELECT connected_by,scope FROM qa_drive_connections WHERE installation_id=? AND tenant_id=?')
   .bind(env.INSTALLATION_ID,p.tenant_id).first(),
  mobileSession(req,env,now)]);
 if(!latest||latest.connected_by!==p.user_id||latest.scope!==SCOPE||
    !active||active.user_id!==p.user_id||active.tenant_id!==p.tenant_id)
  return out(403,{error:'Kết nối Google đã thay đổi.'});
 return out(200,{access_token:grant.access_token,expires_in:Math.min(3600,Math.max(60,Number(grant.expires_in||3000))),scope:SCOPE});
}
async function status(req,env,now){
 // The signed-in user's UI must receive a useful status even before the
 // operator has registered this application's Google OAuth client.
 if(!env?.DB||!UUID.test(env.INSTALLATION_ID||''))return unavailable();
 const p=await mobileSession(req,env,now);
 if(!p)return out(401,{error:'Phiên đăng nhập không hợp lệ.'});
 const configured=ready(env);
 const row=await env.DB.prepare('SELECT connected_at FROM qa_drive_connections WHERE installation_id=? AND tenant_id=?')
  .bind(env.INSTALLATION_ID,p.tenant_id).first();
 return out(200,{connected:configured&&!!row,can_connect:await canConnect(env,p),
  configuration_ready:configured,connected_at:configured?row?.connected_at||null:null});
}
export async function oauthDriveApi(req,env,opts={}){
 const path=new URL(req.url).pathname,now=opts.now??Math.floor(Date.now()/1000);
 try{
  if(path==='/api/qa/drive/status'&&req.method==='GET')return await status(req,env,now);
  if(path==='/api/qa/drive/disconnect'&&req.method==='POST')return await disconnect(req,env,now);
  if(path==='/api/qa/drive/browser-access'&&req.method==='POST'){
   if(!ready(env))return unavailable();
   return await browserAccess(req,env,now,opts);
  }
  if(!ready(env))return path==='/api/qa/drive/callback'?failed():unavailable();
  if(path==='/api/qa/drive/connect'&&req.method==='POST')return await begin(req,env,now);
  if(path==='/api/qa/drive/callback'&&req.method==='GET')return await callback(req,env,now,opts);
  return out(405,{error:'Method not allowed'});
 }catch{return path==='/api/qa/drive/callback'?failed('save'):unavailable();}
}
export async function tenantDriveAdapter(env,p,opts={}){
 if(!ready(env)||!UUID.test(p?.tenant_id||''))throw Error('OAuth unavailable');
 const row=await env.DB.prepare('SELECT encrypted_refresh,root_id FROM qa_drive_connections WHERE installation_id=? AND tenant_id=?')
  .bind(env.INSTALLATION_ID,p.tenant_id).first();
 if(!row||!FILE_ID.test(row.root_id||''))throw Error('No tenant grant');
 const refresh=await decrypt(row.encrypted_refresh,env,'refresh',p.tenant_id);
 const grant=await token({grant_type:'refresh_token',refresh_token:refresh},env,opts);
 return new GoogleDriveAdapter({accessToken:grant.access_token,rootId:row.root_id,
  fetcher:opts.googleFetch??fetch});
}
