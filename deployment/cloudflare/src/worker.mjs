/* R43 Cloudflare Free + D1 READ-ONLY authorization proof, NONPRODUCTION ONLY.
   JWT must be RS256 at+jwt from a trusted issuer; D1 session/member/ACL
   checks are explicit because SQLite has no PostgreSQL FORCE RLS. */
import { GoogleDriveAdapter } from "./google_drive.mjs";
import { mobileApi } from "./mobile_auth.mjs";
import { accountApi } from "./account_profile.mjs";
import { matterApi } from "./matter_workspace.mjs";
import { documentsApi } from "./qa_documents.mjs";
import { oauthDriveApi } from "./oauth_drive.mjs";
import { MOBILE_CSS, MOBILE_JS } from "./mobile_assets.mjs";

const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const result=(status,data)=>new Response(JSON.stringify(data),{status,headers:{
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY","Referrer-Policy":"no-referrer",
  "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'",
}});
const deny=()=>result(401,{code:"UNAUTHENTICATED"});
const missing=()=>result(404,{code:"NOT_FOUND_OR_NOT_AUTHORIZED"});
const unavailable=()=>result(503,{code:"DEPENDENCY_UNAVAILABLE"});

function decode64(data){
  if(typeof data!=="string"||!/^[A-Za-z0-9_-]+$/.test(data))throw Error("bad base64url");
  const str=data.replace(/-/g,"+").replace(/_/g,"/");
  return Uint8Array.from(atob(str+"=".repeat((4-str.length%4)%4)),x=>x.charCodeAt(0));
}
function validEnv(env){
  return env?.AI_LAW_CF_MODE==="isolated-qa-only" && env.DB &&
    UUID.test(env.INSTALLATION_ID||"") && /^https:\/\//.test(env.JWT_ISSUER||"") &&
    env.JWT_AUDIENCE==="ai-law-api" && typeof env.JWT_JWKS_JSON==="string";
}
export async function verifyBearer(req,env,now=Math.floor(Date.now()/1000)){
  if(!validEnv(env))return null;
  const auth=req.headers.get("Authorization");
  if(!auth?.startsWith("Bearer "))return null;
  const token=auth.slice(7);
  if(token.length<128||token.length>8192||!/^[\x21-\x7e]+$/.test(token))return null;
  const parts=token.split(".");
  if(parts.length!==3)return null;
  try{
    const h=JSON.parse(new TextDecoder().decode(decode64(parts[0])));
    if(h?.alg!=="RS256"||!["at+jwt","application/at+jwt"].includes(h.typ)||
       typeof h.kid!=="string"||!h.kid||h.kid.length>128||
       ["jku","jwk","x5u","x5c","crit"].some(k=>Object.hasOwn(h,k)))return null;
    const jwks=JSON.parse(env.JWT_JWKS_JSON);
    if(!Array.isArray(jwks?.keys)||jwks.keys.length>8)return null;
    const k=jwks.keys.find(x=>x.kid===h.kid);
    if(k?.kty!=="RSA"||k.alg!=="RS256"||k.use!=="sig"||
       typeof k.n!=="string"||typeof k.e!=="string")return null;
    const key=await crypto.subtle.importKey("jwk",
      {kty:"RSA",n:k.n,e:k.e,alg:"RS256",ext:true},
      {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
    if(!await crypto.subtle.verify("RSASSA-PKCS1-v1_5",
      key,decode64(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1])))return null;
    const c=JSON.parse(new TextDecoder().decode(decode64(parts[1])));
    if(c?.iss!==env.JWT_ISSUER||c.aud!==env.JWT_AUDIENCE||
       typeof c.sub!=="string"||!c.sub||c.sub.length>254||
       typeof c.sid!=="string"||!UUID.test(c.sid)||
       !["exp","iat","nbf"].every(k=>Number.isInteger(c[k]))||
       c.iat>now||c.nbf>now||c.exp<=now||c.exp-c.iat>900||
       c.iat<c.nbf-60||c.iat<now-901)return null;
    return {issuer:c.iss,subject:c.sub,sid:c.sid};
  }catch{return null;}
}
export const SESSION_SQL=[
"SELECT s.user_id,s.tenant_id FROM qa_sessions s",
"JOIN qa_principals p ON p.installation_id=s.installation_id AND p.user_id=s.user_id",
"JOIN qa_memberships m ON m.installation_id=s.installation_id AND m.user_id=s.user_id AND m.tenant_id=s.tenant_id",
"JOIN qa_tenants t ON t.installation_id=m.installation_id AND t.tenant_id=m.tenant_id",
"WHERE s.installation_id=? AND s.sid=? AND s.issuer=? AND s.subject=?",
"AND s.revoked_at IS NULL AND s.expires_at>? AND p.status='active' AND m.status='active' LIMIT 1"
].join(" ");
const ACL=[
"AND EXISTS (SELECT 1 FROM qa_matter_acl a WHERE a.installation_id=m.installation_id",
"AND a.tenant_id=m.tenant_id AND a.matter_id=m.matter_id AND a.user_id=?",
"AND a.permission='read' AND a.effect='allow' AND a.acl_version=m.acl_version",
"AND a.valid_from<=? AND (a.valid_to IS NULL OR a.valid_to>?))",
"AND NOT EXISTS (SELECT 1 FROM qa_matter_acl d WHERE d.installation_id=m.installation_id",
"AND d.tenant_id=m.tenant_id AND d.matter_id=m.matter_id AND d.user_id=?",
"AND d.permission='read' AND d.effect='deny' AND d.acl_version=m.acl_version",
"AND d.valid_from<=? AND (d.valid_to IS NULL OR d.valid_to>?))"
].join(" ");
export const RUN_SQL=[
"SELECT r.payload FROM qa_runs r JOIN qa_matters m",
"ON m.installation_id=r.installation_id AND m.tenant_id=r.tenant_id AND m.matter_id=r.matter_id",
"WHERE r.installation_id=? AND r.tenant_id=? AND r.run_id=?",ACL,"LIMIT 1"
].join(" ");
export const FILE_SQL=[
"SELECT f.file_id,f.provider,f.provider_object_id,f.mime_type FROM qa_file_links f JOIN qa_matters m",
"ON m.installation_id=f.installation_id AND m.tenant_id=f.tenant_id AND m.matter_id=f.matter_id",
"WHERE f.installation_id=? AND f.tenant_id=? AND f.file_id=?",ACL,"LIMIT 1"
].join(" ");
const params=(env,session,id,now)=>[
 env.INSTALLATION_ID,session.tenant_id,id,
 session.user_id,now,now,session.user_id,now,now
];
export async function handle(request,env,options={}){
  const url=new URL(request.url);
  if(url.pathname==="/" && request.method==="GET"){
    // R98: Only one customer-facing QA entry point. The Worker still serves
    // tenant auth, document APIs and the Google OAuth callback on this host.
    // Never forward query strings, credentials or browser session cookies.
    return new Response(null,{status:302,headers:{
      "Location":"https://ai-law-web-qa.iaict-platform.workers.dev/",
      "Cache-Control":"no-store","Referrer-Policy":"no-referrer",
      "X-Content-Type-Options":"nosniff"
    }});
  }
  if(url.pathname==="/mobile.css" && request.method==="GET")
    return new Response(MOBILE_CSS,{headers:{"Content-Type":"text/css; charset=utf-8","Cache-Control":"public, max-age=300","X-Content-Type-Options":"nosniff"}});
  if(url.pathname==="/mobile.js" && request.method==="GET")
    return new Response(MOBILE_JS,{headers:{"Content-Type":"application/javascript; charset=utf-8","Cache-Control":"public, max-age=300","X-Content-Type-Options":"nosniff"}});
  if(url.pathname==="/api/qa/profile"||url.pathname==="/api/qa/profile/avatar")
    return accountApi(request,env,options);
  if(url.pathname==="/api/qa/matters")return matterApi(request,env,options);
  if(["/api/qa/drive/connect","/api/qa/drive/disconnect","/api/qa/drive/status","/api/qa/drive/callback"].includes(url.pathname))
    return oauthDriveApi(request,env,options);
  if(url.pathname==="/api/qa/documents"||
     ["/api/qa/documents/upload/start","/api/qa/documents/upload/finish"].includes(url.pathname)||
     /^\/api\/qa\/documents\/[0-9a-f-]{36}\/download$/.test(url.pathname))
    return documentsApi(request,env,options);
  if(url.pathname.startsWith("/api/qa/"))return mobileApi(request,env,options);
  if(request.method!=="GET"||url.search||request.headers.has("X-AI-LAW-TENANT"))return missing();
  if(url.pathname==="/health")return result(validEnv(env)?200:503,{
    status:validEnv(env)?"configured":"unavailable",scope:"nonprod_qa_only",
  });
  const route=/^\/v1\/(runs|files)\/([A-Za-z0-9_-]{1,64})(\/metadata|\/download)?$/.exec(url.pathname);
  if(!route || (route[1]==="runs" && route[3]) ||
      (route[1]==="files" && !["/metadata","/download"].includes(route[3])))return missing();
  if(!validEnv(env))return unavailable();
  const now=options.now??Math.floor(Date.now()/1000);
  const identity=await verifyBearer(request,env,now);
  if(!identity)return deny();
  try{
    const session=await env.DB.prepare(SESSION_SQL).bind(env.INSTALLATION_ID,
      identity.sid,identity.issuer,identity.subject,now).first();
    if(!session||!UUID.test(session.user_id)||!UUID.test(session.tenant_id))return deny();
    const sql=route[1]==="runs"?RUN_SQL:FILE_SQL;
    const row=await env.DB.prepare(sql).bind(...params(env,session,route[2],now)).first();
    if(!row)return missing();
    if(route[1]==="runs"){
      const payload=typeof row.payload==="string"?JSON.parse(row.payload):row.payload;
      if(!payload||payload.run_id!==route[2])return unavailable();
      return result(200,payload);
    }
    if(row.provider!=="google_drive"||!row.provider_object_id)return unavailable();
    if(route[3]==="/metadata")return result(200,{
      file_id:row.file_id,provider:row.provider,mime_type:row.mime_type,
    });
    if(!env.GOOGLE_DRIVE_ACCESS_TOKEN||!env.GOOGLE_DRIVE_ROOT_ID)return unavailable();
    const store=new GoogleDriveAdapter({
      accessToken:env.GOOGLE_DRIVE_ACCESS_TOKEN,rootId:env.GOOGLE_DRIVE_ROOT_ID,
      fetcher:options.driveFetch??fetch
    });
    const response=await store.download(row.provider_object_id);
    return new Response(response.body,{status:200,headers:{
      "Content-Type":response.headers.get("Content-Type")||"application/octet-stream",
      "Cache-Control":"no-store","Content-Disposition":"attachment",
      "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
    }});
  }catch{return unavailable();}
}
export default {fetch:handle};
