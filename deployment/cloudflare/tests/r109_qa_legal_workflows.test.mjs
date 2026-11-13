import test from 'node:test';
import assert from 'node:assert/strict';
import {legalApi,LEGAL_MATTER_ACCESS_SQL,LEGAL_QUOTA_SQL,sourceReferencesExist} from '../src/qa_legal_workflows.mjs';

const I='11111111-1111-4111-8111-111111111111';
const U='22222222-2222-4222-8222-222222222222';
const T='33333333-3333-4333-8333-333333333333';
const M='44444444-4444-4444-8444-444444444444';
const SID='55555555-5555-4555-8555-555555555555';
const BASE='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const NOW=1800000000;
const SOURCE='Điều 1. Bên cung cấp giao hàng ngày 15 tháng 9 và bên nhận thanh toán 10 triệu đồng sau nghiệm thu.';
const SOURCE2='Điều 1. Bên cung cấp giao hàng ngày 30 tháng 9; bên nhận thanh toán 20 triệu đồng sau nghiệm thu.';
function fixture({session=true,acl=true,ai=true,quota=true,role='lawyer'}={}){
 const calls=[],providerCalls=[];
 const env={
  INSTALLATION_ID:I,AI_LAW_CF_MODE:'isolated-qa-only',
  DB:{prepare(sql){return {bind(...params){calls.push({sql,params});return{
   async first(){
    if(sql.includes('FROM qa_sessions s'))return session?{user_id:U,tenant_id:T,role_key:role}:null;
    if(sql===LEGAL_MATTER_ACCESS_SQL)return acl?{'1':1}:null;
    return null;
   },
   async run(){return {meta:{changes:quota?1:0}};}
  };}};}},
  ...(ai?{AI:{async run(model,args){providerCalls.push({model,args});return {response:'QA: Điều 1 quy định thời hạn và mức thanh toán. Luật sư cần kiểm duyệt.'};}}}:{})
 };
 return {env,calls,providerCalls};
}
function request({
 uc='UC04',source=SOURCE,source2='',question='',language='vi',consent=true,
 matter_id=M,method='POST',origin=BASE,bodyOverride,session=true
}={}){
 const headers={'Content-Type':'application/json',Origin:origin,'Sec-Fetch-Site':'same-origin'};
 if(session)headers.Cookie='al_qa_session='+SID;
 const body=bodyOverride??{uc,matter_id,source_text:source,source_text_2:source2,
  question,language,synthetic_consent:consent};
 return new Request(BASE+'/api/qa/legal/run',{method,headers,
  body:method==='POST'?JSON.stringify(body):undefined});
}
test('R109 creates a real, bounded AI review draft for UC03/04/07 and no input stored in D1',async()=>{
 for(const uc of ['UC03','UC04','UC07']){
  const f=fixture();const res=await legalApi(request({uc}),f.env,{now:NOW});
  assert.equal(res.status,200,await res.clone().text());
  const d=await res.json();
  assert.equal(d.uc,uc);assert.equal(d.mode,'ai_draft_not_verified');
  assert.equal(d.review_required,true);
  assert.match(d.source_hash,/^[0-9a-f]{64}$/);
  assert.equal(d.source_anchors[0].id,'A1');
  assert.equal(d.answer,'QA: Điều 1 quy định thời hạn và mức thanh toán. Luật sư cần kiểm duyệt.');
  assert.equal(res.headers.get('Cache-Control'),'no-store');
  assert.equal(f.providerCalls.length,1);
  assert.equal(f.providerCalls[0].model,'@cf/meta/llama-3.1-8b-instruct');
  assert.ok(f.providerCalls[0].args.messages[1].content.includes('['+'A1'+']'));
  assert.deepEqual(f.calls.map(c=>c.sql===LEGAL_QUOTA_SQL),[false,false,true]);
  assert.ok(f.calls.every(c=>c.params.every(v=>v!==SOURCE)),
   'Source bytes must never be persisted or passed to the database');
 }
});
test('R109 supports other source-based drafts and honest on-device-source-only case law search',async()=>{
 for(const uc of ['UC01','UC02','UC05','UC06','UC08','UC09']){
  const f=fixture();
  const r=await legalApi(request({uc,source2:['UC06','UC08'].includes(uc)?SOURCE2:'',
    question:uc==='UC09'?'Khi nào bên giao hàng?':''}),f.env,{now:NOW});
  assert.equal(r.status,200,uc+': '+await r.clone().text());
  assert.equal((await r.json()).review_required,true);
 }
 for(const uc of ['UC10','UC11']){
  const f=fixture({ai:false});
  const r=await legalApi(request({uc,question:'giao hàng tháng 9'}),f.env,{now:NOW});
  assert.equal(r.status,200,uc);
  const d=await r.json();
  assert.equal(d.mode,'local_example_only');
  assert.match(d.answer,/NGUỒN MẪU/);
  assert.ok(d.findings.length>0);
  assert.equal(f.providerCalls.length,0);
  assert.equal(f.calls.some(c=>c.sql===LEGAL_QUOTA_SQL),false,'local search cannot spend AI quota');
 }
});
test('R109 fails closed for cross-origin, absent session, revoked matter ACL and unsupported role',async()=>{
 assert.equal((await legalApi(request({session:false}),fixture({session:false}).env,{now:NOW})).status,401);
 assert.equal((await legalApi(request({origin:'https://evil.invalid'}),fixture().env,{now:NOW})).status,400);
 assert.equal((await legalApi(request(),fixture({acl:false}).env,{now:NOW})).status,404);
 assert.equal((await legalApi(request(),fixture({role:'viewer'}).env,{now:NOW})).status,403);
 assert.equal((await legalApi(request({method:'GET'}),fixture().env,{now:NOW})).status,405);
 assert.match(LEGAL_MATTER_ACCESS_SQL,/effect='deny'/);
 assert.match(LEGAL_MATTER_ACCESS_SQL,/a\.acl_version=m\.acl_version/);
});
test('R109 rejects fabricated legal corpus, unconsented private data, oversized sources and invalid fields',async()=>{
 const invalid=[
  {uc:'UC12'},{consent:false},{source:'X'},{source:'A'.repeat(5001)},
  {uc:'UC06',source2:''},{uc:'UC08',source2:''},
  {uc:'UC09',question:''},{uc:'UC10',question:''},{uc:'UC11',question:''},
  {bodyOverride:{uc:'UC04',matter_id:M,source_text:SOURCE,source_text_2:'',
   question:'',language:'vi',synthetic_consent:true,arbitrary_tenant:T}}
 ];
 for(const x of invalid){
  const f=fixture();const r=await legalApi(request(x),f.env,{now:NOW});
  assert.equal(r.status,400,JSON.stringify(x).slice(0,100));
  assert.equal(f.providerCalls.length,0,'bad request cannot spend provider usage');
 }
});
test('R109 provider outage, quota exhaustion and malicious model response never become false success',async()=>{
 const noAI=fixture({ai:false});
 const down=await legalApi(request(),noAI.env,{now:NOW});
 assert.equal(down.status,503);
 assert.equal(noAI.calls.some(c=>c.sql===LEGAL_QUOTA_SQL),false);
 const limited=fixture({quota:false});
 assert.equal((await legalApi(request(),limited.env,{now:NOW})).status,429);
 assert.equal(limited.providerCalls.length,0);
 const broken=fixture();
 broken.env.AI.run=async()=>({response:'\u0000'});
 assert.equal((await legalApi(request(),broken.env,{now:NOW})).status,503);
 const failed=fixture();
 failed.env.AI.run=async()=>{throw Error('provider secret diagnostic');};
 const res=await legalApi(request(),failed.env,{now:NOW});
 assert.equal(res.status,503);
 assert.doesNotMatch(await res.text(),/secret diagnostic/);
});

