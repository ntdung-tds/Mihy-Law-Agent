import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleSite} from '../../../build/ai-law-web/site_worker.mjs';
import {handle,RUN_SQL,FILE_SQL} from '../src/worker.mjs';
const I='11111111-1111-4111-8111-111111111111',T='22222222-2222-4222-8222-222222222222',T2='33333333-3333-4333-8333-333333333333';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SA='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',SB='bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb',SC='cccccccc-1111-4111-8111-cccccccccccc';
const NOW=1800000000,ISS='https://issuer.invalid',WEB='https://ai-law-web-qa.iaict-platform.workers.dev';
const details={reference:'QA-001',category:'Dân sự',status:'open',priority:'normal',client_label:'Synthetic client',counterparty_label:'Synthetic party',summary:'Dòng một\nDòng hai',deadline:'2030-02-28'};
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const f of ['0001_cf_qa_metadata.sql','0002_cf_qa_mobile_login.sql','0003_cf_qa_matter_catalog.sql','r108_qa_matter_rename.sql','r292_case_metadata_gpt.sql'])db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 for(const t of [T,T2])db.prepare('INSERT INTO qa_tenants VALUES (?,?,?)').run(I,t,'organization');
 for(const [user,tenant,sid,role] of [[A,T,SA,'lawyer'],[B,T,SB,'tenant_admin'],[C,T2,SC,'lawyer']]){
  db.prepare('INSERT INTO qa_principals VALUES (?,?,?)').run(I,user,'active');
  db.prepare('INSERT INTO qa_memberships VALUES (?,?,?,?,?,1)').run(I,tenant,user,role,'active');
  db.prepare('INSERT INTO qa_login_verifiers VALUES (?,?,?,?,?,?,?,\'active\',0,NULL)').run(I,user+'@example.invalid',user,user,'a'.repeat(32),'b'.repeat(64),100000);
  db.prepare('INSERT INTO qa_sessions VALUES (?,?,?,?,?,?,?,NULL)').run(I,sid,ISS,user,user,tenant,NOW+600);
 }
 function stmt(sql,args=[]){return {bind(...p){return stmt(sql,p);},async first(){return db.prepare(sql).get(...args)??null;},async all(){return {success:true,results:db.prepare(sql).all(...args)};},async run(){return {success:true,meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}
 const DB={prepare:stmt,async batch(statements){db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const site={QA_AUTH:{fetch:req=>handle(req,{AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:I,JWT_ISSUER:ISS,DB},{now:NOW})}};
 const request=(path,{sid=SA,method='GET',body,headers={}}={})=>handleSite(new Request(WEB+path,{method,headers:{...(sid?{cookie:'al_qa_session='+sid}:{}),...(method==='GET'?{}:{origin:WEB,'content-type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)}),site);
 const create=async()=>{const r=await request('/api/qa/matters',{method:'POST',body:{title:'Synthetic matter',details}});assert.equal(r.status,201);return (await r.json()).id;};
 return {db,request,create};
}
test('R292 full create, details, tenant isolation, edit and immutable history',async()=>{
 const f=fixture();try{
  assert.equal((await f.request('/case-detail/new',{sid:null})).status,302);
  assert.equal((await f.request('/case-detail/new')).status,200);
  const id=await f.create(),url='/api/qa/case-info/'+id;
  const read=await f.request(url);assert.equal(read.status,200);const b=await read.json();
  assert.deepEqual(b.details,details);assert.equal(b.version,1);assert.equal(b.can_write,true);
  assert.equal((await f.request(url,{sid:SB})).status,404);
  assert.equal((await f.request(url,{sid:SC})).status,404);
  assert.equal((await f.request(url,{sid:null,headers:{cookie:'__Host-al_platform_session='+'a'.repeat(64)}})).status,401);
  const next={...details,status:'in_progress',deadline:'2031-01-01'};
  assert.equal((await f.request(url,{method:'PATCH',body:{details:next,expected_version:1}})).status,200);
  assert.equal((await f.request(url,{method:'PATCH',body:{details:next,expected_version:1}})).status,409);
  assert.equal((await f.request(url,{method:'PATCH',body:{details:{...next,deadline:'2031-02-29'},expected_version:2}})).status,400);
  assert.equal((await f.request(url,{method:'PATCH',body:{details:{...next,tenantId:T2},expected_version:2}})).status,400);
  const events=await (await f.request(url+'/events')).json();assert.equal(events.events.length,2);
  const updated=events.events.find(x=>x.action==='details_updated');assert.deepEqual(updated.fields,['status','deadline']);assert.ok(!JSON.stringify(events).includes('Synthetic client'));
  assert.throws(()=>f.db.exec('DELETE FROM qa_case_metadata_events_gpt'));
 }finally{f.db.close();}
});
test('R292 soft hide invalidates current ACLs without deleting data; deny overrides and rollback',async()=>{
 const f=fixture();try{
  const id=await f.create(),url='/api/qa/case-info/'+id;
  const allow=f.db.prepare('INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,1,?,NULL)');
  allow.run(I,T,id,B,'read','allow',NOW);allow.run(I,T,id,B,'write','allow',NOW);allow.run(I,T,id,B,'read','deny',NOW);
  assert.equal((await f.request(url,{sid:SB})).status,404);
  assert.equal((await f.request(url,{sid:SB,method:'PATCH',body:{details,expected_version:1}})).status,404);
  assert.equal((await f.request(url+'/hide',{method:'POST',body:{expected_version:2}})).status,409);
  f.db.exec("CREATE TRIGGER forced_hide BEFORE INSERT ON qa_case_metadata_events_gpt WHEN NEW.action='case_hidden' BEGIN SELECT RAISE(ABORT,'forced'); END");
  assert.equal((await f.request(url+'/hide',{method:'POST',body:{expected_version:1}})).status,503);
  assert.equal(f.db.prepare('SELECT acl_version FROM qa_matters').get().acl_version,1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM qa_matter_hides').get().n,0);
  f.db.exec('DROP TRIGGER forced_hide');
  const hidden=await f.request(url+'/hide',{method:'POST',body:{expected_version:1}});assert.equal(hidden.status,200);assert.deepEqual(await hidden.json(),{id,hidden:true,physical_deleted:false});
  assert.equal(f.db.prepare('SELECT acl_version FROM qa_matters').get().acl_version,2);
  assert.equal(f.db.prepare('SELECT count(*) n FROM qa_case_details').get().n,1);
  assert.equal((await f.request(url)).status,404);
  assert.deepEqual((await (await f.request('/api/qa/matters')).json()).matters,[]);
  f.db.prepare('INSERT INTO qa_runs VALUES (?,?,?,?,?)').run(I,T,'run1',id,'{}');
  f.db.prepare('INSERT INTO qa_file_links VALUES (?,?,?,?,?,?,?)').run(I,T,'file1',id,'google_drive','synthetic','application/pdf');
  const args=[I,T,'run1',A,NOW,NOW,A,NOW,NOW];
  assert.equal(f.db.prepare(RUN_SQL).get(...args),undefined);
  assert.equal(f.db.prepare(FILE_SQL).get(I,T,'file1',A,NOW,NOW,A,NOW,NOW),undefined);
 }finally{f.db.close();}
});
test('R292 create is atomic on audit failure, reject oversized body',async()=>{
 const f=fixture();try{
  f.db.exec("CREATE TRIGGER forced_create BEFORE INSERT ON qa_case_metadata_events_gpt BEGIN SELECT RAISE(ABORT,'forced'); END");
  assert.equal((await f.request('/api/qa/matters',{method:'POST',body:{title:'Synthetic matter',details}})).status,503);
  assert.equal(f.db.prepare('SELECT count(*) n FROM qa_matters').get().n,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM qa_matter_acl').get().n,0);
  assert.equal((await f.request('/api/qa/matters',{method:'POST',body:{title:'Synthetic matter',details:{...details,summary:'x'.repeat(7000)}}})).status,400);
 }finally{f.db.close();}
});
