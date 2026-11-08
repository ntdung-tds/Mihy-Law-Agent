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
 let receipt=null,hidden=false,detailVersion=0;
 const events=[],objects=new Map(),calls=[];
 const db={prepare(sql){return {bind(...params){
  calls.push({sql,params});
  return {
   async first(){
    if(sql.includes('FROM qa_sessions s'))return session?{user_id:U,tenant_id:T,role_key:role}:null;
    if(sql===CASE_ACL_SQL)return allowed&&((params[4]!=='write')||write)?{allowed:1}:null;
    if(sql.includes('SELECT COUNT(*) AS n FROM qa_case_files_r2'))return {n:receipt?1:0};
    if(sql.includes('SELECT f.file_id'))return hidden?null:receipt;
    if(sql.includes('SELECT hidden_by FROM qa_case_file_hides'))return hidden?{hidden_by:U}:null;
    if(sql.includes('SELECT version,updated_by,updated_at FROM qa_case_details'))
     return detailVersion?{version:detailVersion,updated_by:U,updated_at:NOW}:null;
    if(sql.includes('SELECT version FROM qa_case_details'))return detailVersion?{version:detailVersion}:null;
    if(sql.includes("SELECT 1 AS ok FROM qa_memberships"))return {ok:1};
    if(sql.includes('FROM qa_matter_catalog c LEFT JOIN qa_case_details'))return {title:'Hồ sơ QA mẫu',created_at:NOW,version:null};
    return null;
   },
   async all(){
    if(sql.includes('FROM qa_case_files_r2 f WHERE'))return {results:receipt&&!hidden?[receipt]:[]};
    if(sql.includes('FROM qa_case_audit_v2 e LEFT JOIN qa_account_profiles')){
     let records=events.map((e,i)=>({
      event_id:e.event_id||'event-'+i,action:e.action,file_id:e.file_id,
      actor_id:U,actor_name:'QA Lawyer',occurred_at:e.occurred_at||NOW,
      changes_json:JSON.stringify(e.changes||{})
     }));
     if(sql.includes('e.occurred_at < ?')){
      const at=params[3],id=params[5];
      records=records.filter(e=>e.occurred_at<at||
       (e.occurred_at===at&&e.event_id<id));
     }
     return {results:records.slice(0,31)};
    }
    if(sql.includes('FROM qa_case_events WHERE'))return {results:events};
    if(sql.includes('FROM qa_memberships m LEFT JOIN'))return {results:[{user_id:U,label:'QA Lawyer'}]};
    return {results:[]};
   },
   async run(){
    if(sql.includes('INSERT INTO qa_case_audit_v2')){
     events.push({action:'file_downloaded',file_id:params[5],changes:{name:params[7],bytes:params[8]}});
     return {meta:{changes:1}};
    }
    if(sql.includes('INSERT INTO qa_case_file_hides')){
     if(!allowed||!write||!receipt||hidden)return {meta:{changes:0}};
     hidden=true;return {meta:{changes:1}};
    }
    if(sql.includes('INSERT INTO qa_case_files_r2')){
     if(!allowed||!write)return {meta:{changes:0}};
     receipt={file_id:params[3],file_name:params[4],mime_type:params[5],
      byte_length:params[6],sha256:params[7],object_key:params[8],uploaded_at:params[10]};
     events.push({action:'file_uploaded',file_id:receipt.file_id,actor_id:U,occurred_at:NOW,
      changes:{name:receipt.file_name,bytes:receipt.byte_length}});
     // Real D1: the R116 AFTER INSERT audit trigger writes a second row.
     return {meta:{changes:2}};
    }
    if(sql.includes('INSERT INTO qa_case_details')||sql.includes('UPDATE qa_case_details')){
     if(write){detailVersion++;events.push({action:detailVersion===1?'details_created':'details_updated',
      file_id:null,actor_id:U,occurred_at:NOW,changes:{reference:{from:null,to:'QA-2026-001'}}});}
     return {meta:{changes:write?3:0}};
    }
    return {meta:{changes:1}};
   }
  };}};}};
 const R2={
  async put(k,b){objects.set(k,new Uint8Array(b));},
  async get(k){const bytes=objects.get(k);return bytes?{arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}:null;},
  async delete(k){objects.delete(k);}
 };
 return {env:{AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:I,DB:db,...(r2?{CASE_FILES_R2:R2}:{} )},objects,calls,events,get receipt(){return receipt;}};
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
test('R125: read-only users see actor/time, never historical before-after values',async()=>{
 const f=fixture({write:false});
 f.events.push({action:'details_updated',file_id:null,actor_id:U,occurred_at:NOW,
  changes:{summary:{from:'Tài liệu QA cũ',to:'Tài liệu QA mới'}}});
 const response=await caseR2Api(req(root+'/events'),f.env,{now:NOW});
 assert.equal(response.status,200);
 const audit=(await response.json()).events[0];
 assert.equal(audit.actor_name,'QA Lawyer');
 assert.equal(audit.action,'details_updated');
 assert.deepEqual(audit.changes.summary,{from:'[cần quyền sửa]',to:'[cần quyền sửa]'});
 assert.ok(!JSON.stringify(audit).includes('Tài liệu QA cũ'));
 assert.ok(!JSON.stringify(audit).includes('Tài liệu QA mới'));
});
test('R126 audit keyset pagination never truncates history, repeats or bypasses ACL',async()=>{
 const f=fixture({write:false});
 for(let i=0;i<67;i++)f.events.push({
  event_id:'audit-'+String(100-i).padStart(3,'0'),
  action:'details_updated',occurred_at:NOW-Math.floor(i/2),
  changes:{summary:{from:'old sensitive '+i,to:'new sensitive '+i}}
 });
 // Timestamp ties are sorted by descending event ID as in actual SQL.
 f.events.sort((a,b)=>b.occurred_at-a.occurred_at||
  b.event_id.localeCompare(a.event_id));
 const first=await caseR2Api(req(root+'/events'),f.env,{now:NOW});
 assert.equal(first.status,200,await first.clone().text());
 let data=await first.json();
 assert.equal(data.events.length,30);
 assert.ok(data.next_cursor);
 const seen=new Set(data.events.map(e=>e.id));
 for(const e of data.events){
  assert.deepEqual(e.changes.summary,{from:'[cần quyền sửa]',to:'[cần quyền sửa]'});
 }
 let pages=1;
 while(data.next_cursor){
  const cursor=data.next_cursor;
  const path=root+'/events?before_at='+cursor.at+'&before_id='+cursor.id;
  const response=await caseR2Api(req(path),f.env,{now:NOW});
  assert.equal(response.status,200);
  data=await response.json();
  for(const e of data.events){
   assert.equal(seen.has(e.id),false,'duplicate audit event across pages');
   seen.add(e.id);
   assert.deepEqual(e.changes.summary,{from:'[cần quyền sửa]',to:'[cần quyền sửa]'});
  }
  assert.ok(++pages<=4);
 }
 assert.equal(seen.size,67);
 assert.equal(pages,3);
 assert.ok(f.calls.filter(x=>x.sql===CASE_ACL_SQL).length>=pages*2,
  'every page repeats active read and write access checks');
 for(const suffix of [
  '?before_at=1','?before_id=audit-001',
  '?before_at=0&before_id=audit-001',
  '?before_at='+NOW+'&before_id=x%27%3B',
  '?before_at='+NOW+'&before_id=audit-001&before_id=audit-002',
  '?before_at='+NOW+'&before_id=audit-001&tenant_id=elsewhere'
 ]){
  const bad=await caseR2Api(req(root+'/events'+suffix),f.env,{now:NOW});
  assert.equal(bad.status,400,suffix);
 }
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
 const audit=await caseR2Api(req(root+'/events'),f.env,{now:NOW});
 assert.equal(audit.status,200);
 const history=await audit.json();
 assert.equal(history.events[0].action,'file_uploaded',JSON.stringify(history));
 assert.equal(history.events[1].action,'file_downloaded');
 assert.equal(history.events[0].actor_name,'QA Lawyer');
 assert.ok(f.calls.some(c=>c.sql.includes('INSERT INTO qa_case_audit_v2')&&c.params.includes('QA sample.pdf')));
 // Tampered R2 bytes can never be downloaded as a successful file.
 f.objects.set([...f.objects.keys()][0],new TextEncoder().encode('corrupt test'));
 assert.equal((await caseR2Api(req(root+'/files/'+data.id+'/download'),f.env,{now:NOW})).status,503);
});
test('R121: D1 audit-trigger changes=2 is success; repeat/repair reuses receipt without duplicate',async()=>{
 const f=fixture();const path=root+'/files';
 const upload=()=>caseR2Api(req(path,'POST',PDF,{
  'Content-Type':'application/pdf','X-File-Name':encodeURIComponent('QA sample.pdf')}),f.env,{now:NOW});
 const first=await upload();
 assert.equal(first.status,201,await first.clone().text());
 const firstInfo=await first.json();
 assert.equal(f.objects.size,1);
 const key=[...f.objects.keys()][0];
 const repeat=await upload();
 assert.equal(repeat.status,200,await repeat.clone().text());
 const repeatInfo=await repeat.json();
 assert.equal(repeatInfo.id,firstInfo.id);
 assert.equal(repeatInfo.already_saved,true);
 assert.equal(repeatInfo.repaired,false);
 assert.equal(f.objects.size,1);
 assert.equal(f.calls.filter(x=>x.sql.includes('INSERT INTO qa_case_files_r2')).length,1);
 // Reproduce the production QA error: receipt persisted but R2 object got
 // incorrectly deleted after checking D1 meta.changes against the number 1.
 f.objects.delete(key);
 assert.equal(f.objects.size,0);
 const repaired=await upload();
 assert.equal(repaired.status,200,await repaired.clone().text());
 const repairedInfo=await repaired.json();
 assert.equal(repairedInfo.id,firstInfo.id);
 assert.equal(repairedInfo.repaired,true);
 assert.equal(f.objects.size,1);
 assert.equal(f.calls.filter(x=>x.sql.includes('INSERT INTO qa_case_files_r2')).length,1);
 const downloaded=await caseR2Api(req(path+'/'+firstInfo.id+'/download'),f.env,{now:NOW});
 assert.equal(downloaded.status,200,await downloaded.clone().text());
 assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()),PDF);
});
test('R122: soft-hide attachment is ACL-scoped, immutable metadata only; R2 bytes preserved',async()=>{
 const f=fixture();const path=root+'/files';
 const created=await caseR2Api(req(path,'POST',PDF,{
  'Content-Type':'application/pdf','X-File-Name':'QA%20sample.pdf'}),f.env,{now:NOW});
 assert.equal(created.status,201);
 const id=(await created.json()).id;
 assert.equal((await caseR2Api(req(path+'/'+id,'PATCH',JSON.stringify({action:'delete'}),
  {'Content-Type':'application/json'}),f.env,{now:NOW})).status,400);
 assert.equal((await caseR2Api(req(path+'/'+id,'PATCH',JSON.stringify({action:'hide'}),
  {'Content-Type':'application/json',Origin:'https://evil.invalid'}),f.env,{now:NOW})).status,403);
 assert.equal((await caseR2Api(req(path+'/'+id,'PATCH',JSON.stringify({action:'hide'}),
  {'Content-Type':'application/json'}),fixture({allowed:false}).env,{now:NOW})).status,404);
 const res=await caseR2Api(req(path+'/'+id,'PATCH',JSON.stringify({action:'hide'}),
  {'Content-Type':'application/json'}),f.env,{now:NOW});
 assert.equal(res.status,200,await res.clone().text());
 assert.deepEqual(await res.json(),{id,hidden:true,physical_deleted:false});
 assert.equal((await (await caseR2Api(req(path),f.env,{now:NOW})).json()).files.length,0);
 assert.equal((await caseR2Api(req(path+'/'+id+'/download'),f.env,{now:NOW})).status,404);
 assert.equal((await caseR2Api(req(path+'/'+id,'PATCH',JSON.stringify({action:'hide'}),
  {'Content-Type':'application/json'}),f.env,{now:NOW})).status,404);
 assert.equal(f.objects.size,1);
 assert.ok(f.calls.some(x=>x.sql.includes('INSERT INTO qa_case_file_hides')&&x.sql.includes("effect='deny'")));
});
test('R122: exact private D1 migration uses immutable tombstones without DELETE physical',()=>{
 const migration=readFileSync('deployment/cloudflare/migrations/0019_r122_case_file_soft_hide.sql','utf8');
 const html=readFileSync('web/r0-preview/index.html','utf8');
 const js=readFileSync('web/r0-preview/matters.js','utf8');
 assert.match(migration,/qa_case_file_hides_no_update/);
 assert.match(migration,/qa_case_file_hides_no_delete/);
 assert.match(html,/id="case-r2-file" name="case_files" type="file" multiple/);
 assert.match(html,/id="case-selected-files"/);
 assert.match(js,/form\.querySelectorAll\('input,textarea,select'\)/);
 assert.doesNotMatch(js,/form\.querySelectorAll\('input,textarea,select,button'\)/);
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