test('R110 never displays a model-cited source ID that does not exist',async()=>{
 assert.equal(sourceReferencesExist('Theo [A1] và [B1].',[{id:'A1'},{id:'B1'}]),true);
 assert.equal(sourceReferencesExist('Từ [A99].',[{id:'A1'}]),false);
 assert.equal(sourceReferencesExist('Từ [A99999].',[{id:'A1'}]),false);
 const fake=fixture();
 fake.env.AI.run=async()=>({response:'Theo đoạn [A99], có một nghĩa vụ chưa có trong tài liệu.'});
 const rejected=await legalApi(request({uc:'UC04'}),fake.env,{now:NOW});
 assert.equal(rejected.status,503);
 assert.doesNotMatch(await rejected.text(),/A99|nghĩa vụ/);
 const valid=fixture();
 valid.env.AI.run=async()=>({response:'Đoạn [A1] ghi thời hạn giao hàng; luật sư cần rà soát.'});
 const accepted=await legalApi(request({uc:'UC04'}),valid.env,{now:NOW});
 assert.equal(accepted.status,200);
 assert.match((await accepted.json()).answer,/\[A1\]/);
});
test('R110 untrusted streaming request without Content-Length has a real 36KB bound',async()=>{
 const payload=JSON.stringify({
  uc:'UC04',matter_id:M,source_text:'X'.repeat(40000),source_text_2:'',
  question:'',language:'vi',synthetic_consent:true
 });
 const bytes=new TextEncoder().encode(payload);
 const body=new ReadableStream({start(controller){
  controller.enqueue(bytes.slice(0,20000));
  controller.enqueue(bytes.slice(20000));
  controller.close();
 }});
 const headers={Origin:BASE,'Sec-Fetch-Site':'same-origin',
  'Content-Type':'application/json',Cookie:'al_qa_session='+SID};
 const streamed=new Request(BASE+'/api/qa/legal/run',{
  method:'POST',headers,body,duplex:'half'
 });
 assert.equal(streamed.headers.get('Content-Length'),null);
 const f=fixture();
 const denied=await legalApi(streamed,f.env,{now:NOW});
 assert.equal(denied.status,413);
 assert.equal(f.providerCalls.length,0);
 assert.equal(f.calls.some(c=>c.sql===LEGAL_QUOTA_SQL),false);
});

