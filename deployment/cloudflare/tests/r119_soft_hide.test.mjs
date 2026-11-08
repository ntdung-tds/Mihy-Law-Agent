import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matterApi,MATTER_SOFT_HIDE_SQL,MATTER_LIST_SQL,MATTER_EDIT_SQL,MATTER_RENAME_SQL} from '../src/matter_workspace.mjs';
import {caseR2Api,CASE_ACL_SQL} from '../src/qa_case_r2.mjs';
import {LEGAL_MATTER_ACCESS_SQL} from '../src/qa_legal_workflows.mjs';
import {DOCUMENT_ACL_SQL} from '../src/qa_documents.mjs';
const INSTALL='11111111-1111-4111-8111-111111111111';
const USER='22222222-2222-4222-8222-222222222222';
const TENANT='33333333-3333-4333-8333-333333333333';
const CASE='44444444-4444-4444-8444-444444444444';
const SID='55555555-5555-4555-8555-555555555555';
const BASE='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const NOW=1800000000;
function fixture({role='lawyer',hasSession=true,canWrite=true,canRead=true,
                   version=1,hidden=false}={}){
 const state={hidden,history:[],version,objects:new Map([['sample-r2-object',new Uint8Array([37,80,68,70])]])};
 const queries=[];
 const env={INSTALLATION_ID:INSTALL,AI_LAW_CF_MODE:'isolated-qa-only',CASE_FILES_R2:{
  get:async key=>state.objects.has(key)?{arrayBuffer:async()=>state.objects.get(key).buffer}:null,
  put:async (key,val)=>{state.objects.set(key,val);},
  delete:async key=>{state.objects.delete(key);}
 },DB:{prepare(sql){return{bind(...params){
  queries.push({sql,params});
  return{
   async first(){
    if(sql.includes('FROM qa_sessions s'))return hasSession?{user_id:USER,tenant_id:TENANT,role_key:role}:null;
    if(sql===MATTER_EDIT_SQL)return state.hidden||!canWrite?null:{title:'Synthetic dossier',version:state.version};
    if(sql===CASE_ACL_SQL)return state.hidden||!canRead?null:{allowed:1};
    if(sql.includes('SELECT COUNT(*) AS n'))return {n:1};
    return null;
   },
   async all(){
    if(sql===MATTER_LIST_SQL)return{results:state.hidden||!canRead?[]:[{
      matter_id:CASE,title:'Synthetic dossier',created_at:NOW,version:state.version,
      can_write:canWrite?1:0,category:'Dân sự',case_status:'open',case_reference:'QA001'
    }]};
    return {results:[]};
   },
   async run(){
    if(sql===MATTER_SOFT_HIDE_SQL){
     const p=queries.at(-1).params;
     // ACL, expected-version and tombstone exclusion are checked by the real
     // SQL atomically. Model their outcome for API tests here.
     if(state.hidden||!canWrite||p[5]!==state.version)return {meta:{changes:0}};
     state.hidden=true;state.history.push({actor:USER,at:NOW});
     return {meta:{changes:1}};
    }
    return {meta:{changes:0}};
   }
  };
 }}}}};
 return {env,state,queries};
}
const req=(method='PATCH',body={action:'hide',expected_version:1},origin=BASE,path='/api/qa/matters/'+CASE)=>{
 const headers={Cookie:'al_qa_session='+SID};
 if(method==='PATCH'){headers.Origin=origin;headers['Content-Type']='application/json';headers['Sec-Fetch-Site']='same-origin';}
 return new Request(BASE+path,{method,headers,body:method==='PATCH'?JSON.stringify(body):undefined});
};
test('R119: a permitted write user hides a record but never removes D1/R2 objects',async()=>{
 const f=fixture();
 const before=await matterApi(req('GET',undefined,BASE,'/api/qa/matters'),f.env,{now:NOW});
 assert.equal((await before.json()).matters.length,1);
 const res=await matterApi(req(),f.env,{now:NOW});
 assert.equal(res.status,200,await res.clone().text());
 assert.deepEqual(await res.json(),{id:CASE,hidden:true,physical_deleted:false});
 assert.equal(f.state.hidden,true);
 assert.equal(f.state.history.length,1);
 assert.equal(f.state.objects.size,1,'R2 object must be preserved');
 const after=await matterApi(req('GET',undefined,BASE,'/api/qa/matters'),f.env,{now:NOW});
 assert.deepEqual((await after.json()).matters,[]);
 const detail=await caseR2Api(req('GET',undefined,BASE,'/api/qa/cases/'+CASE),f.env,{now:NOW});
 assert.equal(detail.status,404);
 const file=await caseR2Api(req('GET',undefined,BASE,'/api/qa/cases/'+CASE+'/files'),f.env,{now:NOW});
 assert.equal(file.status,404,'R2 files inaccessible via the hidden case');
});
test('R119: active MatterACL write, owner tenant and optimistic version needed to hide',async()=>{
 for(const [options,code] of [
  [{hasSession:false},401],[{role:'viewer'},403],[{canWrite:false},404],[{hidden:true},404],
  [{version:2},409]
 ]){
  const f=fixture(options),r=await matterApi(req(),f.env,{now:NOW});
  assert.equal(r.status,code,JSON.stringify(options));
  assert.equal(f.state.history.length,0);
  assert.equal(f.state.objects.size,1);
 }
 const mismatched=fixture();
 const badVersion=await matterApi(req('PATCH',{action:'hide',expected_version:999}),mismatched.env,{now:NOW});
 assert.equal(badVersion.status,409);
 assert.equal(mismatched.state.hidden,false);
 const replay=fixture();
 assert.equal((await matterApi(req(),replay.env,{now:NOW})).status,200);
 assert.equal((await matterApi(req(),replay.env,{now:NOW})).status,404);
 assert.equal(replay.state.history.length,1);
});
test('R119: malformed requests, CSRF and physical DELETE not available',async()=>{
 const f=fixture();
 for(const body of [
  {action:'purge',expected_version:1},{action:'hide',expected_version:0},
  {action:'hide',expected_version:'1'},{action:'hide',expected_version:1,hard:true},
  {action:'hide'},[]
 ]){
  const r=await matterApi(req('PATCH',body),f.env,{now:NOW});
  assert.equal(r.status,400,JSON.stringify(body));
 }
 assert.equal((await matterApi(req('PATCH',{action:'hide',expected_version:1},'https://bad.example'),f.env,{now:NOW})).status,400);
 assert.equal((await matterApi(req('DELETE',null,BASE),f.env,{now:NOW})).status,405);
 assert.equal(f.state.hidden,false);
 assert.equal(f.state.objects.size,1);
});
test('R119: all relevant server authorization paths reject hidden cases and preserve immutable tombstone',()=>{
 for(const [name,sql] of [
  ['list',MATTER_LIST_SQL],['edit',MATTER_EDIT_SQL],['rename',MATTER_RENAME_SQL],
  ['details/R2',CASE_ACL_SQL],['AI workflow',LEGAL_MATTER_ACCESS_SQL],
  ['legacy Drive',DOCUMENT_ACL_SQL],['soft-hide atomic SQL',MATTER_SOFT_HIDE_SQL]
 ])assert.match(sql,/qa_matter_hides/,name+' must enforce the tombstone');
 assert.match(MATTER_SOFT_HIDE_SQL,/effect='deny'/);
 assert.match(MATTER_SOFT_HIDE_SQL,/c\.version=\?/);
 const schema=readFileSync('deployment/cloudflare/migrations/0018_r119_matter_soft_hide.sql','utf8');
 assert.match(schema,/CREATE TABLE IF NOT EXISTS qa_matter_hides/);
 assert.match(schema,/qa_matter_hides_no_delete/);
 assert.match(schema,/qa_matter_hides_no_update/);
 const backend=readFileSync('deployment/cloudflare/src/matter_workspace.mjs','utf8');
 assert.doesNotMatch(backend,/\bDELETE\s+FROM\s+qa_matters\b/i);
 assert.doesNotMatch(backend,/\bDELETE\s+FROM\s+qa_case_files_r2\b/i);
});
test('R119: accessible three-button mobile UI and confirmable hide without destructive links',()=>{
 const js=readFileSync('web/r0-preview/matters.js','utf8');
 const css=readFileSync('web/r0-preview/styles.css','utf8');
 const html=readFileSync('web/r0-preview/index.html','utf8');
 for(const action of ["makeAction('Xem','view'","makeAction('Sửa','edit'","makeAction('Xóa','hide'"])
  assert.ok(js.includes(action),action);
 assert.match(js,/action:'hide',expected_version:m\.version/);
 assert.match(js,/Tài liệu.*giữ nguyên|Hồ sơ và tệp R2 vẫn được giữ nguyên/);
 assert.match(js,/physical_deleted!==false/);
 assert.match(css,/min-height:45px/);
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(html,/id="matter-list-feedback"/);
});
