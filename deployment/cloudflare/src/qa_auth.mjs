/* R44: nonproduction ONLY mobile QA sign-in using existing 32-character
 * random R40 passwords. D1 stores separately derived PBKDF2-SHA256 verifiers
 * (not the R40 Argon2 hashes) and only SHA256 opaque cookie token digests.
 * No real clients, no OAuth provider, no production IAM/MFA.
 */
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const COOKIE="__Host-al-qa-session";
const TTL=7200;
const MAX_BODY=4096;
const ROUNDS=20000; // test-only high-entropy 32-char passwords; NOT production KDF policy
const enc=new TextEncoder();
const authHeaders={
 "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
 "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
 "X-Frame-Options":"DENY",
 "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'"
};
const reply=(code,body,headers={})=>new Response(JSON.stringify(body),{
 status:code,headers:{...authHeaders,...headers}
});
const unknown=()=>reply(401,{code:"INVALID_CREDENTIALS_OR_SESSION"});
const unsafe=()=>reply(403,{code:"FORBIDDEN"});
const offline=()=>reply(503,{code:"QA_AUTH_UNAVAILABLE"});
const invalid=()=>reply(400,{code:"INVALID_REQUEST"});
const to64=bytes=>{
 let bin="";for(const b of bytes)bin+=String.fromCharCode(b);
 return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
};
const from64=text=>{
 if(typeof text!=="string"||!/^[A-Za-z0-9_-]+$/.test(text)||text.length>200)
   throw Error("invalid base64url");
 const value=text.replace(/-/g,"+").replace(/_/g,"/");
 return Uint8Array.from(atob(value+"=".repeat((4-value.length%4)%4)),x=>x.charCodeAt(0));
};
const randomBytes=n=>crypto.getRandomValues(new Uint8Array(n));
const digest=async text=>to64(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(text))));
const fixedEqual=(a,b)=>{
 if(a.length!==b.length)return false;
 let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];
 return mismatch===0;
};
async function derive(pass,salt,rounds=ROUNDS){
 const key=await crypto.subtle.importKey("raw",enc.encode(pass),"PBKDF2",false,["deriveBits"]);
 const bits=await crypto.subtle.deriveBits({
   name:"PBKDF2",hash:"SHA-256",salt:from64(salt),iterations:rounds
 },key,256);
 return new Uint8Array(bits);
}
export async function qaVerifier(password,salt,rounds=ROUNDS){
 return to64(await derive(password,salt,rounds));
}
export function authEnabled(env){
 return env?.AI_LAW_CF_MODE==="isolated-qa-only"&&
   env.QA_AUTH_ENABLED==="true"&&!!env.DB&&UUID.test(env.INSTALLATION_ID||"");
}
function cookieFrom(req){
 const value=req.headers.get("Cookie")||"";
 const match=/(?:^|;\s*)__Host-al-qa-session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(value);
 return match?.[1]||null;
}
function makeCookie(value,maxAge=TTL){
 return COOKIE+"="+value+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age="+maxAge;
}
function csrfValid(request,expected){
 const csrf=request.headers.get("X-CSRF-Token")||"";
 return typeof expected==="string"&&csrf.length>20&&csrf===expected;
}
function sameOrigin(request){
 const origin=request.headers.get("Origin");
 const site=request.headers.get("Sec-Fetch-Site");
 return origin===new URL(request.url).origin&&(!site||site==="same-origin"||site==="none");
}
async function data(request){
 const t=request.headers.get("Content-Type")||"";
 if(!/^application\/json(?:;|$)/i.test(t))throw Error("content type");
 if(Number(request.headers.get("Content-Length")||0)>MAX_BODY)throw Error("too large");
 const body=await request.text();
 if(body.length>MAX_BODY)throw Error("too large");
 const obj=JSON.parse(body);
 if(!obj||typeof obj!=="object"||Array.isArray(obj))throw Error("bad body");
 return obj;
}
const WORKSPACES=[
 "SELECT m.tenant_id,m.role_key,t.kind,COALESCE(l.label,t.kind) AS label",
 "FROM qa_memberships m JOIN qa_tenants t ON t.installation_id=m.installation_id AND t.tenant_id=m.tenant_id",
 "LEFT JOIN qa_workspace_labels l ON l.installation_id=m.installation_id AND l.tenant_id=m.tenant_id",
 "WHERE m.installation_id=? AND m.user_id=? AND m.status='active'",
 "ORDER BY CASE WHEN t.kind='organization' THEN 0 ELSE 1 END,m.tenant_id"
].join(" ");
const SESSION=[
 "SELECT s.user_id,s.tenant_id,s.token_digest,s.csrf_digest,s.email,m.role_key",
 "FROM qa_web_sessions s",
 "JOIN qa_principals p ON p.installation_id=s.installation_id AND p.user_id=s.user_id AND p.status='active'",
 "JOIN qa_memberships m ON m.installation_id=s.installation_id AND m.user_id=s.user_id",
 "AND m.tenant_id=s.tenant_id AND m.status='active'",
 "WHERE s.installation_id=? AND s.token_digest=? AND s.revoked_at IS NULL",
 "AND s.expires_at>? LIMIT 1"
].join(" ");