test('R111 aborted or errored request body fails closed without invoking AI or quota',async()=>{
 const headers={Origin:BASE,'Sec-Fetch-Site':'same-origin',
  'Content-Type':'application/json',Cookie:'al_qa_session='+SID};
 const body=new ReadableStream({start(controller){
  controller.error(new Error('sensitive upstream transport detail'));
 }});
 const req=new Request(BASE+'/api/qa/legal/run',{method:'POST',headers,body,duplex:'half'});
 const f=fixture();
 const response=await legalApi(req,f.env,{now:NOW});
 assert.equal(response.status,400);
 assert.doesNotMatch(await response.text(),/sensitive upstream transport detail/);
 assert.equal(f.providerCalls.length,0);
 assert.equal(f.calls.some(c=>c.sql===LEGAL_QUOTA_SQL),false);
});

test('R112 malformed UTF-8 JSON bytes fail closed before MatterACL, quota or AI',async()=>{
 const valid=JSON.stringify({uc:'UC04',matter_id:M,source_text:SOURCE,
  source_text_2:'',question:'',language:'vi',synthetic_consent:true});
 const bytes=new TextEncoder().encode(valid);
 const marker=new TextEncoder().encode(SOURCE);
 const pos=bytes.findIndex((_,i)=>i+marker.length<=bytes.length&&
  marker.every((b,j)=>bytes[i+j]===b));
 assert.ok(pos>=0,'fixture must contain source text');
 bytes[pos]=0xff; // Invalid UTF-8 lead byte within a JSON string
 const headers={Origin:BASE,'Sec-Fetch-Site':'same-origin',
  'Content-Type':'application/json',Cookie:'al_qa_session='+SID};
 const req=new Request(BASE+'/api/qa/legal/run',{
  method:'POST',headers,body:bytes
 });
 const f=fixture();
 const response=await legalApi(req,f.env,{now:NOW});
 assert.equal(response.status,400);
 assert.equal(f.providerCalls.length,0);
 assert.equal(f.calls.some(c=>c.sql===LEGAL_MATTER_ACCESS_SQL),false);
 assert.equal(f.calls.some(c=>c.sql===LEGAL_QUOTA_SQL),false);
 assert.doesNotMatch(await response.text(),/\uFFFD|source_text/);
});

test('R113 tenant/MatterACL and role denials never charge quota or invoke model',async()=>{
 for(const scenario of [
  {name:'missing session',request:{session:false},fixture:{session:false},status:401},
  {name:'revoked or foreign matter',request:{},fixture:{acl:false},status:404},
  {name:'read-only role',request:{},fixture:{role:'viewer'},status:403}
 ]){
  const f=fixture(scenario.fixture);
  const res=await legalApi(request(scenario.request),f.env,{now:NOW});
  assert.equal(res.status,scenario.status,scenario.name);
  assert.equal(f.providerCalls.length,0,scenario.name+' must not call AI');
  assert.equal(f.calls.some(c=>c.sql===LEGAL_QUOTA_SQL),false,
   scenario.name+' must not consume quota');
 }
});

test('R117 local-only UC10/UC11 still enforce session, role and MatterACL before retrieval',async()=>{
 for(const uc of ['UC10','UC11']){
  for(const scenario of [
   {name:'missing session',request:{session:false},fixture:{session:false},status:401},
   {name:'viewer role',request:{},fixture:{role:'viewer'},status:403},
   {name:'revoked or foreign MatterACL',request:{},fixture:{acl:false},status:404}
  ]){
   const f=fixture({...scenario.fixture,ai:false});
   const res=await legalApi(request({uc,question:'giao hàng tháng 9',...scenario.request}),f.env,{now:NOW});
   assert.equal(res.status,scenario.status,uc+' '+scenario.name);
   assert.equal(f.providerCalls.length,0,uc+' '+scenario.name+' must not invoke AI');
   assert.equal(f.calls.some(c=>c.sql===LEGAL_QUOTA_SQL),false,
    uc+' '+scenario.name+' must not charge AI quota');
   assert.equal((await res.json()).findings,undefined,
    uc+' '+scenario.name+' must not leak source search findings');
  }
 }
});


