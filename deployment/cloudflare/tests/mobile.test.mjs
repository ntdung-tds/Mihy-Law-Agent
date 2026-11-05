import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto as crypto} from "node:crypto";
import {mobileApi,COOKIE_SESSION_SQL} from "../src/mobile_auth.mjs";
import {MOBILE_HTML,MOBILE_CSS,MOBILE_JS} from "../src/mobile_assets.mjs";
const INSTALL="a1a1a1a1-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER="40404040-0000-4000-8000-000000000004";
const EMAIL="qa04.lawyer@ai-law.invalid",PASSWORD="testing-qa-password-only-very-long";
const SALT="ab".repeat(16),ITERATIONS=100000;
const toHex=a=>Buffer.from(a).toString("hex");
const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(PASSWORD),"PBKDF2",false,["deriveBits"]);
const hash=toHex(await crypto.subtle.deriveBits({name:"PBKDF2",salt:Buffer.from(SALT,"hex"),iterations:ITERATIONS,hash:"SHA-256"},key,256));
function mock({disabled=false,revoked=false,noUser=false}={}){
  const calls=[], db={calls,attempts:0,session:null,
    prepare(sql){return {bind(...params){calls.push({sql,params});return {
      async first(){
        if(sql.includes("SELECT attempts FROM qa_login_rate"))return {attempts:db.attempts};
        if(sql.includes("FROM qa_login_verifiers WHERE installation_id=? AND email=?")){
          return noUser?null:{email:EMAIL,user_id:USER,subject:"qa04-lawyer",
            password_salt:SALT,password_hash:hash,pbkdf2_iterations:ITERATIONS,
            status:disabled?"disabled":"active",failures:0,locked_until:null};
        }
        if(sql.includes("SELECT m.tenant_id FROM qa_memberships")){
          return revoked?null:{tenant_id:TENANT};
        }
        if(sql===COOKIE_SESSION_SQL){return db.session&&!revoked&&!disabled&&db.session.sid===params[1]&&db.session.exp>params[3]?
          {email:EMAIL,user_id:USER,tenant_id:TENANT,role_key:"lawyer",kind:"organization",subject:"qa04-lawyer",expires_at:db.session.exp}:null;}
        throw Error("Unknown first:"+sql.slice(0,80));
      },async run(){
        if(sql.includes("INSERT INTO qa_login_rate"))db.attempts++;
        if(sql.includes("UPDATE qa_sessions SET revoked_at"))db.session=null;
        return {success:true};
      }
    };}};},
    async batch(queries){
      const s=queries.find(x=>x.sql?.includes("INSERT INTO qa_sessions"));
      if(s)db.session={sid:s.params[1],exp:s.params[6]};
      return [];
    }
  };
  // Save sql/params on chained expressions to simulate D1 prepared batches.
  db.prepare=function(sql){return {bind(...params){
    const entry={sql,params};calls.push(entry);
    return {sql,params,async first(){
      if(sql.includes("SELECT attempts FROM qa_login_rate"))return {attempts:db.attempts};
      if(sql.includes("FROM qa_login_verifiers WHERE installation_id=? AND email=?"))return noUser?null:{
        email:EMAIL,user_id:USER,subject:"qa04-lawyer",password_salt:SALT,password_hash:hash,
        pbkdf2_iterations:ITERATIONS,status:disabled?"disabled":"active",failures:0,locked_until:null};
      if(sql.includes("SELECT m.tenant_id FROM qa_memberships"))return revoked?null:{tenant_id:TENANT};
      if(sql===COOKIE_SESSION_SQL)return db.session&&!revoked&&!disabled&&db.session.sid===params[1]&&db.session.exp>params[3]?{
        email:EMAIL,user_id:USER,tenant_id:TENANT,role_key:"lawyer",kind:"organization",subject:"qa04-lawyer",expires_at:db.session.exp}:null;
      throw Error("Unhandled SQL SELECT");
    },async run(){if(sql.includes("INSERT INTO qa_login_rate"))db.attempts++;if(sql.includes("UPDATE qa_sessions SET revoked_at"))db.session=null;return {};}
    };
  }};};
  return db;
}
const env=(db)=>({
  DB:db,AI_LAW_CF_MODE:"isolated-qa-only",INSTALLATION_ID:INSTALL,
  JWT_ISSUER:"https://idp.example.invalid",QA_RATE_PEPPER:"private-qa-test-rate-pepper-1234567890123"
});
const req=(path,{method="GET",body,cookie,origin="https://qa.example.invalid",fetchSite="same-origin"}={})=>
  new Request("https://qa.example.invalid"+path,{method,headers:{
    ...(method==="POST"?{"Origin":origin,"Content-Type":"application/json","Sec-Fetch-Site":fetchSite}:{}),
    ...(cookie?{Cookie:cookie}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
const at=1800000000;
test("mobile layout has accessible login form and no simulated login",()=>{
  assert.match(MOBILE_HTML,/id="login-form"/);
  assert.match(MOBILE_HTML,/autocomplete="current-password"/);
  assert.match(MOBILE_HTML,/name="username"/);
  assert.match(MOBILE_HTML,/name="password"/);
  assert.match(MOBILE_HTML,/id="dashboard" hidden/);
  assert.match(MOBILE_CSS,/@media\(max-width:360px\)/);
  assert.match(MOBILE_JS,/\/api\/qa\/login/);
});
test("actual PBKDF2 QA credentials issue secure cookie and D1 session",async()=>{
  const db=mock();
  const res=await mobileApi(req("/api/qa/login",{method:"POST",body:{email:EMAIL,password:PASSWORD}}),env(db),{now:at});
  assert.equal(res.status,200);
  const cookie=res.headers.get("Set-Cookie");
  assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
  assert.match(cookie,/Max-Age=1800/);
  assert.equal(db.session.sid.length,36);
  const me=await mobileApi(req("/api/qa/session",{cookie}),env(db),{now:at});
  assert.equal(me.status,200);
  const user=await me.json();
  assert.equal(user.email,EMAIL);assert.equal(user.role,"lawyer");
  const out=await mobileApi(req("/api/qa/logout",{method:"POST",cookie}),env(db),{now:at+1});
  assert.equal(out.status,200);
  assert.match(out.headers.get("Set-Cookie"),/Max-Age=0/);
  assert.equal((await mobileApi(req("/api/qa/session",{cookie}),env(db),{now:at+2})).status,401);
});
test("wrong password, disabled and revoked actors are not signed in",async()=>{
  for(const options of [{},{disabled:true},{revoked:true},{noUser:true}]){
    const db=mock(options);
    const res=await mobileApi(req("/api/qa/login",{method:"POST",
      body:{email:EMAIL,password:options.disabled||options.revoked||options.noUser?PASSWORD:"wrong"}
    }),env(db),{now:at});
    assert.equal(res.status,401);assert.equal(db.session,null);
  }
});
test("rejects cross-origin login/logout, malformed body and rate limit",async()=>{
  const db=mock(),e=env(db);
  const bad=await mobileApi(req("/api/qa/login",{method:"POST",origin:"https://evil.invalid",
    body:{email:EMAIL,password:PASSWORD}}),e,{now:at});
  assert.equal(bad.status,400);
  const bad2=await mobileApi(req("/api/qa/logout",{method:"POST",origin:"https://evil.invalid"}),e,{now:at});
  assert.equal(bad2.status,400);
  for(let i=0;i<10;i++)await mobileApi(req("/api/qa/login",{method:"POST",
    body:{email:EMAIL,password:"bad-pass"}}),e,{now:at});
  const blocked=await mobileApi(req("/api/qa/login",{method:"POST",
    body:{email:EMAIL,password:PASSWORD}}),e,{now:at});
  assert.equal(blocked.status,429);
});
test("invalid environment, expired session and unknown endpoint fail closed",async()=>{
  const db=mock(),e=env(db);
  assert.equal((await mobileApi(req("/api/qa/session"),{...e,AI_LAW_CF_MODE:"production"},{now:at})).status,503);
  assert.equal((await mobileApi(req("/api/qa/nope"),e,{now:at})).status,404);
  const good=await mobileApi(req("/api/qa/login",{method:"POST",body:{email:EMAIL,password:PASSWORD}}),e,{now:at});
  assert.equal(good.status,200);
  assert.equal((await mobileApi(req("/api/qa/session",{cookie:good.headers.get("Set-Cookie")}),e,{now:at+1801})).status,401);
});
