import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleSite} from '../../../build/ai-law-web/site_worker.mjs';
import {handle} from '../src/worker.mjs';
const I='11111111-1111-4111-8111-111111111111', NOW=1800000000;
const token='a'.repeat(64), cookie='__Host-al_platform_session='+token;
const hash=createHash('sha256').update(token).digest('hex');
const web='https://ai-law-web-qa.iaict-platform.workers.dev';
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const f of ['r216_platform_admin_gpt.sql','r288_platform_session_gpt.sql'])
  db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 db.prepare('INSERT INTO platform_admin_principals VALUES (?,?,?)').run(I,'synthetic-admin','active');
 db.prepare('INSERT INTO platform_admin_sessions VALUES (?,?,?,?,NULL)').run(I,hash,'synthetic-admin',NOW+60);
 db.exec("INSERT INTO platform_service_plans(plan_id,plan_name,max_users,max_storage_bytes) VALUES ('test-plan','Test plan',5,1000); INSERT INTO platform_tenant_services(tenant_id,plan_id) VALUES ('test-tenant','test-plan')");
 const queries=[];
 function stmt(sql,args=[]){return {bind(...p){return stmt(sql,p);},async first(){queries.push(sql);return db.prepare(sql).get(...args)??null;},async all(){queries.push(sql);return {success:true,results:db.prepare(sql).all(...args)};},async run(){queries.push(sql);const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}};}
 const DB={prepare:stmt,async batch(statements){db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:I,DB};
 const site={QA_AUTH:{fetch:request=>handle(request,env,{now:NOW})}};
 const request=(path,{headers={},method='GET',body}={})=>handleSite(new Request(web+path,{headers,method,body}),site);
 return {db,request,queries};
}
test('website through actual Worker to SQLite: page, session, metadata, audit and isolation',async()=>{
 const f=fixture();try{
  const anon=await f.request('/platform');assert.equal(anon.status,401);
  assert.equal((await f.request('/api/platform/plans',{headers:{cookie:'al_qa_session='+I,'x-role':'system_admin'}})).status,401);
  const page=await f.request('/platform',{headers:{cookie}});assert.equal(page.status,200);assert.match(await page.text(),/platform-root/);
  const css=await f.request('/platform.css',{headers:{cookie}});assert.equal(css.status,200);assert.match(await css.text(),/\.mihy-platform/);
  const s=await f.request('/api/platform/session',{headers:{cookie}});const {csrfToken}=await s.json();assert.match(csrfToken,/^[0-9a-f]{64}$/);
  const plans=await f.request('/api/platform/plans',{headers:{cookie}});assert.equal(plans.status,200);assert.equal((await plans.json()).items[0].plan_id,'test-plan');
  const body=JSON.stringify({tenantId:'test-tenant',status:'active',reasonCode:'TEST'});
  const headers={cookie,origin:web,'content-type':'application/json','x-csrf-token':csrfToken};
  assert.equal((await f.request('/api/platform/services',{method:'POST',headers:{...headers,origin:'https://foreign.invalid'},body})).status,403);
  assert.equal((await f.request('/api/platform/services',{method:'POST',headers:{...headers,'x-csrf-token':'b'.repeat(64)},body})).status,403);
  assert.equal(f.db.prepare('SELECT count(*) n FROM platform_admin_audit').get().n,0);
  const changed=await f.request('/api/platform/services',{method:'POST',headers,body});assert.equal(changed.status,200);assert.equal((await changed.json()).changed,true);
  assert.equal(f.db.prepare('SELECT service_status FROM platform_tenant_services').get().service_status,'active');
  assert.equal(f.db.prepare('SELECT actor_id FROM platform_admin_audit').get().actor_id,'synthetic-admin');
  assert.equal(f.db.prepare('SELECT count(*) n FROM platform_admin_audit').get().n,1);
  // Force an actual SQLite insert failure: UPDATE and audit must roll back together.
  f.db.exec("CREATE TRIGGER force_audit_failure BEFORE INSERT ON platform_admin_audit BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  const failed=await f.request('/api/platform/services',{method:'POST',headers,body:JSON.stringify({tenantId:'test-tenant',status:'suspended',reasonCode:'TEST'})});
  assert.equal(failed.status,503);assert.equal(f.db.prepare('SELECT service_status FROM platform_tenant_services').get().service_status,'active');
  assert.equal(f.db.prepare('SELECT count(*) n FROM platform_admin_audit').get().n,1);
  f.db.prepare("UPDATE platform_admin_principals SET status='disabled'").run();
  assert.equal((await f.request('/api/platform/plans',{headers:{cookie}})).status,403);
  assert.ok(f.queries.every(sql=>!sql.includes('qa_memberships')));
 }finally{f.db.close();}
});