export async function sessionForRequest(request,env,now=Math.floor(Date.now()/1000)){
 if(!authEnabled(env))return null;
 const token=cookieFrom(request);
 if(!token)return null;
 const token_digest=await digest(token);
 try{
   const item=await env.DB.prepare(SESSION).bind(env.INSTALLATION_ID,token_digest,now).first();
   if(!item||!UUID.test(item.user_id)||!UUID.test(item.tenant_id))return null;
   return item;
 }catch{return null;}
}
async function workspaceList(env,user_id){
 const res=await env.DB.prepare(WORKSPACES).bind(env.INSTALLATION_ID,user_id).all();
 return res?.results||[];
}
async function sessionResponse(session,env,csrf,cookie=null){
 const spaces=await workspaceList(env,session.user_id);
 const current=spaces.find(s=>s.tenant_id===session.tenant_id);
 if(!current)return unknown();
 const clean=spaces.map(x=>({
   tenant_id:x.tenant_id,role_key:x.role_key,kind:x.kind,label:x.label
 }));
 return reply(200,{
   authenticated:true,
   account:{email:session.email,role_key:current.role_key},
   current:{tenant_id:current.tenant_id,label:current.label,
            role_key:current.role_key,kind:current.kind},
   workspaces:clean,csrf,
   qa_only:true
 },cookie?{"Set-Cookie":makeCookie(cookie)}:{});
}
async function login(request,env,now){
 let body;
 try{body=await data(request);}catch{return invalid();}
 const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
 const password=body.password;
 if(email.length<5||email.length>254||
    !/^[a-z0-9._+-]+@[a-z0-9.-]+$/.test(email)||
    typeof password!=="string"||password.length<1||password.length>128)
   return unknown();
 // Hash login attempt keys: no IP/email string disclosure in rate-limit table.
 const ip=request.headers.get("CF-Connecting-IP")||"no-ip";
 const attemptKey=await digest(env.INSTALLATION_ID+"\n"+email+"\n"+ip);
 try{
   const current=await env.DB.prepare(
     "SELECT attempts,window_start FROM qa_auth_attempts WHERE installation_id=? AND attempt_key=?"
   ).bind(env.INSTALLATION_ID,attemptKey).first();
   if(current&&current.window_start+900>now&&current.attempts>=5)
     return reply(429,{code:"TOO_MANY_ATTEMPTS"});
   const account=await env.DB.prepare([
     "SELECT a.email,a.user_id,a.salt,a.verifier,a.rounds,p.status",
     "FROM qa_password_accounts a JOIN qa_principals p",
     "ON p.installation_id=a.installation_id AND p.user_id=a.user_id",
     "WHERE a.installation_id=? AND a.email=? LIMIT 1"
   ].join(" ")).bind(env.INSTALLATION_ID,email).first();
   // Equal computational work even for unknown users and disabled accounts.
   const fakeSalt="AAAAAAAAAAAAAAAAAAAAAA";
   const expected=account?.verifier||"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
   const salt=account?.salt||fakeSalt;
   const rounds=Number.isInteger(account?.rounds)&&account.rounds===ROUNDS?account.rounds:ROUNDS;
   const actual=await derive(password,salt,rounds);
   let verified=false;
   try{verified=fixedEqual(actual,from64(expected));}catch{verified=false;}
   const spaces=account&&verified&&account.status==="active"
     ?await workspaceList(env,account.user_id):[];
   if(!account||!verified||account.status!=="active"||spaces.length===0){
     await env.DB.prepare([
       "INSERT INTO qa_auth_attempts(installation_id,attempt_key,attempts,window_start)",
       "VALUES(?,?,1,?) ON CONFLICT(installation_id,attempt_key)",
       "DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,",
       "window_start=CASE WHEN window_start<? THEN ? ELSE window_start END"
     ].join(" ")).bind(env.INSTALLATION_ID,attemptKey,now,now-900,now-900,now).run();
     return unknown();
   }
   const selected=spaces[0]; // organization first; user can choose another after login
   const token=to64(randomBytes(32)),csrf=to64(randomBytes(24));
   const sid=crypto.randomUUID();
   await env.DB.prepare([
     "INSERT INTO qa_web_sessions(installation_id,sid,token_digest,user_id,tenant_id,",
     "csrf_digest,created_at,expires_at,revoked_at,email) VALUES(?,?,?,?,?,?,?,?,NULL,?)"
   ].join(" ")).bind(env.INSTALLATION_ID,sid,await digest(token),
      account.user_id,selected.tenant_id,csrf,now,now+TTL,account.email).run();
   await env.DB.prepare(
     "DELETE FROM qa_auth_attempts WHERE installation_id=? AND attempt_key=?"
   ).bind(env.INSTALLATION_ID,attemptKey).run();
   return sessionResponse({...account,tenant_id:selected.tenant_id},env,csrf,token);
 }catch{return offline();}
}
async function getMe(request,env,now){
 const s=await sessionForRequest(request,env,now);
 if(!s)return unknown();
 return sessionResponse(s,env,s.csrf_digest);
}
async function switchWorkspace(request,env,now){
 const s=await sessionForRequest(request,env,now);
 if(!s)return unknown();
 if(!csrfValid(request,s.csrf_digest))return unsafe();
 let body;try{body=await data(request);}catch{return invalid();}
 if(!UUID.test(body.tenant_id||""))return invalid();
 try{
   const spaces=await workspaceList(env,s.user_id);
   if(!spaces.some(x=>x.tenant_id===body.tenant_id))return reply(404,{code:"WORKSPACE_NOT_AUTHORIZED"});
   const csrf=to64(randomBytes(24));
   const state=await env.DB.prepare([
     "UPDATE qa_web_sessions SET tenant_id=?,csrf_digest=? WHERE",
     "installation_id=? AND token_digest=? AND revoked_at IS NULL AND expires_at>?"
   ].join(" ")).bind(body.tenant_id,csrf,env.INSTALLATION_ID,s.token_digest,now).run();
   if(state.meta?.changes!==1)return unknown();
   return sessionResponse({...s,tenant_id:body.tenant_id},env,csrf);
 }catch{return offline();}
}
async function logout(request,env,now){
 const s=await sessionForRequest(request,env,now);
 if(!s)return reply(200,{authenticated:false},
   {"Set-Cookie":makeCookie("",0)});
 if(!csrfValid(request,s.csrf_digest))return unsafe();
 try{
   await env.DB.prepare([
     "UPDATE qa_web_sessions SET revoked_at=?",
     "WHERE installation_id=? AND token_digest=? AND revoked_at IS NULL"
   ].join(" ")).bind(now,env.INSTALLATION_ID,s.token_digest).run();
   return reply(200,{authenticated:false},{"Set-Cookie":makeCookie("",0)});
 }catch{return offline();}
}
export async function accessQaLogin(env, userId, email, now=Math.floor(Date.now()/1000)){
 if(!authEnabled(env)||!UUID.test(userId)||typeof email!=="string")return offline();
 try{
   const principal=await env.DB.prepare(
     "SELECT status FROM qa_principals WHERE installation_id=? AND user_id=?"
   ).bind(env.INSTALLATION_ID,userId).first();
   if(principal?.status!=="active")return unknown();
   const spaces=await workspaceList(env,userId);
   if(!spaces.length)return unknown();
   const token=to64(randomBytes(32)),csrf=to64(randomBytes(24));
   await env.DB.prepare([
     "INSERT INTO qa_web_sessions(installation_id,sid,token_digest,user_id,tenant_id,",
     "csrf_digest,created_at,expires_at,revoked_at,email) VALUES(?,?,?,?,?,?,?,?,NULL,?)"
   ].join(" ")).bind(env.INSTALLATION_ID,crypto.randomUUID(),await digest(token),
     userId,spaces[0].tenant_id,csrf,now,now+TTL,email).run();
   return new Response(null,{status:303,headers:{
     "Location":"/","Cache-Control":"no-store","Set-Cookie":makeCookie(token)
   }});
 }catch{return offline();}
}

export async function authRoute(request,env,options={}){
 if(!authEnabled(env))return offline();
 const path=new URL(request.url).pathname,now=options.now??Math.floor(Date.now()/1000);
 if(path==="/v1/auth/me"&&request.method==="GET")return getMe(request,env,now);
 if(!["/v1/auth/login","/v1/auth/switch","/v1/auth/logout"].includes(path)||
    request.method!=="POST")return reply(404,{code:"NOT_FOUND"});
 if(!sameOrigin(request))return unsafe();
 if(path==="/v1/auth/login")return login(request,env,now);
 if(path==="/v1/auth/switch")return switchWorkspace(request,env,now);
 return logout(request,env,now);
}
