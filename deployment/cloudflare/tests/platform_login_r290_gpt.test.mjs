import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,pbkdf2Sync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleSite} from '../../../build/ai-law-web/site_worker.mjs';
import {handle} from '../src/worker.mjs';
const I='11111111-1111-4111-8111-111111111111',NOW=1800000000,WEB='https://ai-law-web-qa.iaict-platform.workers.dev';
const email='synthetic@example.invalid',password='synthetic-test-only-password',salt='ab'.repeat(16);
const verifier=pbkdf2Sync(password,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex');
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const f of ['r216_platform_admin_gpt.sql','r288_platform_session_gpt.sql','r290_platform_login_gpt.sql'])db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 db.prepare('INSERT INTO platform_admin_principals VALUES (?,?,?)').run(I,'synthetic-admin','active');
 db.prepare('INSERT INTO platform_admin_credentials VALUES (?,?,?,?,?,?)').run(I,'synthetic-admin',email,salt,verifier,600000);
 const queries=[];
 function stmt(sql,args=[]){return {bind(...p){return stmt(sql,p);},async first(){queries.push(sql);return db.prepare(sql).get(...args)??null;},async all(){queries.push(sql);return {success:true,results:db.prepare(sql).all(...args)};},async run(){queries.push(sql);return {success:true,meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}
 const DB={prepare:stmt,async batch(statements){db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:I,DB,PLATFORM_PASSWORD_LOGIN_GPT:'enabled-qa-only'};
 const site={QA_AUTH:{fetch:req=>handle(req,env,{now:NOW})}};
 const request=(path,{method='GET',headers={},body}={})=>handleSite(new Request(WEB+path,{method,headers,body}),site);
 const login=(data={email,password},headers={})=>request('/api/platform/login',{method:'POST',headers:{origin:WEB,'content-type':'application/json',...headers},body:JSON.stringify(data)});
 const count=()=>db.prepare('SELECT count(*) n FROM platform_admin_sessions').get().n;
 return {db,env,queries,request,login,count};
}
const sessionCookie=r=>r.headers.get('set-cookie').split(';')[0];
test('R290 public login, separate password issuer, secure session, logout and append-only audit',async()=>{
 const f=fixture();try{
  assert.equal((await f.request('/platform/login')).status,200);
  assert.equal((await f.request('/platform/login.js')).status,200);
  assert.equal((await f.request('/platform')).status,401);
  const r=await f.login();assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,expires_in:1800});
  const set=r.headers.get('set-cookie');assert.match(set,/^__Host-al_platform_session=[0-9a-f]{64}; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=1800$/);
  const cookie=sessionCookie(r),token=cookie.split('=')[1],stored=f.db.prepare('SELECT * FROM platform_admin_sessions').get();
  assert.equal(stored.token_hash,createHash('sha256').update(token).digest('hex'));assert.notEqual(stored.token_hash,token);
  assert.equal((await f.request('/platform',{headers:{cookie}})).status,200);
  const {csrfToken}=await (await f.request('/api/platform/session',{headers:{cookie}})).json();
  assert.equal((await f.request('/api/platform/logout',{method:'POST',headers:{cookie,origin:WEB,'x-csrf-token':'b'.repeat(64)}})).status,403);
  const out=await f.request('/api/platform/logout',{method:'POST',headers:{cookie,origin:WEB,'x-csrf-token':csrfToken}});
  assert.equal(out.status,200);assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await f.request('/api/platform/session',{headers:{cookie}})).status,403);
  assert.deepEqual(f.db.prepare('SELECT event_type FROM platform_admin_session_audit ORDER BY event_id').all().map(x=>x.event_type),['issued','revoked']);
  assert.throws(()=>f.db.exec('DELETE FROM platform_admin_session_audit'));
  assert.ok(f.queries.every(x=>!x.includes('qa_memberships')&&!x.includes('qa_login_verifiers')));
 }finally{f.db.close();}
});
test('R290 reject wrong credentials, unknown user, tenant role, unsafe origin, malformed body and disabled opt-in',async()=>{
 const f=fixture();try{
  assert.equal((await f.login({email,password:'incorrect-test-password'})).status,401);
  assert.equal((await f.login({email:'unknown@example.invalid',password},{'cookie':'al_qa_session='+I,'x-role':'system_admin'})).status,401);
  assert.equal((await f.login({email,password},{origin:'https://foreign.invalid'})).status,403);
  assert.equal((await f.login({email,password,role:'system_admin'})).status,400);
  assert.equal((await f.login({email,password},{'content-encoding':'gzip'})).status,400);
  assert.equal((await f.login({email,password},{'content-length':'1'})).status,400);
  assert.equal((await f.request('/api/platform/login')).status,405);
  delete f.env.PLATFORM_PASSWORD_LOGIN_GPT;
  assert.equal((await f.login()).status,503);assert.equal(f.count(),0);
 }finally{f.db.close();}
});
test('R290 fixed-window cap, disabled principal and credential change revoke all existing sessions',async()=>{
 const f=fixture();try{
  const first=await f.login();assert.equal(first.status,200);const cookie=sessionCookie(first);
  f.db.prepare("UPDATE platform_admin_principals SET status='disabled'").run();
  assert.equal((await f.login()).status,401);
  f.db.prepare("UPDATE platform_admin_principals SET status='active'").run();
  assert.equal((await f.request('/api/platform/session',{headers:{cookie}})).status,403);
  const next=await f.login();assert.equal(next.status,200);const nextCookie=sessionCookie(next);
  f.db.prepare('UPDATE platform_admin_credentials SET password_hash=?').run('c'.repeat(64));
  assert.equal((await f.request('/api/platform/session',{headers:{cookie:nextCookie}})).status,403);
  f.db.prepare('UPDATE platform_admin_login_rate SET attempts=20').run();
  assert.equal((await f.login()).status,429);assert.equal(f.count(),2);
 }finally{f.db.close();}
});
