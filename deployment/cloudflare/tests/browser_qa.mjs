/* R44 real Chromium mobile QA login against a local HTTP Worker + SQLite D1 facade.
 * All credentials are random generated in RAM, never printed or uploaded.
 */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {randomBytes,pbkdf2Sync} from "node:crypto";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {chromium} from "playwright";
import {handle} from "../src/worker.mjs";
const I="a1a1a1a1-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P="f2222222-2222-4222-8222-222222222222";
const U="40404040-0000-4000-8000-000000000004";
const D="40404040-0000-4000-8000-000000000002";
const QA1="qa04.lawyer@ai-law.invalid",QA2="qa02.dual@ai-law.invalid";
const db=new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("../migrations/0001_cf_qa_metadata.sql",import.meta.url),"utf8"));
db.exec(readFileSync(new URL("../migrations/0002_cf_qa_mobile_auth.sql",import.meta.url),"utf8"));
const run=(sql,...args)=>db.prepare(sql).run(...args);
run("INSERT INTO qa_tenants VALUES(?,?,?)",I,T,"organization");
run("INSERT INTO qa_tenants VALUES(?,?,?)",I,P,"personal");
run("INSERT INTO qa_workspace_labels VALUES(?,?,?)",I,T,"IAICT QA");
run("INSERT INTO qa_workspace_labels VALUES(?,?,?)",I,P,"QA02 cá nhân");
const passwords={};
for(const [email,user] of [[QA1,U],[QA2,D]]){
 const pass=randomBytes(24).toString("base64url"),salt=randomBytes(16).toString("base64url");
 const verifier=pbkdf2Sync(pass,Buffer.from(salt,"base64url"),20000,32,"sha256").toString("base64url");
 passwords[email]=pass;
 run("INSERT INTO qa_principals VALUES(?,?,?)",I,user,"active");
 run("INSERT INTO qa_password_accounts VALUES(?,?,?,?,?,?)",I,email,user,salt,verifier,20000);
}
for(const [user,tenant] of [[U,T],[D,T],[D,P]]){
 run("INSERT INTO qa_memberships VALUES(?,?,?,?,?,?)",I,tenant,user,"lawyer","active",1);
}
const env={
 AI_LAW_CF_MODE:"isolated-qa-only",QA_AUTH_ENABLED:"true",INSTALLATION_ID:I,
 JWT_ISSUER:"https://idp.example.invalid",JWT_AUDIENCE:"ai-law-api",
 JWT_JWKS_JSON:'{"keys":[]}',
 DB:{prepare(sql){return {bind(...args){return {
  first:async()=>db.prepare(sql).get(...args)||null,
  all:async()=>({results:db.prepare(sql).all(...args)}),
  run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}}),
 };}};}}
};
const server=createServer(async(req,res)=>{
 try{
  const origin="http://localhost:"+server.address().port;
  let body=Buffer.alloc(0);
  for await(const chunk of req){body=Buffer.concat([body,chunk]);if(body.length>8192)break;}
  const request=new Request(origin+req.url,{
   method:req.method,headers:req.headers,
   ...(req.method==="POST"?{body}:{}),
  });
  const answer=await handle(request,env);
  res.writeHead(answer.status,Object.fromEntries(answer.headers));
  res.end(Buffer.from(await answer.arrayBuffer()));
 }catch(err){res.writeHead(500);res.end("Internal test failure");}
});
await new Promise(r=>server.listen(0,"localhost",r));
const origin="http://localhost:"+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [390,320,1440]){
  const context=await browser.newContext({
   viewport:{width,height:844},
   ...(width<500?{isMobile:true,hasTouch:true,deviceScaleFactor:2}:{}),
  });
  const page=await context.newPage();
  await page.goto(origin,{waitUntil:"domcontentloaded"});
  await page.locator("#login").waitFor({state:"visible",timeout:15000});
  assert.equal(await page.locator("#dashboard").isVisible(),false);
  await page.locator("#login-email").fill(QA1);
  await page.locator("#login-password").fill(passwords[QA1]);
  await page.locator("#login-submit").click();
  await page.locator("#dashboard").waitFor({state:"visible",timeout:15000});
  assert.equal(await page.locator("#user-email").textContent(),QA1);
  assert.match(await page.locator("#current-workspace").textContent(),/IAICT/);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator("#dashboard").waitFor({state:"visible",timeout:15000});
  const cookies=await context.cookies();
  const c=cookies.find(x=>x.name==="__Host-al-qa-session");
  assert(c&&c.httpOnly&&c.secure,"browser cookie must be Secure and HttpOnly");
  await page.locator("#logout").click();
  await page.locator("#login").waitFor({state:"visible",timeout:15000});
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator("#login").waitFor({state:"visible",timeout:15000});
  await context.close();
  console.log("PASS R44 Chromium login/reload/logout width="+width);
 }
 const context=await browser.newContext({
  viewport:{width:390,height:844},isMobile:true,hasTouch:true,
 });
 const page=await context.newPage();
 await page.goto(origin);
 await page.locator("#login").waitFor({state:"visible"});
 await page.locator("#login-email").fill(QA2);
 await page.locator("#login-password").fill(passwords[QA2]);
 await page.locator("#login-submit").click();
 await page.locator("#dashboard").waitFor({state:"visible"});
 assert.equal(await page.locator("#workspace option").count(),2);
 await page.locator("#workspace").selectOption(P);
 await page.locator("#switch").click();
 await page.locator("#current-workspace").getByText("QA02 cá nhân").waitFor();
 await page.reload();
 await page.locator("#dashboard").waitFor({state:"visible"});
 assert.match(await page.locator("#current-workspace").textContent(),/QA02/);
 console.log("PASS R44 Chromium dual-workspace switch and persisted QA session");
 await context.close();
}finally{
 if(browser)await browser.close();
 await new Promise(r=>server.close(r));
 db.close();
}