test('R118 UC10/UC11 reject cross-origin requests before ACL, search or quota',async()=>{
 for(const uc of ['UC10','UC11']){
  const f=fixture({ai:false});
  const res=await legalApi(request({
   uc,question:'giao hàng tháng 9',origin:'https://attacker.invalid',
   source:'PRIVATE_SYNTHETIC_MARKER_71829 '+SOURCE
  }),f.env,{now:NOW});
  assert.equal(res.status,400,uc+' cross-origin must fail closed');
  const body=await res.text();
  assert.doesNotMatch(body,/PRIVATE_SYNTHETIC_MARKER_71829|giao hàng ngày 15|findings/,
   uc+' must not expose search results or source text');
  assert.equal(f.calls.some(c=>c.sql===LEGAL_MATTER_ACCESS_SQL),false,
   uc+' must not query MatterACL for invalid origin');
  assert.equal(f.calls.some(c=>c.sql===LEGAL_QUOTA_SQL),false,
   uc+' must not charge quota');
  assert.equal(f.providerCalls.length,0,uc+' must not invoke AI');
 }
});

test('R139 evidence flags are returned for AI tasks and local UC10/11 across all 11 UC',async()=>{
 for(const uc of ['UC01','UC02','UC03','UC04','UC05','UC06','UC07','UC08','UC09','UC10','UC11']){
  const local=['UC10','UC11'].includes(uc);
  const f=fixture({ai:!local});
  const response=await legalApi(request({
   uc,
   source2:['UC06','UC08'].includes(uc)?SOURCE2:'',
   question:['UC09','UC10','UC11'].includes(uc)?'giao hàng tháng 9':''
  }),f.env,{now:NOW});
  assert.equal(response.status,200,uc+': '+await response.clone().text());
  const payload=await response.json();
  const evidence=payload.evidence_diagnostics;
  assert.ok(evidence,'must not silently omit review diagnostics for '+uc);
  assert.equal(evidence.legal_verification,'not_performed');
  assert.equal(evidence.human_review_required,true);
  assert.ok(Array.isArray(evidence.flags));
  assert.ok(Array.isArray(evidence.citations));
  if(local){
    assert.equal(evidence.reference_coverage,'local_sample_only_not_official_corpus');
    assert.equal(f.providerCalls.length,0);
  }else if(['UC06','UC08'].includes(uc)){
    assert.ok(evidence.flags.includes('SOURCE_A_CITATION_MISSING'));
    assert.ok(evidence.flags.includes('SOURCE_B_CITATION_MISSING'));
  }else if(['UC03','UC07'].includes(uc)){
    assert.equal(evidence.reference_coverage,'not_required_for_transform');
    assert.ok(evidence.flags.includes('SOURCE_NUMBER_NOT_PRESERVED'));
  }else{
    assert.ok(evidence.flags.includes('SOURCE_A_CITATION_MISSING'));
  }
 }
});

test('R139 model output truncated at token budget fails closed without disclosing partial result',async()=>{
 const f=fixture();
 f.env.AI.run=async()=>({response:'SENSITIVE_PARTIAL_QA_DRAFT_2026',finish_reason:'length'});
 const result=await legalApi(request({uc:'UC04'}),f.env,{now:NOW});
 assert.equal(result.status,503);
 const raw=await result.text();
 assert.doesNotMatch(raw,/SENSITIVE_PARTIAL_QA_DRAFT_2026/);
});

test('R141 UC04 two-paragraph source reports exact uncited anchor IDs for review',async()=>{
 const f=fixture();
 f.env.AI.run=async()=>({response:'Điều 1 ghi thời hạn giao hàng [A1].'});
 const response=await legalApi(request({
  uc:'UC04',source:SOURCE+'\n\n'+SOURCE2
 }),f.env,{now:NOW});
 assert.equal(response.status,200,await response.clone().text());
 const data=await response.json();
 assert.deepEqual(data.evidence_diagnostics.segment_coverage.uncited_source_ids,['A2']);
 assert.equal(data.evidence_diagnostics.segment_coverage.total_source_segments,2);
 assert.equal(data.evidence_diagnostics.segment_coverage.explicitly_cited_segments,1);
 assert.ok(data.evidence_diagnostics.flags.includes('SOURCE_COVERAGE_INCOMPLETE'));
 assert.equal(JSON.stringify(data.evidence_diagnostics).includes('thanh toán'),false);
});

