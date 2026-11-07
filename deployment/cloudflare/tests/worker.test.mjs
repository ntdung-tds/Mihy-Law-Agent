import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {handle, verifyBearer, RUN_SQL, FILE_SQL, SESSION_SQL} from "../src/worker.mjs";
import {GoogleDriveAdapter} from "../src/google_drive.mjs";

const install="a1a1a1a1-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenant="b2b2b2b2-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const user="c3c3c3c3-cccc-4ccc-8ccc-cccccccccccc";
const sid="d4d4d4d4-dddd-4ddd-8ddd-dddddddddddd";
const now=1800000000;
const issuer="https://idp.example.invalid";
const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
const pub=publicKey.export({format:"jwk"});
const envBase={
  AI_LAW_CF_MODE:"isolated-qa-only", INSTALLATION_ID:install,
  JWT_ISSUER:issuer,JWT_AUDIENCE:"ai-law-api",
  JWT_JWKS_JSON:JSON.stringify({keys:[{...pub,kid:"qa-key",alg:"RS256",use:"sig"}]}),
};
const b64=obj=>Buffer.from(JSON.stringify(obj)).toString("base64url");
function token({head={},claims={},key=privateKey}={}){
  const h=b64({alg:"RS256",typ:"at+jwt",kid:"qa-key",...head});
  const p=b64({iss:issuer,aud:"ai-law-api",sub:"qa04-lawyer",sid,
    iat:now-100,nbf:now-100,exp:now+400,...claims});
  const signature=sign("RSA-SHA256",Buffer.from(h+"."+p),key).toString("base64url");
  return h+"."+p+"."+signature;
}
function request(path,t=token(),headers={}){
  return new Request("https://isolated.example.invalid"+path,{
    headers:t?{Authorization:"Bearer "+t,...headers}:headers,
  });
}
function stubDb({session=true,run=true,file=true,fail=false}={}){
  const logs=[];
  return {logs,prepare(sql){
    return {bind(...parameters){
      logs.push({sql,parameters});
      return {async first(){
        if(fail)throw Error("DB SQL secret must not leak");
        if(sql===SESSION_SQL)return session?{user_id:user,tenant_id:tenant}:null;
        if(sql===RUN_SQL)return run?{payload:JSON.stringify({
          run_id:"fixture-run",status:"queued"})}:null;
        if(sql===FILE_SQL)return file?{
          file_id:"test-file",provider:"google_drive",
          provider_object_id:"fakeDriveObject012345",mime_type:"text/plain",
        }:null;
        throw Error("Unrecognized SQL query");
      }};
    }};
  }};
}
test("valid RS256 at+jwt bearer verifies with trusted public JWKS",async()=>{
  const env={...envBase,DB:stubDb()};
  assert.deepEqual(await verifyBearer(request("/v1/runs/fixture-run"),env,now),
    {issuer,subject:"qa04-lawyer",sid});
});
test("JWT signature, issuer, audience, expiration, missing sid, future nbf and header injection denied",async()=>{
  const env={...envBase,DB:stubDb()};
  const {privateKey:other}=generateKeyPairSync("rsa",{modulusLength:2048});
  const rejected=[
    token({key:other}),token({head:{alg:"none"}}),
    token({head:{jku:"https://malicious.example.invalid/jwks"}}),
    token({head:{typ:"JWT"}}),token({head:{kid:"other-key"}}),
    token({claims:{iss:"https://malicious.example.invalid"}}),
    token({claims:{aud:"another-api"}}),
    token({claims:{sid:""}}),token({claims:{nbf:now+1}}),
    token({claims:{iat:now+1}}),token({claims:{exp:now}}),
    token({claims:{exp:now+100000}}),token().slice(0,-10),
    "invalid", 
  ];
  for(const t of rejected)assert.equal(await verifyBearer(request("/v1/runs/fixture-run",t),env,now),null);
});
test("valid signed run uses only DB trusted installation/user/tenant/ACL",async()=>{
  const db=stubDb(),env={...envBase,DB:db};
  const res=await handle(request("/v1/runs/fixture-run"),env,{now});
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{run_id:"fixture-run",status:"queued"});
  assert.equal(db.logs.length,2);
  assert.equal(db.logs[0].parameters[0],install);
  assert.equal(db.logs[0].parameters[1],sid);
  assert.deepEqual(db.logs[1].parameters,[install,tenant,"fixture-run",user,now,now,user,now,now]);
  assert.match(db.logs[1].sql,/NOT EXISTS/);
  assert.equal(res.headers.get("Cache-Control"),"no-store");
});
test("no JWT, unknown session, no matter ACL, DB errors or missing bindings deny",async()=>{
  for(const [db,t,expected] of [
    [stubDb(),null,401],[stubDb({session:false}),token(),401],
    [stubDb({run:false}),token(),404],[stubDb({fail:true}),token(),503],
  ]){
    const res=await handle(request("/v1/runs/fixture-run",t),{...envBase,DB:db},{now});
    assert.equal(res.status,expected);
    assert.doesNotMatch(await res.text(),/SQL secret|Bearer/);
  }
  const res=await handle(request("/v1/runs/fixture-run"),{...envBase},{now});
  assert.equal(res.status,503);
});
test("fail closed for tenant headers, query tricks, wrong routes, writes, unbound config",async()=>{
  const db=stubDb(),env={...envBase,DB:db};
  for(const x of [
    new Request("https://isolated.example.invalid/v1/runs/fixture-run?tenant_id="+tenant,
      {headers:{Authorization:"Bearer "+token()}}),
    request("/v1/runs/fixture-run",token(),{"X-AI-LAW-TENANT":tenant}),
    new Request("https://isolated.example.invalid/v1/runs/fixture-run",{method:"POST"}),
    request("/v1/runs/../../secret"),request("/v1/files/test-file"),
  ])assert.equal((await handle(x,env,{now})).status,404);
  assert.equal(db.logs.length,0);
  assert.equal((await handle(request("/health"),env)).status,200);
  assert.equal((await handle(request("/health"),{...env,AI_LAW_CF_MODE:"production"})).status,503);
});
test("file metadata requires signed session and matter ACL; no external fetch",async()=>{
  const db=stubDb();
  const r=await handle(request("/v1/files/test-file/metadata"),
    {...envBase,DB:db},{now});
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{
    file_id:"test-file",provider:"google_drive",mime_type:"text/plain",
  });
  assert.equal(db.logs.at(-1).sql,FILE_SQL);
  assert.equal((await handle(request("/v1/files/test-file/download"),
    {...envBase,DB:db},{now})).status,503);
});
test("Drive adapter requests only Google API and checks object belongs to approved folder",async()=>{
  const calls=[],root="folderRootId01234567",id="fakeDriveObject012345";
  const store=new GoogleDriveAdapter({
    accessToken:"synthetic-token-no-external-service",rootId:root,
    fetcher:async(url,config)=>{
      calls.push({url,config});
      if(url.includes("alt=media"))return new Response("FAKE-DATA",{
        status:200,headers:{"Content-Type":"text/plain"}});
      return new Response(JSON.stringify({
        id,mimeType:"text/plain",name:"synthetic.txt",
        trashed:false,parents:[root]
      }),{status:200,headers:{"Content-Type":"application/json"}});
    }
  });
  const res=await store.download(id);
  assert.equal(await res.text(),"FAKE-DATA");
  assert.equal(calls.length,2);
  assert(calls.every(x=>x.config.redirect==="manual"));
  assert(calls.every(x=>x.url.startsWith("https://www.googleapis.com/drive/v3/files/")));
  assert(calls.every(x=>x.config.headers.Authorization==="Bearer synthetic-token-no-external-service"));
  await assert.rejects(()=>store.download("../../other-file"));
});
test("Drive forbids out-of-folder, trashed and redirected URLs, no public share",async()=>{
  const root="folderRootId01234567",id="fakeDriveObject012345";
  for(const response of [
    new Response(JSON.stringify({id,parents:["otherFolder12345"],trashed:false,
      mimeType:"text/plain"}),{status:200}),
    new Response(JSON.stringify({id,parents:[root],trashed:true,
      mimeType:"text/plain"}),{status:200}),
    new Response("",{status:302,headers:{Location:"https://evil.invalid"}}),
  ]){
    const store=new GoogleDriveAdapter({
      accessToken:"synthetic-token-no-external-service",
      rootId:root,fetcher:async()=>response.clone()
    });
    await assert.rejects(()=>store.download(id));
  }
});
test("file download with authorized Drive adapter streams only after DB ACL",async()=>{
  const root="folderRootId01234567",id="fakeDriveObject012345",fetchCalls=[];
  const r=await handle(request("/v1/files/test-file/download"),{
    ...envBase,DB:stubDb(),GOOGLE_DRIVE_ROOT_ID:root,
    GOOGLE_DRIVE_ACCESS_TOKEN:"synthetic-token-no-external-service",
  },{now,driveFetch:async(url)=>{
    fetchCalls.push(url);
    if(url.includes("alt=media"))return new Response("TEST-DATA",{
      status:200,headers:{"Content-Type":"text/plain"}});
    return new Response(JSON.stringify({
      id,parents:[root],trashed:false,mimeType:"text/plain"
    }),{status:200});
  }});
  assert.equal(r.status,200);
  assert.equal(await r.text(),"TEST-DATA");
  assert.equal(r.headers.get("Cache-Control"),"no-store");
  assert.equal(r.headers.get("Content-Disposition"),"attachment");
  assert.equal(fetchCalls.length,2);
});

