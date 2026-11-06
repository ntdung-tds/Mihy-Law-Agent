import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {mobileApi,COOKIE_SESSION_SQL} from "../src/mobile_auth.mjs";

const ORIGIN="https://qa.example.invalid";
const INSTALL="a1a1a1a1-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER="40404040-0000-4000-8000-000000000004";
const TENANT="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMAIL="synthetic.user@qa.invalid";
const OLD="synthetic-private-old-credential";
const NEXT="synthetic-private-unique-next-credential";
const NOW=1800000000;
const hex=v=>Buffer.from(v).toString("hex");
async function derive(password,salt){
 const k=await webcrypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
 return hex(await webcrypto.subtle.deriveBits({name:"PBKDF2",salt:Buffer.from(salt,"hex"),hash:"SHA-256",iterations:100000},k,256));
}
async function fakeDB(){
 const salt="af".repeat(16);
 const state={salt,hash:await derive(OLD,salt),sessions:[],attempts:0,failures:0,locked_until:null,
               status:"active",principal:"active",member:"active",commitCount:0};
 const db={
  state,
  prepare(sql){return {bind(...params){
   return {sql,params,async first(){
    if(sql.includes("SELECT attempts FROM qa_login_rate"))return {attempts:state.attempts};
    if(sql===COOKIE_SESSION_SQL){
      const s=state.sessions.find(x=>x.sid===params[1]&&!x.revoked&&x.expires>params[3]);
      return s&&state.status==="active"&&state.principal==="active"&&state.member==="active"?
        {user_id:USER,tenant_id:TENANT,subject:"qa04-lawyer",expires_at:s.expires,
         email:EMAIL,role_key:"lawyer",kind:"organization"}:null;
    }
    if(sql.includes("FROM qa_login_verifiers WHERE installation_id=? AND email=?") ||
       sql.includes("FROM qa_login_verifiers WHERE installation_id=? AND user_id=?")){
      if(params[0]!==INSTALL||state.status!=="active")return null;
      return {email:EMAIL,user_id:USER,subject:"qa04-lawyer",password_salt:state.salt,
        password_hash:state.hash,pbkdf2_iterations:100000,status:state.status,
        failures:state.failures,locked_until:state.locked_until};
    }
    if(sql.includes("SELECT m.tenant_id FROM qa_memberships"))
      return state.principal==="active"&&state.member==="active"?{tenant_id:TENANT}:null;
    throw Error("Unexpected SELECT in fake D1");
   },async run(){
    if(sql.includes("INSERT INTO qa_login_rate"))state.attempts++;
    else if(sql.includes("SET failures=MIN(5,failures+1)")){
      if(state.failures>=4)state.locked_until=params[0];
      state.failures=Math.min(5,state.failures+1);
    }else if(sql.includes("UPDATE qa_sessions SET revoked_at")){
      for(const s of state.sessions)if(s.sid===params[2])s.revoked=true;
    }else throw Error("Unexpected UPDATE in fake D1");
    return {meta:{changes:1}};
   }};
  }};},
  async batch(queries){
    const updates=[];
    for(const q of queries){
      const sql=q.sql,p=q.params;
      if(sql.startsWith("INSERT INTO qa_sessions")){
        state.sessions.push({sid:p[1],expires:p[6],revoked:false});
        updates.push({meta:{changes:1}});
      }else if(sql.startsWith("UPDATE qa_login_verifiers SET failures=0")){
        state.failures=0;state.locked_until=null;
        updates.push({meta:{changes:1}});
      }else if(sql.startsWith("UPDATE qa_login_verifiers SET password_salt=")){
        const same=p[6]===state.salt&&p[7]===state.hash;
        if(same){state.salt=p[0];state.hash=p[1];state.failures=0;state.locked_until=null;}
        updates.push({meta:{changes:same?1:0}});
      }else if(sql.startsWith("UPDATE qa_sessions SET revoked_at=")){
        let n=0;for(const session of state.sessions)if(!session.revoked){session.revoked=true;n++;}
        updates.push({meta:{changes:n}});
      }else throw Error("Unexpected D1 batch statement");
    }
    state.commitCount++;
    return updates;
  }
 };
 return db;
}
const env=db=>({DB:db,AI_LAW_CF_MODE:"isolated-qa-only",INSTALLATION_ID:INSTALL,
 JWT_ISSUER:"https://issuer.example.invalid",
 QA_RATE_PEPPER:"synthetic-test-pepper-for-ip-rate-limits"});
