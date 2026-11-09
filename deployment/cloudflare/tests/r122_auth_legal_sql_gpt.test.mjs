/** R122: Full synthetic cookie login -> rotated tenant session -> legal MatterACL.
 * Actual mobileApi & legalApi, Node 22 SQLite and real exported SQL.
 * Entire DB is temporary in-memory; never call Cloudflare or use client records.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {pbkdf2Sync} from 'node:crypto';
import {mobileApi} from '../src/mobile_auth.mjs';
import {legalApi,LEGAL_MATTER_ACCESS_SQL,LEGAL_QUOTA_SQL} from '../src/qa_legal_workflows.mjs';

const I='11111111-1111-4111-8111-111111111111';
const A='22222222-2222-4222-8222-222222222222';
const B='33333333-3333-4333-8333-333333333333';
const TA='44444444-4444-4444-8444-444444444444';
const TB='55555555-5555-4555-8555-555555555555';
const TC='66666666-6666-4666-8666-666666666666';
const MA='77777777-7777-4777-8777-777777777777';
const MS='88888888-8888-4888-8888-888888888888';
const MP='99999999-9999-4999-8999-999999999999';
const MN='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const URL='https://standalone.synthetic.invalid';
const ISSUER='https://idp.synthetic.invalid';
const NOW=1800000000;
const SOURCE='Điều 1. Hai bên giao hàng ngày 15 tháng 9 và thanh toán sau khi nghiệm thu.';
const PASSWORD='SYNTHETIC-only-PBKDF2-qa-2026';
const SALT='1234567890abcdef1234567890abcdef';
const EMAIL_A='a.r122@synthetic.invalid';
const EMAIL_B='b.r122@synthetic.invalid';

function database(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../migrations/0001_cf_qa_metadata.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/0002_cf_qa_mobile_login.sql',import.meta.url),'utf8'));
 db.exec('CREATE TABLE qa_legal_ai_quota (installation_id TEXT NOT NULL,tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,utc_day INTEGER NOT NULL,requests INTEGER NOT NULL CHECK(requests BETWEEN 1 AND 12),PRIMARY KEY(installation_id,tenant_id,user_id,utc_day));');
 const inserts=[
  ['INSERT INTO qa_principals VALUES(?,?,?)',[I,A,'active']],
  ['INSERT INTO qa_principals VALUES(?,?,?)',[I,B,'active']],
  ['INSERT INTO qa_tenants VALUES(?,?,?)',[I,TA,'personal']],
  ['INSERT INTO qa_tenants VALUES(?,?,?)',[I,TB,'organization']],
  ['INSERT INTO qa_tenants VALUES(?,?,?)',[I,TC,'organization']],
  ['INSERT INTO qa_memberships(installation_id,tenant_id,user_id,role_key,status) VALUES(?,?,?,?,?)',[I,TA,A,'lawyer','active']],
  ['INSERT INTO qa_memberships(installation_id,tenant_id,user_id,role_key,status) VALUES(?,?,?,?,?)',[I,TB,A,'lawyer','active']],
  ['INSERT INTO qa_memberships(installation_id,tenant_id,user_id,role_key,status) VALUES(?,?,?,?,?)',[I,TB,B,'tenant_admin','active']],
  ['INSERT INTO qa_memberships(installation_id,tenant_id,user_id,role_key,status) VALUES(?,?,?,?,?)',[I,TC,B,'lawyer','active']],
  ['INSERT INTO qa_matters VALUES(?,?,?,?)',[I,TA,MA,1]],
  ['INSERT INTO qa_matters VALUES(?,?,?,?)',[I,TB,MS,1]],
  ['INSERT INTO qa_matters VALUES(?,?,?,?)',[I,TB,MP,1]],
  ['INSERT INTO qa_matters VALUES(?,?,?,?)',[I,TB,MN,1]],
  ['INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)',[I,TA,MA,A,'read','allow',1,NOW-60,null]],
  ['INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)',[I,TB,MS,A,'read','allow',1,NOW-60,null]],
  ['INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)',[I,TB,MP,B,'read','allow',1,NOW-60,null]]
 ];
 for(const [sql,args] of inserts)db.prepare(sql).run(...args);
 const hashed=pbkdf2Sync(PASSWORD,Buffer.from(SALT,'hex'),100000,32,'sha256').toString('hex');
 for(const [user,email] of [[A,EMAIL_A],[B,EMAIL_B]])
  db.prepare('INSERT INTO qa_login_verifiers(installation_id,email,user_id,subject,password_salt,password_hash,pbkdf2_iterations,status) VALUES(?,?,?,?,?,?,?,?)').run(I,email,user,'subject-'+user,SALT,hashed,100000,'active');
 return db;
}
function adapter(db){
 const statements=[];
 const d1={
  prepare(sql){
   return {bind(...params){
    statements.push({sql,params});
    return {
     async first(){return db.prepare(sql).get(...params)??null;},
     async all(){return {results:db.prepare(sql).all(...params)};},
     async run(){const x=db.prepare(sql).run(...params);return {meta:{changes:x.changes}};}
    };
   }};
  },
  async batch(items){
   const rows=[];
   db.exec('BEGIN');
   try{
    for(const item of items)rows.push(await item.run());
    db.exec('COMMIT');return rows;
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
 };
 return {d1,statements};
}
function request(path,{method='GET',cookie,body}={}){
 const headers={};
 if(cookie)headers.Cookie='al_qa_session='+cookie;
 if(method==='POST'){
  headers.Origin=URL;headers['Sec-Fetch-Site']='same-origin';
  headers['Content-Type']='application/json';
 }
 return new Request(URL+path,{method,headers,...(method==='POST'?{body:JSON.stringify(body)}:{})});
}
function sourceRequest(uc,matter,cookie){
 return request('/api/qa/legal/run',{method:'POST',cookie,
  body:{uc,matter_id:matter,source_text:SOURCE,source_text_2:'',
   question:uc==='UC10'?'giao hàng tháng 9':'',language:'vi',synthetic_consent:true}});
}
const sessionCookie=response=>{
 const found=response.headers.get('Set-Cookie')?.match(/al_qa_session=([0-9a-f-]{36})/);
 assert.ok(found,'Expected isolated QA HttpOnly session cookie');return found[1];
};
const usage=db=>db.prepare('SELECT COUNT(*) AS rows,COALESCE(SUM(requests),0) AS requests FROM qa_legal_ai_quota').get();

test('R122 real cookie+SQLite: two users, tenant switch, MatterACL, local search, AI quota',async()=>{
 const db=database();
 let aiCalls=0;
 const {d1,statements}=adapter(db);
 const env={AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:I,
  JWT_ISSUER:ISSUER,QA_RATE_PEPPER:'only-synthetic-ci-rate-pepper-2026',
  DB:d1,AI:{async run(){aiCalls++;return {response:'Nháp thử nghiệm [A1]. Luật sư cần kiểm duyệt.'};}}
 };
 try{
  const loginA=await mobileApi(request('/api/qa/login',{
   method:'POST',body:{email:EMAIL_A,password:PASSWORD}}),env,{now:NOW});
  assert.equal(loginA.status,200,await loginA.clone().text());
  const sidA=sessionCookie(loginA);
  assert.match(loginA.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Strict/);
  const sessionA=await mobileApi(request('/api/qa/session',{cookie:sidA}),env,{now:NOW});
  assert.equal(sessionA.status,200);
  assert.deepEqual(
   (({tenant_id,role})=>({tenant_id,role}))(await sessionA.json()),
   {tenant_id:TA,role:'lawyer'}
  );

  const loginB=await mobileApi(request('/api/qa/login',{
   method:'POST',body:{email:EMAIL_B,password:PASSWORD}}),env,{now:NOW});
  assert.equal(loginB.status,200);
  const sidB=sessionCookie(loginB);
  assert.notEqual(sidA,sidB,'Different users cannot share session');
  assert.equal((await (await mobileApi(request('/api/qa/session',{cookie:sidB}),env,{now:NOW})).json()).tenant_id,TB);

  const before=usage(db);assert.equal(before.requests,0);
  // A's active tenant is TA; trying TB material before switching is denied.
  const deniedCrossTenant=await legalApi(sourceRequest('UC04',MS,sidA),env,{now:NOW});
  assert.equal(deniedCrossTenant.status,404);
  assert.equal(aiCalls,0);assert.deepEqual(usage(db),before);
  assert.equal((await deniedCrossTenant.json()).source_anchors,undefined);

  const refused=await mobileApi(request('/api/qa/switch-workspace',{
   method:'POST',cookie:sidA,body:{tenant_id:TC}}),env,{now:NOW});
  assert.equal(refused.status,404,'A cannot enter B-only tenant');
  assert.equal(refused.headers.has('Set-Cookie'),false);
  assert.equal((await mobileApi(request('/api/qa/session',{cookie:sidA}),env,{now:NOW})).status,200);

  const switched=await mobileApi(request('/api/qa/switch-workspace',{
   method:'POST',cookie:sidA,body:{tenant_id:TB}}),env,{now:NOW});
  assert.equal(switched.status,200);
  const rotated=sessionCookie(switched);
  assert.notEqual(rotated,sidA,'Tenant switch rotates secure cookie');
  assert.equal((await mobileApi(request('/api/qa/session',{cookie:sidA}),env,{now:NOW})).status,401);
  assert.equal((await (await mobileApi(request('/api/qa/session',{cookie:rotated}),env,{now:NOW})).json()).tenant_id,TB);

  // A shares tenant TB with B, but lacks B-private MatterACL.
  const privateDenied=await legalApi(sourceRequest('UC04',MP,rotated),env,{now:NOW});
  assert.equal(privateDenied.status,404);
  assert.equal(aiCalls,0);assert.deepEqual(usage(db),before);
  assert.equal((await privateDenied.json()).source_anchors,undefined);

  const sharedSearch=await legalApi(sourceRequest('UC10',MS,rotated),env,{now:NOW});
  assert.equal(sharedSearch.status,200);
  const findings=await sharedSearch.json();
  assert.equal(findings.mode,'local_example_only');
  assert.ok(findings.findings.length>0);
  assert.equal(aiCalls,0,'Local sample search never calls model');
  assert.deepEqual(usage(db),before,'Local search never charges quota');

  const adminNoAcl=await legalApi(sourceRequest('UC04',MN,sidB),env,{now:NOW});
  assert.equal(adminNoAcl.status,404,'tenant_admin without MatterACL cannot read');
  assert.equal(aiCalls,0);assert.deepEqual(usage(db),before);

  const userBPrivate=await legalApi(sourceRequest('UC10',MP,sidB),env,{now:NOW});
  assert.equal(userBPrivate.status,200);
  assert.equal(aiCalls,0);assert.deepEqual(usage(db),before);
  const userBCrossTenant=await legalApi(sourceRequest('UC04',MA,sidB),env,{now:NOW});
  assert.equal(userBCrossTenant.status,404);
  assert.equal(aiCalls,0);assert.deepEqual(usage(db),before);

  // Only a *valid* authorized model draft consumes one per-user quota entry.
  const legitDraft=await legalApi(sourceRequest('UC04',MP,sidB),env,{now:NOW});
  assert.equal(legitDraft.status,200,await legitDraft.clone().text());
  assert.equal((await legitDraft.json()).mode,'ai_draft_not_verified');
  assert.equal(aiCalls,1);
  assert.deepEqual(usage(db),{rows:1,requests:1});
  assert.deepEqual(db.prepare('SELECT tenant_id,user_id,requests FROM qa_legal_ai_quota').get(),
   {tenant_id:TB,user_id:B,requests:1});

  // Subsequent rejected request must leave model/quota unchanged.
  assert.equal((await legalApi(sourceRequest('UC04',MP,rotated),env,{now:NOW})).status,404);
  assert.equal(aiCalls,1);assert.deepEqual(usage(db),{rows:1,requests:1});
  assert.ok(statements.some(x=>x.sql===LEGAL_MATTER_ACCESS_SQL),'Must run the actual ACL SQL');
  assert.equal(statements.filter(x=>x.sql===LEGAL_QUOTA_SQL).length,1,
   'Only a valid authorized draft reaches quota');
 }finally{db.close();}
});
