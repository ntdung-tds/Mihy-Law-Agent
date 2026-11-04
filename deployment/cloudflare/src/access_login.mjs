/* R44 QA-only Cloudflare Access one-time-pin identity verification.
 * An Access cookie/header is NEVER trusted without RSA signature, configured
 * issuer AND dedicated app AUD, expiry, exact approved email and user ID.
 * No production IAM, no shared SaaS, no real client legal records.
 */
import {accessQaLogin} from "./qa_auth.mjs";

const denied=()=>new Response(JSON.stringify({code:"ACCESS_IDENTITY_REQUIRED"}),{
 status:401,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});
const broken=()=>new Response(JSON.stringify({code:"ACCESS_IDENTITY_UNAVAILABLE"}),{
 status:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
function b64(x){
 if(typeof x!=="string"||!/^[A-Za-z0-9_-]+$/.test(x)||x.length>8000)throw Error("base64url");
 const s=x.replace(/-/g,"+").replace(/_/g,"/");
 return Uint8Array.from(atob(s+"=".repeat((4-s.length%4)%4)),y=>y.charCodeAt(0));
}
function bearer(req){
 const direct=req.headers.get("Cf-Access-Jwt-Assertion");
 if(direct)return direct;
 const cookie=req.headers.get("Cookie")||"";
 return /(?:^|;\s*)CF_Authorization=([A-Za-z0-9_.-]+)/.exec(cookie)?.[1]||null;
}
export function validAccessConfig(env){
 return env?.AI_LAW_CF_MODE==="isolated-qa-only"&&
  env.QA_AUTH_ENABLED==="true"&&
  /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER||"")&&
  /^[A-Za-z0-9_-]{20,150}$/.test(env.ACCESS_AUD||"")&&
  typeof env.ACCESS_OWNER_EMAIL==="string"&&env.ACCESS_OWNER_EMAIL.includes("@")&&
  UUID.test(env.ACCESS_OWNER_USER_ID||"");
}
export async function verifyAccess(request,env,now=Math.floor(Date.now()/1000),
 fetcher=fetch){
 if(!validAccessConfig(env))return null;
 const token=bearer(request);
 if(!token||token.length>8192||!token.includes("."))return null;
 const parts=token.split(".");if(parts.length!==3)return null;
 try{
  const head=JSON.parse(new TextDecoder().decode(b64(parts[0])));
  if(head?.alg!=="RS256"||typeof head.kid!=="string"||!head.kid||
     ["jku","jwk","x5u","x5c","crit"].some(k=>Object.hasOwn(head,k)))return null;
  const certUrl=env.ACCESS_ISSUER+"/cdn-cgi/access/certs";
  const response=await fetcher(certUrl,{redirect:"error"});
  if(!response?.ok)return null;
  const jwks=await response.json();
  if(!Array.isArray(jwks?.keys)||jwks.keys.length>12)return null;
  const publicJwk=jwks.keys.find(k=>k.kid===head.kid);
  if(publicJwk?.kty!=="RSA"||typeof publicJwk.n!=="string"||
     typeof publicJwk.e!=="string")return null;
  const key=await crypto.subtle.importKey("jwk",{
   kty:"RSA",n:publicJwk.n,e:publicJwk.e,ext:true
  },{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const verified=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,
   b64(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
  if(!verified)return null;
  const c=JSON.parse(new TextDecoder().decode(b64(parts[1])));
  const aud=Array.isArray(c.aud)?c.aud:[c.aud];
  if(c.iss!==env.ACCESS_ISSUER||!aud.includes(env.ACCESS_AUD)||
     typeof c.email!=="string"||c.email.toLowerCase()!==env.ACCESS_OWNER_EMAIL.toLowerCase()||
     !Number.isInteger(c.exp)||c.exp<=now||
     !Number.isInteger(c.iat)||c.iat>now||
     (c.nbf!==undefined&&(!Number.isInteger(c.nbf)||c.nbf>now)))
   return null;
  return {email:c.email,userId:env.ACCESS_OWNER_USER_ID};
 }catch{return null;}
}
export async function accessLogin(request,env,options={}){
 if(!validAccessConfig(env))return broken();
 const now=options.now??Math.floor(Date.now()/1000);
 const identity=await verifyAccess(request,env,now,options.accessFetch??fetch);
 if(!identity)return denied();
 return accessQaLogin(env,identity.userId,identity.email,now);
}
