import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomBytes,pbkdf2Sync} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {handle} from "../src/worker.mjs";
const ROOT=new URL("../",import.meta.url);
const INSTALL="a1a1a1a1-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PERSONAL="f2222222-2222-4222-8222-222222222222";
const USER04="40404040-0000-4000-8000-000000000004";
const USER02="40404040-0000-4000-8000-000000000002";
const USER03="40404040-0000-4000-8000-000000000003";
const USER07="40404040-0000-4000-8000-000000000007";
const MATTER="c1111111-1111-4111-8111-111111111111";
const BASE="https://qa.example.invalid";
const ACCOUNTS=[
 ["qa04.lawyer@ai-law.invalid",USER04,"active"],
 ["qa02.dual@ai-law.invalid",USER02,"active"],
 ["qa03.admin@ai-law.invalid",USER03,"active"],
 ["qa07.disabled@ai-law.invalid",USER07,"disabled"],
];
const stmt=db=>({prepare(sql){return {bind(...args){return {
 first:async()=>db.prepare(sql).get(...args)||null,
 all:async()=>({results:db.prepare(sql).all(...args)}),
 run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}}),
};}};}});
function create(){
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync(new URL("../migrations/0001_cf_qa_metadata.sql",ROOT),"utf8"));
 db.exec(readFileSync(new URL("../migrations/0002_cf_qa_mobile_auth.sql",ROOT),"utf8"));
 const passwords={};
 db.prepare("INSERT INTO qa_tenants VALUES(?,?,?)").run(INSTALL,ORG,"organization");
 db.prepare("INSERT INTO qa_tenants VALUES(?,?,?)").run(INSTALL,PERSONAL,"personal");
 db.prepare("INSERT INTO qa_workspace_labels VALUES(?,?,?)").run(INSTALL,ORG,"IAICT — QA");
 db.prepare("INSERT INTO qa_workspace_labels VALUES(?,?,?)").run(INSTALL,PERSONAL,"QA-02 cá nhân");
 for(const [email,id,status] of ACCOUNTS){
  db.prepare("INSERT INTO qa_principals VALUES(?,?,?)").run(INSTALL,id,status);
  const pass=randomBytes(24).toString("base64url");
  const salt=randomBytes(16).toString("base64url");
  passwords[email]=pass;
  const hash=pbkdf2Sync(pass,Buffer.from(salt,"base64url"),20000,32,"sha256").toString("base64url");
  db.prepare("INSERT INTO qa_password_accounts VALUES(?,?,?,?,?,?)")
   .run(INSTALL,email,id,salt,hash,20000);
 }
 for(const [id,tenant,role] of [
  [USER04,ORG,"lawyer"],[USER02,ORG,"lawyer"],
  [USER02,PERSONAL,"lawyer"],[USER03,ORG,"tenant_admin"],
  [USER07,ORG,"lawyer"]
 ]){
  db.prepare("INSERT INTO qa_memberships VALUES(?,?,?,?,?,?)")
    .run(INSTALL,tenant,id,role,"active",1);
 }
 db.prepare("INSERT INTO qa_matters VALUES(?,?,?,?)").run(INSTALL,ORG,MATTER,1);
 db.prepare("INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)")
  .run(INSTALL,ORG,MATTER,USER04,"read","allow",1,1,null);
 db.prepare("INSERT INTO qa_runs VALUES(?,?,?,?,?)").run(
  INSTALL,ORG,"fixture-run",MATTER,JSON.stringify({run_id:"fixture-run",status:"queued"})
 );
 return {db,env:{
  AI_LAW_CF_MODE:"isolated-qa-only",QA_AUTH_ENABLED:"true",INSTALLATION_ID:INSTALL,
  JWT_ISSUER:"https://idp.example.invalid",JWT_AUDIENCE:"ai-law-api",
  JWT_JWKS_JSON:'{"keys":[]}',DB:stmt(db),
 },passwords};
}
const post=(path,body,opts={})=>new Request(BASE+path,{
 method:"POST",headers:{
  Origin:opts.origin||BASE,"Content-Type":"application/json",
  ...(opts.cookie?{"Cookie":opts.cookie}:{}),
  ...(opts.csrf?{"X-CSRF-Token":opts.csrf}:{}),
 },body:JSON.stringify(body)
});
const get=(path,cookie)=>new Request(BASE+path,{headers:cookie?{"Cookie":cookie}:{}});
async function login(state,email){
 const res=await handle(post("/v1/auth/login",{email,password:state.passwords[email]}),
  state.env);
 const body=await res.json();
 return {res,body,cookie:res.headers.get("Set-Cookie")?.split(";")[0]};
}
test("mobile QA HTML/asset content is responsive, same-origin, CSP protected",async()=>{
 const s=create();
 const html=await handle(get("/"),s.env);
 assert.equal(html.status,200);
 assert.match(await html.text(),/name="viewport"/);
 assert.match(html.headers.get("Content-Security-Policy"),/script-src 'self'/);
 for(const url of ["/assets/theme.css","/assets/app.js"]){
  const resp=await handle(get(url),s.env);
  assert.equal(resp.status,200);
  assert.equal(resp.headers.get("X-Content-Type-Options"),"nosniff");
 }
 s.db.close();
});
test("real PBKDF2 verification, browser cookie and signed session workspace",async()=>{
 const s=create();
 const l=await login(s,ACCOUNTS[0][0]);
 assert.equal(l.res.status,200);
 assert.equal(l.body.authenticated,true);
 assert.equal(l.body.account.email,ACCOUNTS[0][0]);
 assert.equal(l.body.current.tenant_id,ORG);
 assert.ok(l.cookie.startsWith("__Host-al-qa-session="));
 assert.match(l.res.headers.get("Set-Cookie"),/HttpOnly; Secure; SameSite=Lax/);
 const me=await handle(get("/v1/auth/me",l.cookie),s.env);
 assert.equal(me.status,200);
 assert.equal((await me.json()).account.email,ACCOUNTS[0][0]);
 const run=await handle(get("/v1/runs/fixture-run",l.cookie),s.env);
 assert.equal(run.status,200);
 assert.equal((await run.json()).run_id,"fixture-run");
 const admin=await login(s,ACCOUNTS[2][0]);
 assert.equal(admin.res.status,200);
 assert.equal((await handle(get("/v1/runs/fixture-run",admin.cookie),s.env)).status,404);
 s.db.close();
});
test("dual identity may switch only to explicit member workspaces",async()=>{
 const s=create();const l=await login(s,ACCOUNTS[1][0]);
 assert.equal(l.res.status,200);
 assert.equal(l.body.workspaces.length,2);
 assert.equal(l.body.current.tenant_id,ORG);
 const changed=await handle(post("/v1/auth/switch",{tenant_id:PERSONAL},{
  cookie:l.cookie,csrf:l.body.csrf
 }),s.env);
 assert.equal(changed.status,200);
 const b=await changed.json();
 assert.equal(b.current.tenant_id,PERSONAL);
 assert.notEqual(b.csrf,l.body.csrf);
 assert.equal((await handle(get("/v1/runs/fixture-run",l.cookie),s.env)).status,404);
 assert.equal((await handle(post("/v1/auth/switch",{tenant_id:ORG},{
  cookie:l.cookie,csrf:l.body.csrf
 }),s.env)).status,403);
 const forbidden=await handle(post("/v1/auth/switch",{
  tenant_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
 },{cookie:l.cookie,csrf:b.csrf}),s.env);
 assert.equal(forbidden.status,404);
 s.db.close();
});
test("wrong password, disabled QA, CSRF, forged Origin and logout fail closed",async()=>{
 const s=create();
 assert.equal((await handle(post("/v1/auth/login",{
  email:ACCOUNTS[3][0],password:s.passwords[ACCOUNTS[3][0]]
 }),s.env)).status,401);
 assert.equal((await handle(post("/v1/auth/login",{
  email:ACCOUNTS[0][0],password:s.passwords[ACCOUNTS[0][0]]
 },{origin:"https://evil.invalid"}),s.env)).status,403);
 for(let n=0;n<5;n++){
  const r=await handle(post("/v1/auth/login",{
   email:ACCOUNTS[0][0],password:"incorrectPassword"
  }),s.env);
  assert.equal(r.status,401);
 }
 const limited=await handle(post("/v1/auth/login",{
  email:ACCOUNTS[0][0],password:s.passwords[ACCOUNTS[0][0]]
 }),s.env);
 assert.equal(limited.status,429);
 const account=ACCOUNTS[1][0],l=await login(s,account);
 assert.equal(l.res.status,200);
 assert.equal((await handle(post("/v1/auth/logout",{},{
  cookie:l.cookie,csrf:"badCSRF"
 }),s.env)).status,403);
 const logout=await handle(post("/v1/auth/logout",{},{
  cookie:l.cookie,csrf:l.body.csrf
 }),s.env);
 assert.equal(logout.status,200);
 assert.match(logout.headers.get("Set-Cookie"),/Max-Age=0/);
 assert.equal((await handle(get("/v1/auth/me",l.cookie),s.env)).status,401);
 s.db.close();
});
test("revoked principal and tenant membership immediately deny existing cookie",async()=>{
 const s=create();const l=await login(s,ACCOUNTS[0][0]);
 assert.equal(l.res.status,200);
 s.db.prepare("UPDATE qa_memberships SET status='revoked' WHERE installation_id=? AND user_id=?")
   .run(INSTALL,USER04);
 assert.equal((await handle(get("/v1/auth/me",l.cookie),s.env)).status,401);
 s.db.prepare("UPDATE qa_memberships SET status='active' WHERE installation_id=? AND user_id=?")
   .run(INSTALL,USER04);
 s.db.prepare("UPDATE qa_principals SET status='disabled' WHERE installation_id=? AND user_id=?")
   .run(INSTALL,USER04);
 assert.equal((await handle(get("/v1/auth/me",l.cookie),s.env)).status,401);
 s.db.close();
});