test('R142 UC03 API returns bilingual review with exact source pairing, not an approved translation',async()=>{
 const original=SOURCE+'\n\n'+SOURCE2;
 const labeled=fixture();
 labeled.env.AI.run=async()=>({
  response:'[A1] Article 1. Delivery within 15 days.\n[A2] Article 2. Payment within 30 days.'
 });
 const response=await legalApi(request({uc:'UC03',source:original,language:'en'}),labeled.env,{now:NOW});
 assert.equal(response.status,200);
 const data=await response.json();
 const review=data.translation_review;
 assert.equal(data.uc,'UC03');
 assert.equal(review.mode,'qa_anchor_pairing_not_verified');
 assert.equal(review.total_segments,2);
 assert.equal(review.paired_segments,2);
 assert.deepEqual(review.flags,[]);
 assert.deepEqual(review.rows.map(x=>x.source_id),['A1','A2']);
 assert.deepEqual(review.rows.map(x=>x.status),['paired','paired']);
 assert.match(review.rows[0].source_text,/giao hàng ngày 15/);
 assert.match(review.rows[0].draft_text,/Delivery within/);
 assert.equal(review.legal_verification,'not_performed');
 assert.equal(review.original_formatting_preserved,false);
 assert.equal(review.human_review_required,true);
 assert.equal(response.headers.get('Cache-Control'),'no-store');

 const unlabelled=fixture();
 unlabelled.env.AI.run=async()=>({response:'Unlabelled model translation must not be aligned.'});
 const incomplete=await legalApi(request({uc:'UC03',source:original,language:'en'}),unlabelled.env,{now:NOW});
 assert.equal(incomplete.status,200);
 const bad=await incomplete.json();
 assert.equal(bad.translation_review.paired_segments,0);
 assert.deepEqual(bad.translation_review.missing_source_ids,['A1','A2']);
 assert.ok(bad.translation_review.flags.includes('TRANSLATION_SEGMENTS_MISSING'));
 assert.equal(bad.translation_review.rows.every(x=>!x.draft_text),true);

 const denied=await legalApi(request({uc:'UC03',source:original}),fixture({acl:false}).env,{now:NOW});
 assert.equal(denied.status,404);
 assert.equal((await denied.json()).translation_review,undefined);
});

test('R144 UC07 real API returns scoped paragraph-level grammar review and numerical risks',async()=>{
 const source='Điều 1. Bên A giao 10 bộ hợp đồng vào ngày 15 tháng 9 năm 2026.'+
  '\n\n'+'Điều 2. Bên B thanh toán 20 triệu đồng trong vòng 30 ngày kể từ nghiệm thu.';
 const f=fixture();
 f.env.AI.run=async()=>({response:
  '[A1] Điều 1. Bên A giao 20 bộ hợp đồng vào ngày 15 tháng 9 năm 2026.\n'+
  '[A2] Điều 2. Bên B thanh toán 10 triệu đồng trong vòng 30 ngày kể từ nghiệm thu.'});
 const response=await legalApi(request({uc:'UC07',source}),f.env,{now:NOW});
 assert.equal(response.status,200,await response.clone().text());
 const payload=await response.json();
 const review=payload.correction_review;
 assert.equal(review.mode,'qa_source_vs_suggested_grammar_not_verified');
 assert.equal(review.total_segments,2);
 assert.equal(review.paired_segments,2);
 assert.equal(review.numeric_risk_segments,2,'swaps must be identified within individual paragraphs');
 assert.ok(review.flags.includes('GRAMMAR_PARAGRAPH_NUMBERS_CHANGED'));
 assert.equal(review.rows[0].status,'changed');
 assert.equal(review.rows[0].numeric_check,'literal_numeric_change_requires_review');
 assert.match(review.rows[0].source_text,/giao 10 bộ/);
 assert.match(review.rows[0].proposed_text,/giao 20 bộ/);
 assert.equal(review.changes_applied_to_document,false);
 assert.equal(review.legal_verification,'not_performed');
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.equal(f.providerCalls.length,0,'a stubbed fake output is used for this test');
 assert.ok(f.calls.every(c=>c.params.every(v=>v!==source)),'no source copied to D1');

 const fDenied=fixture({acl:false});
 const denied=await legalApi(request({uc:'UC07',source}),fDenied.env,{now:NOW});
 assert.equal(denied.status,404);
 assert.equal((await denied.json()).correction_review,undefined);
 assert.equal(fDenied.calls.some(c=>c.sql===LEGAL_QUOTA_SQL),false);
});