test("R98 backend root redirects to one canonical AI Law QA website, without leaking query or session",async()=>{
  const urls=[
    "https://ai-law-standalone-cf-qa.iaict-platform.workers.dev/",
    "https://ai-law-standalone-cf-qa.iaict-platform.workers.dev/?code=synthetic-sensitive-should-not-travel"
  ];
  for(const url of urls){
    const r=await handle(new Request(url,{headers:{"Cookie":"al_qa_session=synthetic-private"}}),{}, {now});
    assert.equal(r.status,302);
    assert.equal(r.headers.get("Location"),"https://ai-law-web-qa.iaict-platform.workers.dev/");
    assert.equal(r.headers.get("Cache-Control"),"no-store");
    assert.equal(r.headers.get("Referrer-Policy"),"no-referrer");
    assert.equal(r.headers.get("Set-Cookie"),null);
    assert.equal(await r.text(),"");
  }
  const post=await handle(new Request(urls[0],{method:"POST",body:"qa"}),{},{now});
  assert.equal(post.status,404,"only GET / redirects, backend API routing unchanged");
  const health=await handle(new Request(urls[0]+"health"),{...envBase,DB:stubDb()},{now});
  assert.equal(health.status,200,"backend health still operational");
  const oauthCallback=await handle(new Request(urls[0]+"api/qa/drive/callback"),{}, {now});
  assert.notEqual(oauthCallback.headers.get("Location"),"https://ai-law-web-qa.iaict-platform.workers.dev/",
   "backend OAuth callback must not become the generic homepage redirect");
});