const request=(path,{method="GET",body,cookie,origin=ORIGIN,site="same-origin"}={})=>new Request(ORIGIN+path,{
 method,headers:{...(method==="POST"?{"Origin":origin,"Sec-Fetch-Site":site,"Content-Type":"application/json"}:{}),
 ...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})
});
const call=(path,e,options={})=>mobileApi(request(path,options),e,{now:NOW});
async function signIn(e,password=OLD){
 return call("/api/qa/login",e,{method:"POST",body:{email:EMAIL,password}});
}
test("R66 fails closed without session, rejects cross-origin and insufficient passwords",async()=>{
 const db=await fakeDB(),e=env(db);
 const body={current_password:OLD,new_password:NEXT};
 assert.equal((await call("/api/qa/change-password",e,{method:"POST",body})).status,401);
 const login=await signIn(e),cookie=login.headers.get("Set-Cookie");
 assert.equal(login.status,200);
 assert.equal((await call("/api/qa/change-password",e,{method:"POST",body,cookie,
   origin:"https://foreign.invalid"})).status,400);
 assert.equal((await call("/api/qa/change-password",e,{method:"POST",body,cookie,
   site:"cross-site"})).status,400);
 assert.equal((await call("/api/qa/change-password",e,{method:"POST",
   body:{current_password:OLD,new_password:"weak"},cookie})).status,400);
 assert.equal((await call("/api/qa/change-password",e,{method:"POST",
   body:{current_password:OLD,new_password:OLD},cookie})).status,400);
 assert.equal(db.state.commitCount,1,"No verifier update after invalid requests");
});
test("R66 wrong current password never changes credential or session",async()=>{
 const db=await fakeDB(),e=env(db);
 const login=await signIn(e),cookie=login.headers.get("Set-Cookie");
 assert.equal((await call("/api/qa/change-password",e,{method:"POST",
   body:{current_password:"incorrect",new_password:NEXT},cookie})).status,401);
 assert.equal((await call("/api/qa/session",e,{cookie})).status,200);
 assert.equal(db.state.failures,1);
 assert.equal((await signIn(e,OLD)).status,200);
});
test("R66 rotates PBKDF2 salted verifier and revokes ALL active sessions atomically",async()=>{
 const db=await fakeDB(),e=env(db);
 const a=await signIn(e),b=await signIn(e);
 assert.equal(a.status,200);assert.equal(b.status,200);
 const oldSalt=db.state.salt,oldHash=db.state.hash;
 assert.equal(db.state.sessions.filter(x=>!x.revoked).length,2);
 const change=await call("/api/qa/change-password",e,{method:"POST",
  body:{current_password:OLD,new_password:NEXT},cookie:a.headers.get("Set-Cookie")});
 assert.equal(change.status,200);
 assert.deepEqual(await change.json(),{ok:true,login_required:true});
 assert.match(change.headers.get("Set-Cookie"),/HttpOnly; Secure; SameSite=Strict; Max-Age=0/);
 assert.notEqual(db.state.salt,oldSalt);
 assert.notEqual(db.state.hash,oldHash);
 assert.equal(db.state.hash,await derive(NEXT,db.state.salt));
 assert.equal(db.state.sessions.filter(x=>!x.revoked).length,0);
 for(const res of [a,b])assert.equal((await call("/api/qa/session",e,{cookie:res.headers.get("Set-Cookie")})).status,401);
 assert.equal((await signIn(e,OLD)).status,401);
 assert.equal((await signIn(e,NEXT)).status,200);
});
test("R66 denies disabled or revoked identity and POST endpoint has no GET fallback",async()=>{
 const db=await fakeDB(),e=env(db);
 const signed=await signIn(e),cookie=signed.headers.get("Set-Cookie");
 db.state.member="revoked";
 assert.equal((await call("/api/qa/change-password",e,{method:"POST",
  body:{current_password:OLD,new_password:NEXT},cookie})).status,401);
 db.state.member="active";
 db.state.principal="disabled";
 assert.equal((await call("/api/qa/change-password",e,{method:"POST",
  body:{current_password:OLD,new_password:NEXT},cookie})).status,401);
 assert.equal((await call("/api/qa/change-password",e)).status,404);
 assert.equal(db.state.salt,"af".repeat(16));
});