test('R144 UC07 does not invent paragraph mapping when provider omits labels',async()=>{
 const f=fixture();
 f.env.AI.run=async()=>({response:'Đây là bản sửa không có mã nguồn.'});
 const response=await legalApi(request({uc:'UC07',source:SOURCE}),f.env,{now:NOW});
 assert.equal(response.status,200);
 const review=(await response.json()).correction_review;
 assert.equal(review.paired_segments,0);
 assert.deepEqual(review.missing_source_ids,['A1']);
 assert.deepEqual(review.flags,['GRAMMAR_PARAGRAPHS_MISSING','GRAMMAR_UNSTRUCTURED_CONTENT']);
 assert.equal(review.rows[0].proposed_text,'');
});

test('R145 UC02 authorized API returns source-matched contract clause comments, not verified law',async()=>{
 const source=SOURCE+'\n\n'+SOURCE2;
 const f=fixture();
 f.env.AI.run=async()=>({response:
  '[A1]\nTRICH: Bên cung cấp giao hàng ngày 15 tháng 9\n'+
  'NHAN_XET: Cần làm rõ cách xác định thời hạn giao hàng.\n'+
  'CAN_XAC_MINH: Ngày giao hàng được xác nhận như thế nào?\n'+
  '[A2]\nTRICH: Bên cung cấp giao hàng ngày 30 tháng 9\n'+
  'NHAN_XET: Cần kiểm tra điều kiện bàn giao chứng từ.\n'+
  'CAN_XAC_MINH: Có biên bản nghiệm thu chưa?'});
 const response=await legalApi(request({uc:'UC02',source}),f.env,{now:NOW});
 assert.equal(response.status,200,await response.clone().text());
 const payload=await response.json();
 const review=payload.contract_review;
 assert.equal(review.mode,'qa_literal_quote_clause_review_not_verified');
 assert.equal(review.total_segments,2);
 assert.equal(review.literal_quote_matched_segments,2);
 assert.deepEqual(review.flags,[]);
 assert.deepEqual(review.rows.map(row=>row.source_id),['A1','A2']);
 assert.equal(review.rows[0].status,'quote_matched_not_legally_verified');
 assert.match(review.rows[0].source_text,/giao hàng ngày 15/);
 assert.match(review.rows[1].source_text,/giao hàng ngày 30/);
 assert.equal(review.semantic_claims_verified,false);
 assert.equal(review.legal_verification,'not_performed');
 assert.equal(review.human_review_required,true);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.ok(f.calls.every(call=>call.params.every(value=>value!==source)),
  'the source or model notes must not be stored in D1');
});

test('R145 UC02 flags fabricated cross-clause quote and blocks unauthorized contract access',async()=>{
 const source=SOURCE+'\n\n'+SOURCE2;
 const f=fixture();
 f.env.AI.run=async()=>({response:
  '[A1]\nTRICH: Bên cung cấp giao hàng ngày 30 tháng 9\n'+
  'NHAN_XET: Lời trích đã bị chuyển nhầm từ đoạn nguồn khác.\n'+
  'CAN_XAC_MINH: Có xác định đúng điều khoản không?\n'+
  '[A2]\nTRICH: Bên cung cấp giao hàng ngày 30 tháng 9\n'+
  'NHAN_XET: Luật sư cần thẩm tra thời điểm bàn giao.\n'+
  'CAN_XAC_MINH: Bằng chứng giao hàng nằm ở đâu?'});
 const response=await legalApi(request({uc:'UC02',source}),f.env,{now:NOW});
 assert.equal(response.status,200);
 const review=(await response.json()).contract_review;
 assert.deepEqual(review.unmatched_quote_source_ids,['A1']);
 assert.equal(review.rows[0].literal_source_quote_matched,false);
 assert.ok(review.flags.includes('CONTRACT_QUOTES_NOT_IN_SOURCE'));
 const denied=fixture({acl:false});
 const error=await legalApi(request({uc:'UC02',source}),denied.env,{now:NOW});
 assert.equal(error.status,404);
 assert.equal((await error.json()).contract_review,undefined);
 assert.equal(denied.calls.some(call=>call.sql===LEGAL_QUOTA_SQL),false);
 assert.equal(denied.providerCalls.length,0);
});

