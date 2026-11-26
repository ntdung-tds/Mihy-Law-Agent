// R290: separate platform QA password issuer; no tenant credentials/roles are used.
const COOKIE='__Host-al_platform_session', TTL=1800, MAX=2048, SCHEME='hmac-sha256-random-v1';
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const HEX32=/^[0-9a-f]{32}$/, HEX64=/^[0-9a-f]{64}$/;
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','cross-origin-resource-policy':'same-origin'};
const reply=(status,data,more={})=>new Response(JSON.stringify(data),{status,headers:{...headers,...more}});
const deny=()=>reply(401,{error:'UNAUTHORIZED'});
const cookie=(token,age)=>COOKIE+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+age;
const sameOrigin=req=>req.headers.get('origin')===new URL(req.url).origin&&req.headers.get('sec-fetch-site')!=='cross-site';
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
const encoder=new TextEncoder();
async function digest(value){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));}
async function derive(password,salt,pepper){
 const key=await crypto.subtle.importKey('raw',encoder.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode('mihy-platform-login-v1:'+salt+':'+password))));
}
function equal(a,b){let diff=0;for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function readBody(req){
 const type=req.headers.get('content-type')||'';
 const length=req.headers.get('content-length');
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type)||req.headers.has('content-encoding')||
    (length!==null&&(!/^\d{1,5}$/.test(length)||Number(length)>MAX))||!req.body)throw Error('body');
 const reader=req.body.getReader();const chunks=[];let total=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;
   if(total>MAX){try{await reader.cancel();}catch{}throw Error('size');}chunks.push(value);}
 }finally{reader.releaseLock();}
 if(length!==null&&Number(length)!==total)throw Error('length');
 const bytes=new Uint8Array(total);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
const RATE_SQL="INSERT INTO platform_admin_login_rate(installation_id,window_start,attempts) VALUES(?,?,1) ON CONFLICT(installation_id) DO UPDATE SET attempts=CASE WHEN window_start=excluded.window_start THEN MIN(21,attempts+1) ELSE 1 END,window_start=excluded.window_start RETURNING attempts";
const CREDENTIAL_SQL="SELECT c.actor_id,c.salt,c.password_hash,c.scheme FROM platform_admin_credentials c JOIN platform_admin_principals p ON p.installation_id=c.installation_id AND p.actor_id=c.actor_id WHERE c.installation_id=? AND c.email=? AND p.status='active'";
const ISSUE_SQL="INSERT INTO platform_admin_sessions(installation_id,token_hash,actor_id,expires_at,revoked_at) SELECT c.installation_id,?,c.actor_id,?,NULL FROM platform_admin_credentials c JOIN platform_admin_principals p ON p.installation_id=c.installation_id AND p.actor_id=c.actor_id WHERE c.installation_id=? AND c.email=? AND c.actor_id=? AND c.salt=? AND c.password_hash=? AND c.scheme=? AND p.status='active'";
export async function loginPlatform(req,env,now){
 if(!sameOrigin(req))return reply(403,{error:'FORBIDDEN'});
 // QA only: operator-generated random 256-bit password, NOT a human-selected password.
 // Independent 256-bit pepper is a server secret; no low-entropy password KDF on Workers.
 // Explicit opt-in; do not enable this issuer merely by applying schema.
 if(env.PLATFORM_PASSWORD_LOGIN_GPT!=='enabled-qa-only'||!HEX64.test(env.PLATFORM_LOGIN_PEPPER_GPT||''))return reply(503,{error:'UNAVAILABLE'});
 let data;try{data=await readBody(req);}catch{return reply(400,{error:'BAD_REQUEST'});}
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==2||
    typeof data.email!=='string'||typeof data.password!=='string')return reply(400,{error:'BAD_REQUEST'});
 const email=data.email.trim().toLowerCase(),password=data.password;
 if(email.length>254||!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)||
    !HEX64.test(password))return deny();
 try{
  // Installation-wide fixed window bounds total verification, including unknown users.
  // Explicit QA tradeoff: shared cap can temporarily deny all logins; production requires stronger edge rate limits/MFA.
  const rate=await env.DB.prepare(RATE_SQL).bind(env.INSTALLATION_ID,Math.floor(now/300)*300).first();
  if(!Number.isInteger(rate?.attempts)||rate.attempts<1)return reply(503,{error:'UNAVAILABLE'});
  if(rate.attempts>20)return reply(429,{error:'RATE_LIMITED'},{'retry-after':String(300-now%300)});
  const row=await env.DB.prepare(CREDENTIAL_SQL).bind(env.INSTALLATION_ID,email).first();
  const valid=!!row&&ID.test(row.actor_id||'')&&HEX32.test(row.salt||'')&&HEX64.test(row.password_hash||'')&&row.scheme===SCHEME;
  const actual=await derive(password,valid?row.salt:'0'.repeat(32),env.PLATFORM_LOGIN_PEPPER_GPT);
  const match=equal(actual,valid?row.password_hash:'0'.repeat(64));
  if(!valid||!match)return deny();
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  // Recheck credential version and active principal in the INSERT itself to close read/write races.
  const result=await env.DB.prepare(ISSUE_SQL).bind(await digest(token),now+TTL,env.INSTALLATION_ID,email,row.actor_id,row.salt,row.password_hash,SCHEME).run();
  if(result?.success!==true||result.meta?.changes!==1)return deny();
  return reply(200,{ok:true,expires_in:TTL},{'set-cookie':cookie(token,TTL)});
 }catch{return reply(503,{error:'UNAVAILABLE'});}
}
export async function logoutPlatform(req,env,now,token,csrf){
 if(!sameOrigin(req)||!HEX64.test(req.headers.get('x-csrf-token')||'')||!equal(req.headers.get('x-csrf-token'),csrf))
  return reply(403,{error:'FORBIDDEN'});
 try{
  const r=await env.DB.prepare('UPDATE platform_admin_sessions SET revoked_at=? WHERE installation_id=? AND token_hash=? AND revoked_at IS NULL').bind(now,env.INSTALLATION_ID,await digest(token)).run();
  if(r?.success!==true||r.meta?.changes!==1)return reply(403,{error:'FORBIDDEN'});
  return reply(200,{ok:true},{'set-cookie':cookie('',0)});
 }catch{return reply(503,{error:'UNAVAILABLE'});}
}
