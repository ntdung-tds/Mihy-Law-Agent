import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {caseR2Api,CASE_ACL_SQL} from '../src/qa_case_r2.mjs';

const I='11111111-1111-4111-8111-111111111111';
const U='22222222-2222-4222-8222-222222222222';
const T='33333333-3333-4333-8333-333333333333';
const M='44444444-4444-4444-8444-444444444444';
const SID='55555555-5555-4555-8555-555555555555';
const BASE='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const NOW=1800000000;
const PDF=new TextEncoder().encode('%PDF-1.4\nQA synthetic, no client data.\n%%EOF');
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
function fixture({role='lawyer',session=true,allowed=true,write=true,r2=true}={}){
 let receipt=null;
 const events=[],objects=new Map(),calls=[];
 const db={prepare(sql){return {bind(...params){
  calls.push({sql,params});
  return {
   async first(){
    if(sql.includes('FROM qa_sessions s'))return session?{user_id:U,tenant_id:T,role_key:role}:null;
    if(sql===CASE_ACL_SQL)return allowed&&((params[4]!=='write')||write)?{allowed:1}:null;
    if(sql.includes('SELECT COUNT(*) AS n FROM qa_case_files_r2'))return {n:receipt?1:0};
    if(sql.includes('SELECT file_id,file_name,mime_type,byte_length,sha256,object_key'))return receipt;
    if(sql.includes('SELECT version FROM qa_case_details'))return null;
    if(sql.includes("SELECT 1 AS ok FROM qa_memberships"))return {ok:1};
    if(sql.includes('FROM qa_matter_catalog c LEFT JOIN qa_case_details'))return {title:'Hồ sơ QA mẫu',created_at:NOW,version:null};
    return null;
   },
   async all(){
    if(sql.includes('FROM qa_case_files_r2 WHERE'))return {results:receipt?[receipt]:[]};
    if(sql.includes('FROM qa_case_events WHERE'))return {results:events};
    if(sql.includes('FROM qa_memberships m LEFT JOIN'))return {results:[{user_id:U,label:'QA Lawyer'}]};
    return {results:[]};
   },
   async run(){
    if(sql.includes('INSERT INTO qa_case_files_r2')){
     if(!allowed||!write)return {meta:{changes:0}};
     receipt={file_id:params[3],file_name:params[4],mime_type:params[5],
      byte_length:params[6],sha256:params[7],object_key:params[8],uploaded_at:params[10]};
     events.push({action:'r2_file_uploaded',file_id:receipt.file_id,actor_id:U,occurred_at:NOW});
     return {meta:{changes:1}};
    }
    if(sql.includes('INSERT INTO qa_case_details')||sql.includes('UPDATE qa_case_details')){
     events.push({action:'details_saved',file_id:null,actor_id:U,occurred_at:NOW});
     return {meta:{changes:write?1:0}};
    }
    return {meta:{changes:1}};
   }
  };}};}};
 const R2={
  async put(k,b){objects.set(k,new Uint8Array(b));},
  async get(k){const bytes=objects.get(k);return bytes?{arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}:null;},
  async delete(k){objects.delete(k);}
 };
 return {env:{AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:I,DB:db,...(r2?{CASE_FILES_R2:R2}:{} )},objects,calls,get receipt(){return receipt;}};
}
function req(path,method='GET',body,headers={},cookie=true){
 return new Request(BASE+path,{method,headers:{
  Origin:BASE,'Sec-Fetch-Site':'same-origin',...(cookie?{Cookie:'al_qa_session='+SID}:{}),...headers
 },body});
}
const root='/api/qa/cases/'+M;
test('R116: real detail APIs honor signed-in active MatterACL and optimistic version',async()=>{
 const f=fixture();
 const get=await caseR2Api(req(root),f.env,{now:NOW});
 assert.equal(get.status,200,await get.clone().text());
 const entry=await get.json();
 assert.equal(entry.case.version,0);assert.equal(entry.can_write,true);
 assert.equal(entry.members[0].id,U);
 const body={reference:'QA-2026-001',category:'Hợp đồng',status:'in_progress',priority:'high',
  assignee_user_id:U,client_label:'Bên A giả lập',counterparty_label:'Bên B giả lập',
  summary:'Chỉ dữ liệu thử nghiệm.',deadline:'2026-12-30',expected_version:0};
 const result=await caseR2Api(req(root,'PATCH',JSON.stringify(body),{'Content-Type':'application/json'}),f.env,{now:NOW});
 assert.equal(result.status,200,await result.clone().text());
 assert.equal((await result.json()).version,1);
 assert.ok(f.calls.find(x=>x.sql.includes('INSERT INTO qa_case_details')).sql.includes("effect='deny'"));
 assert.equal((await caseR2Api(req(root,'PATCH',JSON.stringify({...body,extra:'x'}),{'Content-Type':'application/json'}),f.env,{now:NOW})).status,400);
 assert.equal((await caseR2Api(req(root,'PATCH',JSON.stringify({...body,assignee_user_id:'bad'}),{'Content-Type':'application/json'}),f.env,{now:NOW})).status,400);
 assert.equal((await caseR2Api(req(root,'PATCH',JSON.stringify({...body,deadline:'2026-02-30'}),{'Content-Type':'application/json'}),f.env,{now:NOW})).status,400);
});
test('R116: uploads synthetic PDF to private R2, stores SHA-256 and verifies byte-identical download',async()=>{
 const f=fixture();
 const res=await caseR2Api(req(root+'/files','POST',PDF,{
  'Content-Type':'application/pdf','X-File-Name':encodeURIComponent('QA sample.pdf')}),f.env,{now:NOW});
 assert.equal(res.status,201,await res.clone().text());
 const data=await res.json();
 assert.equal(data.bytes,PDF.length);assert.equal(data.sha256,await sha(PDF));
 assert.equal(f.objects.size,1);
 assert.match([...f.objects.keys()][0],new RegExp('^qa-cases/'+I+'/'+T+'/'+M+'/'));
 const list=await caseR2Api(req(root+'/files'),f.env,{now:NOW});
 assert.equal((await list.json()).files.length,1);
 const response=await caseR2Api(req(root+'/files/'+data.id+'/download'),f.env,{now:NOW});
 assert.equal(response.status,200,await response.clone().text());
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),PDF);
 assert.match(response.headers.get('Content-Disposition'),/attachment/);
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 // Tampered R2 bytes can never be downloaded as a successful file.
 f.objects.set([...f.objects.keys()][0],new TextEncoder().encode('corrupt test'));
 assert.equal((await caseR2Api(req(root+'/files/'+data.id+'/download'),f.env,{now:NOW})).status,503);
});
test('R116: deny-overrides, session, CSRF, unsupported types and filenames fail closed',async()=>{
 assert.equal((await caseR2Api(req(root),fixture({session:false}).env,{now:NOW})).status,401);
 assert.equal((await caseR2Api(req(root),fixture({allowed:false}).env,{now:NOW})).status,404);
 assert.equal((await caseR2Api(req(root),fixture({role:'viewer'}).env,{now:NOW})).status,403);
 assert.equal((await caseR2Api(req(root+'/files','POST',PDF,{'Content-Type':'application/pdf','X-File-Name':'bad%2Fname.pdf'}),fixture().env,{now:NOW})).status,400);
 const wrong=req(root+'/files','POST',PDF,{'Content-Type':'application/pdf','X-File-Name':'sample.docx'});
 assert.equal((await caseR2Api(wrong,fixture().env,{now:NOW})).status,415);
 const cross=req(root+'/files','POST',PDF,{'Content-Type':'application/pdf','X-File-Name':'sample.pdf',Origin:'https://bad.invalid'});
 assert.equal((await caseR2Api(cross,fixture().env,{now:NOW})).status,403);
 const oversized=req(root+'/files','POST',PDF,{'Content-Type':'application/pdf','X-File-Name':'sample.pdf','Content-Length':'10485761'});
 assert.equal((await caseR2Api(oversized,fixture().env,{now:NOW})).status,413);
 const denied=fixture({allowed:false});
 const post=await caseR2Api(req(root+'/files','POST',PDF,{'Content-Type':'application/pdf','X-File-Name':'sample.pdf'}),denied.env,{now:NOW});
 assert.equal(post.status,404);assert.equal(denied.objects.size,0);
 assert.match(CASE_ACL_SQL,/effect='deny'/);
});
test('R116: schema and UI statically preserve private R2 and append-only audit',()=>{
 const migration=readFileSync('deployment/cloudflare/migrations/0017_r116_case_details_r2.sql','utf8');
 const ui=readFileSync('web/r0-preview/index.html','utf8');
 const script=readFileSync('web/r0-preview/matters.js','utf8');
 const backend=readFileSync('deployment/cloudflare/src/qa_case_r2.mjs','utf8');
 assert.match(migration,/CREATE TRIGGER IF NOT EXISTS qa_case_file_insert_audit/);
 assert.match(migration,/qa_case_events_no_delete/);
 assert.match(ui,/id="qa-case-detail"/);assert.match(ui,/id="case-r2-upload-form"/);
 assert.match(ui,/class="matter-card qa-document-box" hidden/);
 assert.match(script,/crypto\.subtle\.digest\('SHA-256',bytes\)/);
 assert.match(backend,/CASE_FILES_R2\.put/);
 assert.doesNotMatch(backend,/r2\.dev/);
});