test('R146 UC01 authorized API returns source-anchored unapproved draft clauses',async()=>{
 const source=SOURCE+'\n\n'+SOURCE2;
 const f=fixture();
 f.env.AI.run=async()=>({response:
  '[A1]\nCAN_CU: Bên cung cấp giao hàng ngày 15 tháng 9\n'+
  'DU_THAO: Bên cung cấp giao hàng ngày 15 tháng 9.\n'+
  'CAN_XAC_MINH: Ngày giao hàng đã được thống nhất chưa?\n'+
  '[A2]\nCAN_CU: Bên cung cấp giao hàng ngày 30 tháng 9\n'+
  'DU_THAO: Bên cung cấp giao hàng ngày 30 tháng 9.\n'+
  'CAN_XAC_MINH: Có cần xác nhận lịch giao bằng văn bản không?'});
 const response=await legalApi(request({uc:'UC01',source}),f.env,{now:NOW});
 assert.equal(response.status,200,await response.clone().text());
 const data=await response.json(),review=data.drafting_review;
 assert.equal(review.mode,'qa_source_to_proposed_clause_not_verified');
 assert.equal(review.total_segments,2);
 assert.equal(review.matched_quote_segments,2);
 assert.deepEqual(review.numeric_warning_source_ids,[]);
 assert.deepEqual(review.flags,[]);
 assert.equal(review.rows[0].status,'draft_for_human_review');
 assert.equal(review.rows[1].status,'draft_for_human_review');
 assert.match(review.rows[1].source_text,/30 tháng 9/);
 assert.match(review.rows[0].draft_clause,/15 tháng 9/);
 assert.equal(review.substantive_terms_verified,false);
 assert.equal(review.legal_verification,'not_performed');
 assert.equal(review.changes_applied_to_document,false);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.ok(f.calls.every(call=>call.params.every(v=>v!==source)),
  'source text is not persisted to D1');
});

test('R146 UC01 flags invented draft numeric terms and denies revoked MatterACL before AI',async()=>{
 const f=fixture();
 f.env.AI.run=async()=>({response:
  '[A1]\nCAN_CU: Bên cung cấp giao hàng ngày 15 tháng 9\n'+
  'DU_THAO: Bên cung cấp sẽ giao hàng trong vòng 45 ngày.\n'+
  'CAN_XAC_MINH: Các bên đã thống nhất lịch giao chưa?'});
 const accepted=await legalApi(request({uc:'UC01'}),f.env,{now:NOW});
 assert.equal(accepted.status,200,await accepted.clone().text());
 const review=(await accepted.json()).drafting_review;
 assert.deepEqual(review.numeric_warning_source_ids,['A1']);
 assert.equal(review.rows[0].number_check,'draft_has_number_absent_from_source');
 assert.ok(review.flags.includes('DRAFT_NUMBER_NOT_IN_SOURCE'));

 const denied=fixture({acl:false});
 const res=await legalApi(request({uc:'UC01'}),denied.env,{now:NOW});
 assert.equal(res.status,404);
 assert.equal((await res.json()).drafting_review,undefined);
 assert.equal(denied.calls.some(x=>x.sql===LEGAL_QUOTA_SQL),false);
 assert.equal(denied.providerCalls.length,0);
});

test('R148 F08 source-bounded extraction through real authorized QA API',async()=>{
 const source=SOURCE+'\n\n'+SOURCE2;
 const fixtureGood=fixture();
 fixtureGood.env.AI.run=async()=>({response:
  '[A1]\nLOAI: THOI_HAN\nTRICH: Bên cung cấp giao hàng ngày 15 tháng 9\nGIA_TRI: 15 tháng 9\n'+
  '[A2]\nLOAI: THOI_HAN\nTRICH: Bên cung cấp giao hàng ngày 30 tháng 9\nGIA_TRI: 30 tháng 9'});
 const resp=await legalApi(request({uc:'F08',source}),fixtureGood.env,{now:NOW});
 assert.equal(resp.status,200,await resp.clone().text());
 const data=await resp.json();
 assert.equal(data.uc,'F08');
 assert.equal(data.mode,'ai_draft_not_verified');
 const review=data.extraction_review;
 assert.equal(review.mode,'qa_literal_extraction_not_verified');
 assert.equal(review.total_source_segments,2);
 assert.equal(review.verified_literal_items,2);
 assert.deepEqual(review.flags,[]);
 assert.deepEqual(review.rows.map(r=>r.source_id),['A1','A2']);
 assert.equal(review.rows[0].value,'15 tháng 9');
 assert.equal(review.rows[1].value,'30 tháng 9');
 assert.equal(review.extraction_completeness_verified,false);
 assert.equal(review.legal_verification,'not_performed');
 assert.equal(review.changes_applied_to_document,false);
 assert.equal(resp.headers.get('Cache-Control'),'no-store');
 assert.ok(fixtureGood.calls.every(call=>call.params.every(p=>p!==source)),
  'never write a business source to D1');
});

