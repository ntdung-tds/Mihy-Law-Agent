import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matterApi,MATTER_LIST_SQL} from '../src/matter_workspace.mjs';
import {CASE_DETAIL_FIELDS,validateInitialCaseDetails} from '../src/qa_case_r2.mjs';

const I='11111111-1111-4111-8111-111111111111';
const U='22222222-2222-4222-8222-222222222222';
const T='33333333-3333-4333-8333-333333333333';
const SID='55555555-5555-4555-8555-555555555555';
const BASE='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const NOW=1800000000;
const details={
 reference:'QA-2026-1',category:'Dân sự',status:'in_progress',priority:'normal',
 assignee_user_id:'',client_label:'Khách hàng mẫu',counterparty_label:'Bên B mẫu',
 summary:'Vụ việc QA giả lập, không có dữ liệu khách hàng.',deadline:'2026-12-30'
};
function fixture({session=true,role='lawyer',member=true,batchFails=false}={}){
 const queries=[],batches=[];
 const env={INSTALLATION_ID:I,AI_LAW_CF_MODE:'isolated-qa-only',
  DB:{
   prepare(sql){return{bind(...params){
    const item={sql,params};queries.push(item);
    return{
     async first(){
      if(sql.includes('FROM qa_sessions s'))return session?{user_id:U,tenant_id:T,role_key:role}:null;
      if(sql.includes('SELECT COUNT(*) AS n FROM qa_matter_catalog'))return {n:0};
      if(sql.includes("SELECT 1 AS ok FROM qa_memberships"))return member?{ok:1}:null;
      return null;
     },
     async all(){return {results:[{matter_id:'44444444-4444-4444-8444-444444444444',
      title:'Vụ việc QA đã lưu',created_at:NOW,version:1,can_write:1,
      category:'Lao động',case_status:'open',case_reference:'QA-001'}]};},
     async run(){return {meta:{changes:1}};}
    };
   }};},
   async batch(statements){
    batches.push(statements);
    if(batchFails)throw Error('synthetic D1 transaction rejection');
    return statements.map(()=>({success:true,meta:{changes:1}}));
   }
  }
 };
 return{env,queries,batches};
}
function request(method='POST',body={title:'Hồ sơ QA mẫu',details},origin=BASE){
 return new Request(BASE+'/api/qa/matters',{method,headers:{
  'Content-Type':'application/json','Origin':origin,'Sec-Fetch-Site':'same-origin',
  'Cookie':'al_qa_session='+SID},body:method==='GET'?undefined:JSON.stringify(body)});
}
test('R117: one D1 transaction writes matter+ACL+title+details before R2 upload',async()=>{
 const f=fixture();
 const result=await matterApi(request(),f.env,{now:NOW});
 assert.equal(result.status,201,await result.clone().text());
 const data=await result.json();
 assert.equal(data.details_saved,true);
 assert.equal(data.details_version,1);
 assert.equal(f.batches.length,1);
 assert.equal(f.batches[0].length,6);
 assert.ok(f.queries.some(x=>x.sql.includes('INSERT INTO qa_case_details')));
 const insert=f.queries.find(x=>x.sql.includes('INSERT INTO qa_case_details'));
 assert.equal(insert.params[0],I);assert.equal(insert.params[1],T);
 assert.deepEqual(insert.params.slice(3,12),[
  details.reference,details.category,details.status,details.priority,U,
  details.client_label,details.counterparty_label,details.summary,details.deadline
 ]);
 assert.equal(CASE_DETAIL_FIELDS.length,9);
 assert.ok(validateInitialCaseDetails(details,U));
 assert.equal(validateInitialCaseDetails({...details,status:'invalid'},U),null);
});
test('R117: full form rejects unknown keys, forged assignees, malformed dates and tenant role',async()=>{
 const bads=[
  {title:'Good case',details:{...details,unknown:'bad'}},
  {title:'Good case',details:{...details,deadline:'2026-02-30'}},
  {title:'Good case',details:{...details,summary:'A'.repeat(1601)}},
  {title:'Good case',details:{...details,category:'<script>bad</script>'}},
  {title:'Good case',extra:true,details}
 ];
 for(const body of bads){
  const f=fixture();const r=await matterApi(request('POST',body),f.env,{now:NOW});
  assert.equal(r.status,400,JSON.stringify(body).slice(0,60));
  assert.equal(f.batches.length,0);
 }
 const user=fixture({member:false});
 const r=await matterApi(request('POST',{title:'Good case',details:{...details,assignee_user_id:'99999999-9999-4999-8999-999999999999'}}),user.env,{now:NOW});
 assert.equal(r.status,400);assert.equal(user.batches.length,0);
 assert.equal((await matterApi(request(),fixture({role:'viewer'}).env,{now:NOW})).status,403);
 assert.equal((await matterApi(request(),fixture({session:false}).env,{now:NOW})).status,401);
 assert.equal((await matterApi(request('POST',{title:'Case sample',details},'https://evil.example'),fixture().env,{now:NOW})).status,400);
});
test('R117: failure to commit full D1 batch never falsely reports a saved case',async()=>{
 const f=fixture({batchFails:true});
 const r=await matterApi(request(),f.env,{now:NOW});
 assert.equal(r.status,503);assert.equal(f.batches.length,1);
 const legacy=fixture();
 const old=await matterApi(request('POST',{title:'Legacy name-only QA sample'}),legacy.env,{now:NOW});
 assert.equal(old.status,201);assert.equal((await old.json()).details_saved,false);
 assert.equal(legacy.batches[0].length,5);
});
test('R117: existing real MatterACL list includes category/status without widening access',async()=>{
 const f=fixture();
 const r=await matterApi(request('GET'),f.env,{now:NOW});
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.matters[0].category,'Lao động');
 assert.equal(data.matters[0].case_status,'open');
 assert.equal(data.matters[0].case_reference,'QA-001');
 assert.match(MATTER_LIST_SQL,/LEFT JOIN qa_case_details cd/);
 assert.match(MATTER_LIST_SQL,/effect='deny'/);
 assert.match(MATTER_LIST_SQL,/c\.tenant_id=\?/);
});
test('R117: exactly one complete case form, one submit, one classified saved-list BELOW form',()=>{
 const html=readFileSync('web/r0-preview/index.html','utf8');
 const code=readFileSync('web/r0-preview/matters.js','utf8');
 const site=readFileSync('deployment/cloudflare/qa_site_r116.mjs','utf8');
 assert.equal((html.match(/id="matter-form"/g)||[]).length,1);
 assert.equal((html.match(/id="matter-create"/g)||[]).length,1);
 assert.match(html,/id="qa-case-detail"/);
 assert.match(html,/id="case-r2-file"[^>]*multiple/);
 assert.match(html,/id="matter-category-filter"/);
 assert.ok(html.indexOf('id="matter-list"')>html.indexOf('id="matter-create"'));
 assert.doesNotMatch(html,/<form id="case-detail-form"/);
 assert.doesNotMatch(html,/<form id="case-r2-upload-form"/);
 assert.match(html,/class="matter-card qa-document-box" hidden/);
 assert.match(code,/details_saved!==true/);
 assert.match(code,/Hãy kiểm tra danh sách tệp trước khi thử lại/);
 assert.match(code,/categoryFilter.*addEventListener\('change',show\)/);
 assert.ok(site.includes("h.set('X-File-Name'"));
});
