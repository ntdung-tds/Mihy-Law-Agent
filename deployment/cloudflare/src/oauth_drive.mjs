/* R73 isolated QA Google Drive OAuth, using PKCE and encrypted per-tenant refresh tokens.
   Application OAuth credentials are not the ChatGPT Google Drive connector. */
import {mobileSession} from './mobile_auth.mjs';
import {GoogleDriveAdapter} from './google_drive.mjs';
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const FILE_ID=/^[A-Za-z0-9_-]{10,200}$/;
const SCOPE='https://www.googleapis.com/auth/drive.file';
const CALLBACK='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev/api/qa/drive/callback';
const RETURN_URL='https://ai-law-web-qa.iaict-platform.workers.dev/app';
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
async function begin(req,env,now){
 if(!originOkay(req))return out(403,{error:'CSRF_DENIED'});
 const p=await mobileSession(req,env,now);
 if(!p)return out(401,{error:'Phiên đăng nhập không hợp lệ.'});
 if(p.role_key!=='tenant_admin')return out(403,{error:'Cần quyền quản trị đơn vị.'});
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
function failed(){
 // Fail closed without revealing the Google authorization code or OAuth state.
 // Return to the same document screen even when the user cancels consent.
 return new Response(null,{status:303,headers:{
  Location:RETURN_URL+'?drive=failed#documents','Cache-Control':'no-store',
  'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
}
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
 if(!actor||actor.role_key!=='tenant_admin')return failed();
 const grant=await token({grant_type:'authorization_code',code,
  redirect_uri:CALLBACK,code_verifier:verifier},env,opts);
 if(typeof grant.refresh_token!=='string'||grant.refresh_token.length<15)return failed();
 const old=await env.DB.prepare('SELECT root_id FROM qa_drive_connections WHERE installation_id=? AND tenant_id=?')
  .bind(env.INSTALLATION_ID,record.tenant_id).first();
 const root=await folder(grant.access_token,opts,old?.root_id);
 const after=await env.DB.prepare(CHECK_SESSION_SQL).bind(...params).first();
 if(!after||after.role_key!=='tenant_admin')return failed();
 const secret=await encrypt(grant.refresh_token,env,'refresh',record.tenant_id);
 await env.DB.prepare('INSERT INTO qa_drive_connections (installation_id,tenant_id,encrypted_refresh,root_id,scope,connected_by,connected_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(installation_id,tenant_id) DO UPDATE SET encrypted_refresh=excluded.encrypted_refresh,root_id=excluded.root_id,connected_by=excluded.connected_by,connected_at=excluded.connected_at')
  .bind(env.INSTALLATION_ID,record.tenant_id,secret,root,SCOPE,record.user_id,now).run();
 return new Response(null,{status:303,headers:{Location:RETURN_URL+'?drive=connected#documents',
  'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
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
 return out(200,{connected:configured&&!!row,can_connect:p.role_key==='tenant_admin',
  configuration_ready:configured,connected_at:configured?row?.connected_at||null:null});
}
export async function oauthDriveApi(req,env,opts={}){
 const path=new URL(req.url).pathname,now=opts.now??Math.floor(Date.now()/1000);
 try{
  if(path==='/api/qa/drive/status'&&req.method==='GET')return await status(req,env,now);
  if(!ready(env))return path==='/api/qa/drive/callback'?failed():unavailable();
  if(path==='/api/qa/drive/connect'&&req.method==='POST')return await begin(req,env,now);
  if(path==='/api/qa/drive/callback'&&req.method==='GET')return await callback(req,env,now,opts);
  return out(405,{error:'Method not allowed'});
 }catch{return path==='/api/qa/drive/callback'?failed():unavailable();}
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