test('R148 F08 catches cross-source fabricated monetary facts and denies revoked MatterACL before AI',async()=>{
 const fake=fixture();
 fake.env.AI.run=async()=>({response:
  '[A1]\nLOAI: SO_TIEN\nTRICH: bên nhận thanh toán 10 triệu đồng\nGIA_TRI: 99 triệu đồng'});
 const res=await legalApi(request({uc:'F08'}),fake.env,{now:NOW});
 assert.equal(res.status,200);
 const review=(await res.json()).extraction_review;
 assert.deepEqual(review.mismatch_source_ids,['A1']);
 assert.ok(review.flags.includes('EXTRACTION_SOURCE_MISMATCH'));
 assert.equal(review.rows[0].literal_quote_matched,true);
 assert.equal(review.rows[0].literal_value_matched,false);
 const denied=fixture({acl:false});
 const r=await legalApi(request({uc:'F08'}),denied.env,{now:NOW});
 assert.equal(r.status,404);
 assert.equal((await r.json()).extraction_review,undefined);
 assert.equal(denied.calls.some(c=>c.sql===LEGAL_QUOTA_SQL),false);
 assert.equal(denied.providerCalls.length,0);
});

test('R152 F09 authorized source Q&A returns exact quote review without claiming legal proof',async()=>{
 const f=fixture();
 const question='Bên cung cấp giao hàng vào ngày nào?';
 f.env.AI.run=async()=>({response:
  'TRANG_THAI: CO_CAN_CU\n'+
  'TRA_LOI: Nguồn mẫu nói bên cung cấp giao hàng ngày 15 tháng 9.\n'+
  'CAN_XAC_MINH: Ngày giao hàng đã được các bên xác nhận chưa?\n'+
  '[A1]\nTRICH: Bên cung cấp giao hàng ngày 15 tháng 9'});
 const res=await legalApi(request({uc:'UC09',question}),f.env,{now:NOW});
 assert.equal(res.status,200,await res.clone().text());
 const payload=await res.json();
 const review=payload.question_review;
 assert.equal(review.mode,'qa_matter_question_source_quotes_not_verified');
 assert.equal(review.question,question);
 assert.equal(review.references.length,1);
 assert.equal(review.references[0].source_id,'A1');
 assert.equal(review.references[0].literal_match,true);
 assert.equal(review.reference_integrity,'literal_quotes_matched_not_semantic_proof');
 assert.deepEqual(review.flags,[]);
 assert.equal(review.answer_semantics_verified,false);
 assert.equal(review.source_effective_date_verified,false);
 assert.equal(review.human_review_required,true);
 assert.equal(res.headers.get('Cache-Control'),'no-store');
 assert.ok(f.calls.every(c=>c.params.every(p=>p!==SOURCE)),
  'legal source never persisted to D1');
});

test('R152 F09 fabricated cross-paragraph quote is flagged and MatterACL denial never runs model',async()=>{
 const f=fixture();
 f.env.AI.run=async()=>({response:
  'TRANG_THAI: CO_CAN_CU\n'+
  'TRA_LOI: Bên cung cấp giao hàng vào ngày 30 tháng 9.\n'+
  'CAN_XAC_MINH: Có biên bản giao hàng kèm chữ ký không?\n'+
  '[A1]\nTRICH: Bên cung cấp giao hàng ngày 30 tháng 9'});
 const res=await legalApi(request({uc:'UC09',source:SOURCE+'\n\n'+SOURCE2,
  question:'Bên cung cấp giao ngày nào?'}),f.env,{now:NOW});
 assert.equal(res.status,200);
 const review=(await res.json()).question_review;
 assert.deepEqual(review.mismatched_source_ids,['A1']);
 assert.equal(review.references[0].status,'source_mismatch');
 assert.ok(review.flags.includes('ANSWER_SOURCE_QUOTES_MISMATCH'));
 const denied=fixture({acl:false});
 const forbidden=await legalApi(request({uc:'UC09',question:'Bên cung cấp giao ngày nào?'}),
  denied.env,{now:NOW});
 assert.equal(forbidden.status,404);
 assert.equal((await forbidden.json()).question_review,undefined);
 assert.equal(denied.calls.some(x=>x.sql===LEGAL_QUOTA_SQL),false);
 assert.equal(denied.providerCalls.length,0);
});

test('R152 F09 explicit insufficiency does not invent a quote or legal source',async()=>{
 const f=fixture();
 f.env.AI.run=async()=>({response:
  'TRANG_THAI: KHONG_DU_CAN_CU\n'+
  'TRA_LOI: KHÔNG ĐỦ CĂN CỨ.\n'+
  'CAN_XAC_MINH: Có thêm văn bản cho câu hỏi này không?'});
 const res=await legalApi(request({uc:'UC09',question:'Cơ quan nào có thẩm quyền phê duyệt hồ sơ?'}),
  f.env,{now:NOW});
 assert.equal(res.status,200);
 const review=(await res.json()).question_review;
 assert.equal(review.answer_state,'insufficient_source_claim_not_verified');
 assert.equal(review.references.length,0);
 assert.deepEqual(review.flags,[]);
 assert.equal(review.factual_completeness_verified,false);
});
