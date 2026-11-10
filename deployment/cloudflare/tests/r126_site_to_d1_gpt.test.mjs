/** R126 full website->binding->backend smoke (no network or customer files).
 * Executes real website relay and backend handlers backed by one disposable SQLite.
 * Unlike R122 direct API tests this verifies site Worker cookie/Origin forwarding
 * and protected /app assets across two signed-in users and tenant switching.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pbkdf2Sync} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {handleSite} from '../../../build/ai-law-web/site_worker.mjs';
import {handle} from '../src/worker.mjs';
import {LEGAL_MATTER_ACCESS_SQL,LEGAL_QUOTA_SQL} from '../src/qa_legal_workflows.mjs';
import {MATTER_LIST_SQL} from '../src/matter_workspace.mjs';

const I='11111111-1111-4111-8111-111111111111';
const A='22222222-2222-4222-8222-222222222222';
const B='33333333-3333-4333-8333-333333333333';
const TA='44444444-4444-4444-8444-444444444444';
const TB='55555555-5555-4555-8555-555555555555';
const MA='66666666-6666-4666-8666-666666666666';
const MB='77777777-7777-4777-8777-777777777777';
const MP='88888888-8888-4888-8888-888888888888';
const WEB='https://ai-law-web-qa.iaict-platform.workers.dev';
const ISSUER='https://synthetic-idp.invalid';
const NOW=1800000000;
const PASS='R126-synthetic-only-qa-password';
const SALT='1234567890abcdef1234567890abcdef';
const EMAIL_A='r126-a@synthetic.invalid';
const EMAIL_B='r126-b@synthetic.invalid';
const TEXT='Điều 1. Các bên bàn giao hàng ngày 15 tháng 9. Phí thanh toán sau khi nghiệm thu.';

function database(){
 const db=new DatabaseSync(':memory:');
 for(const file of ['0001_cf_qa_metadata.sql','0002_cf_qa_mobile_login.sql',
   '0003_cf_qa_matter_catalog.sql','r108_qa_matter_rename.sql','r109_qa_legal_ai_quota.sql']){
  db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 }
 const inserts=[
  ['INSERT INTO qa_principals VALUES(?,?,?)',[I,A,'active']],
  ['INSERT INTO qa_principals VALUES(?,?,?)',[I,B,'active']],
  ['INSERT INTO qa_tenants VALUES(?,?,?)',[I,TA,'personal']],
  ['INSERT INTO qa_tenants VALUES(?,?,?)',[I,TB,'organization']],
  ['INSERT INTO qa_memberships(installation_id,tenant_id,user_id,role_key,status) VALUES(?,?,?,?,?)',[I,TA,A,'lawyer','active']],
  ['INSERT INTO qa_memberships(installation_id,tenant_id,user_id,role_key,status) VALUES(?,?,?,?,?)',[I,TB,A,'lawyer','active']],
  ['INSERT INTO qa_memberships(installation_id,tenant_id,user_id,role_key,status) VALUES(?,?,?,?,?)',[I,TB,B,'tenant_admin','active']],
  ['INSERT INTO qa_matters VALUES(?,?,?,?)',[I,TA,MA,1]],
  ['INSERT INTO qa_matters VALUES(?,?,?,?)',[I,TB,MB,1]],
  ['INSERT INTO qa_matters VALUES(?,?,?,?)',[I,TB,MP,1]],
  ['INSERT INTO qa_matter_catalog(installation_id,tenant_id,matter_id,title,created_by,created_at) VALUES(?,?,?,?,?,?)',[I,TA,MA,'SYNTHETIC Personal A',A,NOW-20]],
  ['INSERT INTO qa_matter_catalog(installation_id,tenant_id,matter_id,title,created_by,created_at) VALUES(?,?,?,?,?,?)',[I,TB,MB,'SYNTHETIC Organization A',A,NOW-20]],
  ['INSERT INTO qa_matter_catalog(installation_id,tenant_id,matter_id,title,created_by,created_at) VALUES(?,?,?,?,?,?)',[I,TB,MP,'SYNTHETIC Organization B private',B,NOW-20]],
  ['INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)',[I,TA,MA,A,'read','allow',1,NOW-100,null]],
  ['INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)',[I,TB,MB,A,'read','allow',1,NOW-100,null]],
  ['INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)',[I,TB,MP,B,'read','allow',1,NOW-100,null]],
 ];
 for(const [sql,args] of inserts)db.prepare(sql).run(...args);
 const hash=pbkdf2Sync(PASS,Buffer.from(SALT,'hex'),100000,32,'sha256').toString('hex');
 for(const [user,email] of [[A,EMAIL_A],[B,EMAIL_B]])
  db.prepare('INSERT INTO qa_login_verifiers(installation_id,email,user_id,subject,password_salt,password_hash,pbkdf2_iterations,status) VALUES(?,?,?,?,?,?,?,?)')
  .run(I,email,user,'synthetic-subject-'+user,SALT,hash,100000,'active');
 return db;
}
function d1Adapter(db,sqlSeen){
 return {
  prepare(sql){return {bind(...params){
   sqlSeen.push(sql);
   return {
    async first(){return db.prepare(sql).get(...params)??null;},
    async all(){return {results:db.prepare(sql).all(...params)};},
    async run(){const v=db.prepare(sql).run(...params);return {meta:{changes:v.changes}};}
   };
  }}},
  async batch(items){
   db.exec('BEGIN');
   try{
    const results=[];
    for(const item of items)results.push(await item.run());
    db.exec('COMMIT');
    return results;
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
 };
}
function makeReq(path,{method='GET',sid,body,origin=WEB}={}){
 const headers={};
 if(sid)headers.Cookie='al_qa_session='+sid;
 if(method==='POST'){
  headers['Content-Type']='application/json';
  headers.Origin=origin;
  headers['Sec-Fetch-Site']=origin===WEB?'same-origin':'cross-site';
 }
 return new Request(WEB+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
}
function extractSid(response){
 const raw=response.headers.get('Set-Cookie')||'';
 assert.match(raw,/HttpOnly; Secure; SameSite=Strict/);
 const match=raw.match(/al_qa_session=([0-9a-f-]{36})/);
 assert.ok(match);
 return match[1];
}
const usage=db=>({...db.prepare('SELECT COUNT(*) AS rows,COALESCE(SUM(requests),0) AS requests FROM qa_legal_ai_quota').get()});
const legal=(uc,matter_id)=>({uc,matter_id,source_text:TEXT,source_text_2:'',
 question:uc==='UC10'?'bàn giao ngày 15':'',language:'vi',synthetic_consent:true});

test('R126 website relay -> backend real SQLite: two cookie users, tenant ACL, quota, logout',async()=>{
 const db=database(),sqlSeen=[];
 let modelCalls=0,proxyCalls=0;
 const backend={
  DB:d1Adapter(db,sqlSeen),AI_LAW_CF_MODE:'isolated-qa-only',
  INSTALLATION_ID:I,JWT_ISSUER:ISSUER,JWT_AUDIENCE:'ai-law-api',
  JWT_JWKS_JSON:'{"keys":[]}',QA_RATE_PEPPER:'synthetic-only-r126-qa-rate-pepper-2026',
  AI:{async run(){modelCalls++;return {response:'Bản nháp giả lập [A1]. Luật sư kiểm duyệt.'};}}
 };
 const site={QA_AUTH:{async fetch(request){proxyCalls++;return handle(request,backend,{now:NOW});}}};
 const call=(path,options)=>handleSite(makeReq(path,options),site);
 try{
  assert.equal((await call('/login')).status,200);
  assert.equal((await call('/app#assistant')).status,302);
  assert.equal((await call('/api/qa/session')).status,401);
  const pre=usage(db);assert.deepEqual(pre,{rows:0,requests:0});
  const loginA=await call('/api/qa/login',{method:'POST',body:{email:EMAIL_A,password:PASS}});
  const loginB=await call('/api/qa/login',{method:'POST',body:{email:EMAIL_B,password:PASS}});
  assert.equal(loginA.status,200);assert.equal(loginB.status,200);
  let sa=extractSid(loginA),sb=extractSid(loginB);assert.notEqual(sa,sb);
  assert.equal((await call('/app#assistant',{sid:sa})).status,200);
  assert.equal((await call('/app.js',{sid:sa})).status,200);
  assert.equal((await call('/account',{sid:sb})).status,200);
  const wa=await (await call('/api/qa/workspaces',{sid:sa})).json();
  const wb=await (await call('/api/qa/workspaces',{sid:sb})).json();
  assert.equal(wa.workspaces.length,2);assert.equal(wb.workspaces.length,1);
  assert.equal(wb.workspaces[0].role,'tenant_admin');

  // Existing QA login orders tenant kinds DESC: A initially enters personal.
  assert.equal((await (await call('/api/qa/session',{sid:sa})).json()).tenant_id,TA);
  assert.deepEqual((await (await call('/api/qa/matters',{sid:sa})).json()).matters.map(x=>x.id),[MA]);
  assert.equal((await call('/api/qa/legal/run',{method:'POST',sid:sa,body:legal('UC04',MB)})).status,404);
  assert.equal(modelCalls,0);assert.deepEqual(usage(db),pre);
  const toOrg=await call('/api/qa/switch-workspace',{method:'POST',sid:sa,body:{tenant_id:TB}});
  assert.equal(toOrg.status,200);
  const oldInitialSid=sa;sa=extractSid(toOrg);assert.notEqual(sa,oldInitialSid);
  assert.equal((await call('/api/qa/session',{sid:oldInitialSid})).status,401);
  assert.equal((await (await call('/api/qa/session',{sid:sa})).json()).tenant_id,TB);
  assert.equal((await (await call('/api/qa/session',{sid:sb})).json()).tenant_id,TB);
  const ma=(await (await call('/api/qa/matters',{sid:sa})).json()).matters;
  const mb=(await (await call('/api/qa/matters',{sid:sb})).json()).matters;
  assert.deepEqual(ma.map(x=>x.id),[MB]);
  assert.deepEqual(mb.map(x=>x.id),[MP]);
  assert.equal((await call('/api/qa/legal/run',{method:'POST',sid:sa,body:legal('UC04',MP)})).status,404);
  assert.equal((await call('/api/qa/legal/run',{method:'POST',sid:sb,body:legal('UC04',MB)})).status,404);
  assert.equal(modelCalls,0);assert.deepEqual(usage(db),pre);

  const local=await call('/api/qa/legal/run',{method:'POST',sid:sa,body:legal('UC10',MB)});
  assert.equal(local.status,200);
  assert.equal((await local.json()).mode,'local_example_only');
  assert.equal(modelCalls,0);assert.deepEqual(usage(db),pre);

  // Cross-origin request is stopped by website before backend.
  const beforeProxy=proxyCalls;
  const forged=await call('/api/qa/legal/run',{method:'POST',sid:sa,body:legal('UC10',MB),origin:'https://outside.invalid'});
  assert.equal(forged.status,403);
  assert.equal(proxyCalls,beforeProxy);
  assert.deepEqual(usage(db),pre);

  // Tenant admin still cannot read lawyer's private matter without explicit ACL.
  const approved=await call('/api/qa/legal/run',{method:'POST',sid:sb,body:legal('UC04',MP)});
  assert.equal(approved.status,200);
  assert.equal((await approved.json()).mode,'ai_draft_not_verified');
  assert.equal(modelCalls,1);
  assert.deepEqual(usage(db),{rows:1,requests:1});
  const count=db.prepare('SELECT tenant_id,user_id,requests FROM qa_legal_ai_quota').get();
  assert.equal(count.tenant_id,TB);assert.equal(count.user_id,B);assert.equal(count.requests,1);

  // User B cannot switch into user A's personal tenant.
  assert.equal((await call('/api/qa/switch-workspace',{method:'POST',sid:sb,body:{tenant_id:TA}})).status,404);
  assert.equal((await call('/api/qa/session',{sid:sb})).status,200);

  const switched=await call('/api/qa/switch-workspace',{method:'POST',sid:sa,body:{tenant_id:TA}});
  assert.equal(switched.status,200);
  const newSa=extractSid(switched);assert.notEqual(newSa,sa);
  assert.equal((await call('/app#assistant',{sid:sa})).status,302,'Old cookie cannot render protected workspace');
  assert.equal((await call('/api/qa/session',{sid:sa})).status,401);
  sa=newSa;
  assert.equal((await (await call('/api/qa/session',{sid:sa})).json()).tenant_id,TA);
  assert.deepEqual((await (await call('/api/qa/matters',{sid:sa})).json()).matters.map(x=>x.id),[MA]);
  assert.equal((await call('/api/qa/legal/run',{method:'POST',sid:sa,body:legal('UC04',MB)})).status,404);
  assert.equal(modelCalls,1);assert.deepEqual(usage(db),{rows:1,requests:1});
  assert.equal((await call('/api/qa/logout',{method:'POST',sid:sa,body:{}})).status,200);
  assert.equal((await call('/api/qa/logout',{method:'POST',sid:sb,body:{}})).status,200);
  assert.equal((await call('/app#assistant',{sid:sa})).status,302);
  assert.equal((await call('/api/qa/session',{sid:sb})).status,401);
  assert.ok(sqlSeen.includes(MATTER_LIST_SQL));
  assert.ok(sqlSeen.includes(LEGAL_MATTER_ACCESS_SQL));
  assert.equal(sqlSeen.filter(x=>x===LEGAL_QUOTA_SQL).length,1);
 }finally{db.close();}
});
