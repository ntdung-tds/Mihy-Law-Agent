import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign} from "node:crypto";
import {verifyAccess} from "../src/access_login.mjs";
const issuer="https://lucky-sun-c4ca.cloudflareaccess.com";
const aud="ad2e24319a066a7b980e188ac8ed1910d83c1416d9137306e5a7b8fa13da4c9c";
const email="qa-owner@example.invalid";
const userId="40404040-0000-4000-8000-000000000044";
const now=1800000000;
const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
const key=publicKey.export({format:"jwk"});
const env={AI_LAW_CF_MODE:"isolated-qa-only",QA_AUTH_ENABLED:"true",
 ACCESS_ISSUER:issuer,ACCESS_AUD:aud,
 ACCESS_OWNER_EMAIL:email,ACCESS_OWNER_USER_ID:userId};
const b64=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
function create(claims={}){
 const header=b64({alg:"RS256",kid:"cf-test-key"});
 const body=b64({iss:issuer,aud:[aud],email,iat:now-20,nbf:now-20,exp:now+600,...claims});
 const sig=sign("RSA-SHA256",Buffer.from(header+"."+body),privateKey).toString("base64url");
 return header+"."+body+"."+sig;
}
const jwks=async()=>new Response(JSON.stringify({keys:[{...key,kid:"cf-test-key"}]}),{
 status:200,headers:{"Content-Type":"application/json"}
});
const req=token=>new Request("https://qa.example.invalid/v1/auth/access-login",{
 headers:token?{"Cf-Access-Jwt-Assertion":token}:{}
});
test("Access proof verifies exact signed owner/email/issuer/audience",async()=>{
 assert.deepEqual(await verifyAccess(req(create()),env,now,jwks),{email,userId});
 for(const changes of [{email:"intruder@example.invalid"},{aud:["other-app"]},
  {exp:now-1},{nbf:now+100},{iss:"https://fake.invalid"}])
  assert.equal(await verifyAccess(req(create(changes)),env,now,jwks),null);
 const forged=new Request("https://qa.example.invalid/v1/auth/access-login",{
  headers:{"Cf-Access-Authenticated-User-Email":email}
 });
 assert.equal(await verifyAccess(forged,env,now,jwks),null);
});
test("Access rejects invalid signature, missing/wrong config, failed JWKS fetch",async()=>{
 const {privateKey:other}=generateKeyPairSync("rsa",{modulusLength:2048});
 const first=create().split(".");
 first[2]=sign("RSA-SHA256",Buffer.from(first[0]+"."+first[1]),other).toString("base64url");
 assert.equal(await verifyAccess(req(first.join(".")),env,now,jwks),null);
 assert.equal(await verifyAccess(req(create()),{...env,ACCESS_AUD:"invalid"},now,jwks),null);
 assert.equal(await verifyAccess(req(create()),env,now,async()=>new Response("",{status:502})),null);
});
