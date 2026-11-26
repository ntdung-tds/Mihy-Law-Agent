import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleSite} from '../../../build/ai-law-web/site_worker.mjs';
import {handle} from '../src/worker.mjs';
const I='11111111-1111-4111-8111-111111111111',NOW=1800000000,WEB='https://ai-law-web-qa.iaict-platform.workers.dev',TOKEN='a'.repeat(64),COOKIE='__Host-al_platform_session='+TOKEN;
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const f of ['r216_platform_admin_gpt.sql','r288_platform_session_gpt.sql','r290_platform_login_gpt.sql','r291_platform_catalog_gpt.sql'])db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 db.prepare('INSERT INTO platform_admin_principals VALUES (?,?,?)').run(I,'synthetic-admin','active');
 db.prepare('INSERT INTO platform_admin_sessions VALUES (?,?,?,?,NULL)').run(I,createHash('sha256').update(TOKEN).digest('hex'),'synthetic-admin',NOW+60);
 const queries=[];
 function stmt(sql,args=[]){return {bind(...p){return stmt(sql,p);},async first(){queries.push(sql);return db.prepare(sql).get(...args)??null;},async all(){queries.push(sql);return {success:true,results:db.prepare(sql).all(...args)};},async run(){queries.push(sql);return {success:true,meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}
 const DB={prepare:stmt,async batch(){throw Error('not needed');}};
 const site={QA_AUTH:{fetch:req=>handle(req,{AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:I,DB},{now:NOW})}};
 const request=(path,opts={})=>handleSite(new Request(WEB+path,opts),site);
 const session=async()=> (await (await request('/api/platform/session',{headers:{cookie:COOKIE}})).json()).csrfToken;
 const command=async(data,extra={})=>request('/api/platform/catalog',{method:'POST',headers:{cookie:COOKIE,origin:WEB,'content-type':'application/json','x-csrf-token':await session(),...extra},body:JSON.stringify(data)});
 const count=()=>db.prepare('SELECT count(*) n FROM platform_catalog_events').get().n;
 return {db,queries,request,command,count};
}
const plan={action:'plan_create',objectId:'test-plan',planName:'Test plan',maxUsers:5,maxStorageBytes:1000,reasonCode:'QA_TEST'};
const service={action:'service_create',objectId:'test-tenant',planId:'test-plan',licenseExpiresAt:'2030-01-01',reasonCode:'QA_TEST'};
test('R291 real SQLite plan, limits, pending subscription, license and immutable events',async()=>{
 const f=fixture();try{
  assert.equal((await f.command(plan)).status,201);
  assert.equal((await f.command({...plan,action:'plan_update',maxUsers:9})).status,201);
  assert.equal(f.db.prepare('SELECT max_users FROM platform_service_plans').get().max_users,9);
  assert.equal((await f.command({...plan,action:'plan_update',maxUsers:9})).status,409);
  assert.equal((await f.command(service)).status,201);
  assert.equal(f.db.prepare('SELECT service_status FROM platform_tenant_services').get().service_status,'pending');
  assert.equal((await f.command({...service,action:'license_update',licenseExpiresAt:'2031-02-28'})).status,201);
  assert.equal(f.db.prepare('SELECT license_expires_at FROM platform_tenant_services').get().license_expires_at,'2031-02-28');
  assert.equal((await f.command({action:'plan_retire',objectId:'test-plan',reasonCode:'QA_TEST'})).status,409);
  assert.equal(f.count(),4);
  const list=await f.request('/api/platform/catalog',{headers:{cookie:COOKIE}});assert.equal(list.status,200);assert.equal((await list.json()).items.length,4);
  assert.throws(()=>f.db.exec('DELETE FROM platform_catalog_events'));
  assert.ok(f.queries.every(q=>!q.includes('qa_memberships')&&!q.includes('qa_matters')&&!q.includes('qa_tenants')));
 }finally{f.db.close();}
});
test('R291 invalid, cross-origin, tenant cookie, revoked and trigger rollback',async()=>{
 const f=fixture();try{
  assert.equal((await f.request('/api/platform/catalog',{headers:{cookie:'al_qa_session='+I}})).status,401);
  assert.equal((await f.command({...plan,role:'system_admin'})).status,400);
  assert.equal((await f.command({...plan,maxUsers:-1})).status,400);
  assert.equal((await f.command(plan,{origin:'https://foreign.invalid'})).status,403);
  assert.equal((await f.command(plan,{'x-csrf-token':'b'.repeat(64)})).status,403);
  assert.equal((await f.command({...service,licenseExpiresAt:'2030-02-30'})).status,400);
  assert.equal((await f.command(service)).status,409);assert.equal(f.count(),0);
  f.db.exec("CREATE TRIGGER forced BEFORE INSERT ON platform_service_plans BEGIN SELECT RAISE(ABORT,'forced failure'); END");
  assert.equal((await f.command(plan)).status,503);assert.equal(f.count(),0);
  f.db.exec('DROP TRIGGER forced');
  assert.equal((await f.command(plan)).status,201);
  assert.equal((await f.command({action:'plan_retire',objectId:'test-plan',reasonCode:'QA_TEST'})).status,201);
  assert.equal((await f.command(service)).status,409);assert.equal(f.count(),2);
  f.db.exec("UPDATE platform_admin_principals SET status='disabled'");
  assert.equal((await f.request('/api/platform/catalog',{headers:{cookie:COOKIE}})).status,403);
 }finally{f.db.close();}
});
