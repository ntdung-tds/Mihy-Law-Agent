/** R44 isolated nonproduction Cloudflare mobile QA login.
 * Reuses a saved R40 QA password via server-side verifier; not production IAM.
 * Secure HttpOnly SameSite cookie; D1 session+membership verification.
 */
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const COOKIE="al_qa_session",MAX_BODY=4096,SESSION_LIFETIME=1800;
const json=(status,body,more={})=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer","Cross-Origin-Resource-Policy":"same-origin",...more}
});
const deny=()=>json(401,{error:"Thông tin đăng nhập không hợp lệ hoặc phiên đã hết hạn."});
const reject=()=>json(400,{error:"Yêu cầu không hợp lệ."});
const setCookie=(sid,age)=>COOKIE+"="+sid+"; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age="+age;
function getCookie(req){const m=(req.headers.get("Cookie")||"").match(/(?:^|;\s*)al_qa_session=([^;]+)/);return m&&UUID.test(m[1])?m[1]:null;}
function sameOrigin(req){const u=new URL(req.url);return u.protocol==="https:" && req.headers.get("Origin")===u.origin && req.headers.get("Sec-Fetch-Site")!=="cross-site";}
function allowed(env){return env?.AI_LAW_CF_MODE==="isolated-qa-only" && env.DB && UUID.test(env.INSTALLATION_ID||"") && /^https:\/\//.test(env.JWT_ISSUER||"");}
function hex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");}
function unhex(str){if(typeof str!=="string"||str.length%2!==0||!/^[0-9a-f]+$/.test(str))throw Error("Invalid hash");return Uint8Array.from(str.match(/../g),x=>parseInt(x,16));}
async function derive(password,salt,iterations){
  if(!Number.isInteger(iterations)||iterations<100000||iterations>250000)throw Error("Invalid iteration count");
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:unhex(salt),iterations},key,256)));
}
function equalHex(a,b){const x=unhex(a),y=unhex(b);if(x.length!==y.length)return false;let v=0;for(let i=0;i<x.length;i++)v|=x[i]^y[i];return v===0;}
async function ipKey(req,env){
  const input=(req.headers.get("CF-Connecting-IP")||"unknown").slice(0,128);
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.QA_RATE_PEPPER),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(input)))).slice(0,40);
}
async function allowAttempt(db,install,key,now){
  const start=Math.floor(now/300)*300;
  await db.prepare("INSERT INTO qa_login_rate(installation_id,rate_key,window_start,attempts) VALUES(?,?,?,1) ON CONFLICT(installation_id,rate_key) DO UPDATE SET attempts=CASE WHEN window_start=? THEN attempts+1 ELSE 1 END,window_start=?")
    .bind(install,key,start,start,start).run();
  const row=await db.prepare("SELECT attempts FROM qa_login_rate WHERE installation_id=? AND rate_key=? AND window_start=?").bind(install,key,start).first();
  return Number(row?.attempts||0)<=10;
}
export const COOKIE_SESSION_SQL=[
 "SELECT s.user_id,s.tenant_id,s.subject,s.expires_at,v.email,m.role_key,t.kind FROM qa_sessions s",
 "JOIN qa_principals p ON p.installation_id=s.installation_id AND p.user_id=s.user_id AND p.status='active'",
 "JOIN qa_memberships m ON m.installation_id=s.installation_id AND m.tenant_id=s.tenant_id AND m.user_id=s.user_id AND m.status='active'",
 "JOIN qa_tenants t ON t.installation_id=s.installation_id AND t.tenant_id=s.tenant_id",
 "JOIN qa_login_verifiers v ON v.installation_id=s.installation_id AND v.user_id=s.user_id AND v.subject=s.subject AND v.status='active'",
 "WHERE s.installation_id=? AND s.sid=? AND s.issuer=? AND s.revoked_at IS NULL AND s.expires_at>? LIMIT 1"
].join(" ");
export async function mobileSession(req,env,now){
  const sid=getCookie(req);if(!sid)return null;
  const p=await env.DB.prepare(COOKIE_SESSION_SQL).bind(env.INSTALLATION_ID,sid,env.JWT_ISSUER,now).first();
  return p?{sid,...p}:null;
}
// Bound to a verified QA cookie session, not an arbitrary caller-selected tenant.
const WORKSPACES_SQL=[
 "SELECT m.tenant_id,m.role_key,t.kind FROM qa_memberships m",
 "JOIN qa_tenants t ON t.installation_id=m.installation_id AND t.tenant_id=m.tenant_id",
 "WHERE m.installation_id=? AND m.user_id=? AND m.status='active'",
 "ORDER BY t.kind DESC,m.tenant_id LIMIT 20"
].join(" ");
async function workspaces(req,env,now){
  try{
    const p=await mobileSession(req,env,now);if(!p)return deny();
    const rows=await env.DB.prepare(WORKSPACES_SQL).bind(env.INSTALLATION_ID,p.user_id).all();
    return json(200,{current_tenant_id:p.tenant_id,workspaces:(rows.results||[]).map(w=>({
      tenant_id:w.tenant_id,workspace_type:w.kind,role:w.role_key
    }))});
  }catch{return json(503,{error:"Dịch vụ QA tạm thời không khả dụng."});}
}
const SWITCH_SQL=[
 "UPDATE qa_sessions SET sid=?,tenant_id=?",
 "WHERE installation_id=? AND sid=? AND issuer=? AND subject=? AND user_id=? AND tenant_id=?",
 "AND revoked_at IS NULL AND expires_at>?",
 "AND EXISTS(SELECT 1 FROM qa_memberships m WHERE m.installation_id=?",
 "AND m.tenant_id=? AND m.user_id=? AND m.status='active')"
].join(" ");
async function switchWorkspace(req,env,now){
  if(!sameOrigin(req)||!req.headers.get("Content-Type")?.startsWith("application/json")||
     Number(req.headers.get("Content-Length")||0)>256)return reject();
  let data;try{const raw=await req.text();if(raw.length>256)return reject();data=JSON.parse(raw);}catch{return reject();}
  if(!data||!UUID.test(data.tenant_id||""))return reject();
  try{
    const p=await mobileSession(req,env,now);if(!p)return deny();
    // Rotate the cookie/session ID atomically so old tabs cannot keep a previous tenant session.
    const rotated=crypto.randomUUID();
    const changed=await env.DB.prepare(SWITCH_SQL).bind(
      rotated,data.tenant_id,env.INSTALLATION_ID,p.sid,env.JWT_ISSUER,p.subject,
      p.user_id,p.tenant_id,now,env.INSTALLATION_ID,data.tenant_id,p.user_id
    ).run();
    if(changed.meta?.changes!==1)return json(404,{error:"Không tìm thấy không gian được phép truy cập."});
    const seconds=Math.max(1,Math.min(SESSION_LIFETIME,Number(p.expires_at)-now));
    return json(200,{ok:true},{"Set-Cookie":setCookie(rotated,seconds)});
  }catch{return json(503,{error:"Không thể chuyển không gian lúc này."});}
}
async function login(req,env,now){
  if(!sameOrigin(req)||!req.headers.get("Content-Type")?.startsWith("application/json")||Number(req.headers.get("Content-Length")||0)>MAX_BODY)return reject();
  let d;try{const raw=await req.text();if(raw.length>MAX_BODY)return reject();d=JSON.parse(raw);}catch{return reject();}
  const email=typeof d.email==="string"?d.email.trim().toLowerCase():"";
  const password=d.password;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=="string"||!password||password.length>512)return deny();
  try{
    if(typeof env.QA_RATE_PEPPER!=="string"||env.QA_RATE_PEPPER.length<24)return json(503,{error:"Dịch vụ QA chưa sẵn sàng."});
    if(!await allowAttempt(env.DB,env.INSTALLATION_ID,await ipKey(req,env),now))return json(429,{error:"Thử lại sau vài phút."});
    const a=await env.DB.prepare("SELECT email,user_id,subject,password_salt,password_hash,pbkdf2_iterations,status,failures,locked_until FROM qa_login_verifiers WHERE installation_id=? AND email=?")
      .bind(env.INSTALLATION_ID,email).first();
    if(!a||a.status!=="active"||(a.locked_until!==null&&a.locked_until>now))return deny();
    if(!equalHex(await derive(password,a.password_salt,a.pbkdf2_iterations),a.password_hash)){
      await env.DB.prepare("UPDATE qa_login_verifiers SET failures=MIN(5,failures+1),locked_until=CASE WHEN failures>=4 THEN ? ELSE locked_until END WHERE installation_id=? AND email=?")
        .bind(now+900,env.INSTALLATION_ID,email).run();
      return deny();
    }
    const tenant=await env.DB.prepare("SELECT m.tenant_id FROM qa_memberships m JOIN qa_tenants t ON t.installation_id=m.installation_id AND t.tenant_id=m.tenant_id JOIN qa_principals p ON p.installation_id=m.installation_id AND p.user_id=m.user_id WHERE m.installation_id=? AND m.user_id=? AND m.status='active' AND p.status='active' ORDER BY t.kind DESC,m.tenant_id LIMIT 1")
      .bind(env.INSTALLATION_ID,a.user_id).first();
    if(!tenant)return deny();
    const sid=crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO qa_sessions(installation_id,sid,issuer,subject,user_id,tenant_id,expires_at,revoked_at) VALUES(?,?,?,?,?,?,?,NULL)")
        .bind(env.INSTALLATION_ID,sid,env.JWT_ISSUER,a.subject,a.user_id,tenant.tenant_id,now+SESSION_LIFETIME),
      env.DB.prepare("UPDATE qa_login_verifiers SET failures=0,locked_until=NULL WHERE installation_id=? AND email=?")
        .bind(env.INSTALLATION_ID,email)
    ]);
    return json(200,{ok:true,expires_in:SESSION_LIFETIME},{"Set-Cookie":setCookie(sid,SESSION_LIFETIME)});
  }catch{return json(503,{error:"Dịch vụ QA tạm thời không khả dụng."});}
}
async function me(req,env,now){
  try{const p=await mobileSession(req,env,now);if(!p)return deny();
    return json(200,{email:p.email,tenant_id:p.tenant_id,role:p.role_key,
      workspace_type:p.kind,account_type:"qa_nonproduction",features_state:"not_yet_connected"});
  }catch{return json(503,{error:"Dịch vụ QA tạm thời không khả dụng."});}
}
async function logout(req,env,now){
  if(!sameOrigin(req))return reject();
  const sid=getCookie(req);
  try{if(sid)await env.DB.prepare("UPDATE qa_sessions SET revoked_at=? WHERE installation_id=? AND sid=? AND revoked_at IS NULL")
    .bind(now,env.INSTALLATION_ID,sid).run();
    return json(200,{ok:true},{"Set-Cookie":setCookie("",0)});
  }catch{return json(503,{error:"Đăng xuất chưa thành công, thử lại."});}
}
export async function mobileApi(req,env,opts={}){
  if(!allowed(env))return json(503,{error:"Dịch vụ QA chưa sẵn sàng."});
  const path=new URL(req.url).pathname,now=opts.now??Math.floor(Date.now()/1000);
  if(path==="/api/qa/login"&&req.method==="POST")return login(req,env,now);
  if(path==="/api/qa/session"&&req.method==="GET")return me(req,env,now);
  if(path==="/api/qa/workspaces"&&req.method==="GET")return workspaces(req,env,now);
  if(path==="/api/qa/switch-workspace"&&req.method==="POST")return switchWorkspace(req,env,now);
  if(path==="/api/qa/logout"&&req.method==="POST")return logout(req,env,now);
  return json(404,{error:"Không tìm thấy."});
}
