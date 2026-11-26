import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleSite} from '../../../build/ai-law-web/site_worker.mjs';
import {handle} from '../src/worker.mjs';
const I='11111111-1111-4111-8111-111111111111',T='22222222-2222-4222-8222-222222222222',T2='33333333-3333-4333-8333-333333333333';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SA='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',SB='bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb',SC='cccccccc-1111-4111-8111-cccccccccccc';
const NOW=1800000000,ISS='https://issuer.invalid',WEB='https://ai-law-web-qa.iaict-platform.workers.dev';
const details={reference:'QA-001',category:'Dân sự',status:'open',priority:'normal',client_label:'Synthetic client',counterparty_label:'Synthetic party',summary:'Dòng một\nDòng hai',deadline:'2030-02-28'};
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const f of ['0001_cf_qa_metadata.sql','0002_cf_qa_mobile_login.sql','0003_cf_qa_matter_catalog.sql','r108_qa_matter_rename.sql','r292_case_metadata_gpt.sql','r293_case_work_gpt.sql'])db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
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

const contact={kind:'client',name:'Synthetic contact',email:'sample@example.invalid',phone:'0123456789',state:'active'};
const activity={kind:'hearing',title:'Synthetic hearing',due_date:'2027-01-14',due_time:'09:30',contact_id:null,state:'open'};
test('R293 scoped contact lifecycle, activity scheduling, interaction and audit',async()=>{
 const f=fixture();try{
  const matter=await f.create(),url='/api/qa/case-work/'+matter;
  assert.equal((await f.request('/case-work/'+matter,{sid:null})).status,302);
  assert.equal((await f.request('/case-work/'+matter)).status,200);
  assert.equal((await f.request('/calendar')).status,200);
  const c=await f.request(url+'/contacts',{method:'POST',body:{record:contact}});assert.equal(c.status,201);const {id:cid}=await c.json();
  assert.equal((await f.request(url+'/contacts/'+cid,{method:'PATCH',body:{record:{...contact,phone:'0987654321'},expected_version:1}})).status,200);
  assert.equal((await f.request(url+'/contacts/'+cid,{method:'PATCH',body:{record:contact,expected_version:1}})).status,409);
  const a=await f.request(url+'/activities',{method:'POST',body:{record:activity}});assert.equal(a.status,201);const {id:aid}=await a.json();
  const interaction={...activity,kind:'interaction',title:'Synthetic consultation',contact_id:cid,state:'done'};
  assert.equal((await f.request(url+'/activities',{method:'POST',body:{record:interaction}})).status,201);
  assert.equal((await f.request(url+'/activities',{method:'POST',body:{record:{...interaction,contact_id:A}}})).status,409);
  assert.equal((await f.request(url+'/activities',{method:'POST',body:{record:{...activity,due_date:'2027-02-29'}}})).status,400);
  const loaded=await (await f.request(url)).json();
  assert.equal(loaded.contacts.length,1);assert.equal(loaded.contacts[0].phone,'0987654321');assert.equal(loaded.activities.length,2);assert.equal(loaded.events.length,4);
  assert.ok(!JSON.stringify(loaded.events).includes(contact.name));
  const calendar=await (await f.request('/api/qa/calendar')).json();
  assert.equal(calendar.timezone,'Asia/Ho_Chi_Minh');assert.equal(calendar.items.length,2);
  assert.equal(calendar.items.find(x=>x.id===aid).kind,'hearing');assert.ok(calendar.items.some(x=>x.kind==='case_deadline'));assert.ok(!calendar.items.some(x=>x.kind==='interaction'));
  assert.equal((await f.request(url+'/activities/'+aid,{method:'PATCH',body:{record:{...activity,state:'done'},expected_version:1}})).status,200);
  assert.equal((await (await f.request('/api/qa/calendar')).json()).items.length,1);
  assert.equal((await f.request(url+'/contacts/'+cid,{method:'PATCH',body:{record:{...contact,state:'archived'},expected_version:2}})).status,200);
  assert.equal((await f.request(url+'/activities',{method:'POST',body:{record:interaction}})).status,409);
  assert.throws(()=>f.db.exec('DELETE FROM qa_case_work_audit_gpt'));
 }finally{f.db.close();}
});
test('R293 deny overrides, other tenant, hidden matter, unsafe origin, rollback and private calendar',async()=>{
 const f=fixture();try{
  const matter=await f.create(),url='/api/qa/case-work/'+matter;
  assert.equal((await f.request(url,{sid:SB})).status,404);
  assert.equal((await f.request(url,{sid:SC})).status,404);
  assert.equal((await f.request('/api/qa/calendar',{sid:SC})).status,200);
  assert.deepEqual((await (await f.request('/api/qa/calendar',{sid:SC})).json()).items,[]);
  assert.equal((await f.request(url+'/contacts',{sid:SB,method:'POST',body:{record:contact}})).status,404);
  const allow=f.db.prepare('INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,1,?,NULL)');
  allow.run(I,T,matter,B,'read','allow',NOW);
  assert.equal((await f.request(url,{sid:SB})).status,200);
  assert.equal((await (await f.request(url,{sid:SB})).json()).can_write,false);
  assert.equal((await f.request(url+'/contacts',{sid:SB,method:'POST',body:{record:contact}})).status,404);
  allow.run(I,T,matter,B,'read','deny',NOW);
  assert.deepEqual((await (await f.request('/api/qa/calendar',{sid:SB})).json()).items,[]);
  assert.equal((await f.request(url+'/contacts',{method:'POST',body:{record:contact},headers:{origin:'https://foreign.invalid'}})).status,403);
  f.db.exec("CREATE TRIGGER fail_contact_audit BEFORE INSERT ON qa_case_work_audit_gpt BEGIN SELECT RAISE(ABORT,'forced'); END");
  assert.equal((await f.request(url+'/contacts',{method:'POST',body:{record:contact}})).status,503);
  assert.equal(f.db.prepare('SELECT count(*) n FROM qa_case_contacts_gpt').get().n,0);
  f.db.exec('DROP TRIGGER fail_contact_audit');
  assert.equal((await f.request(url+'/activities',{method:'POST',body:{record:activity}})).status,201);
  assert.equal((await f.request('/api/qa/case-info/'+matter+'/hide',{method:'POST',body:{expected_version:1}})).status,200);
  assert.deepEqual((await (await f.request('/api/qa/calendar')).json()).items,[]);
  assert.equal((await f.request(url)).status,404);
  assert.equal(f.db.prepare('SELECT count(*) n FROM qa_case_activities_gpt').get().n,1);
 }finally{f.db.close();}
});
