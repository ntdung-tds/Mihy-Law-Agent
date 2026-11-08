import test from 'node:test';
import assert from 'node:assert/strict';
import {legalApi,LEGAL_MATTER_ACCESS_SQL,LEGAL_QUOTA_SQL,sourceReferencesExist,summaryReviewCheck,grammarIntegrityCheck} from '../src/qa_legal_workflows.mjs';

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
test('R130 UC07: proposed version only, with number/date/modal/party-name changes flagged',()=>{
 const source='Bên A phải thanh toán 2.000.000 đồng trước ngày 15 tháng 9 năm 2026 cho Công ty Minh Anh.';
 const edited='Bên B có thể thanh toán 3.000.000 đồng trước ngày 16/09/2026 cho Công ty Minh Bách.';
 const answer='[BẮT ĐẦU BẢN SỬA]\n'+edited+
  '\n[KẾT THÚC BẢN SỬA]\nDANH SÁCH CHỈNH SỬA:\n2.000.000, ngày 15 tháng 9 năm 2026, Bên A và Công ty Minh Anh.';
 const risk=grammarIntegrityCheck(source,answer);
 assert.equal(risk.status,'review_required');
 assert.equal(risk.isolated_proposal,true);
 assert.ok(risk.number_changed_count>=2,JSON.stringify(risk));
 assert.ok(risk.date_changed_count>=2,JSON.stringify(risk));
 assert.ok(risk.duty_changed_count>=1,JSON.stringify(risk));
 assert.ok(risk.party_changed_count>=2,JSON.stringify(risk));
 assert.equal(risk.review_required,true);
 assert.match(risk.note,/KHÔNG xác minh/);
 assert.ok(risk.number_changes.some(x=>x.value==='3000000'),
  'Output explanation quotes old source but must not suppress detected changed amount');
 const intact=grammarIntegrityCheck(source,
  '[BẮT ĐẦU BẢN SỬA]\nBên A phải thanh toán 2,000,000 đồng trước 15/09/2026 cho Công ty Minh Anh.\n[KẾT THÚC BẢN SỬA]\n' +
  'Đã sửa dấu câu, không đổi nghĩa.');
 assert.equal(intact.status,'no_obvious_change_not_verified',JSON.stringify(intact));
 assert.equal(intact.number_changed_count,0);
 assert.equal(intact.date_changed_count,0);
 assert.equal(intact.duty_changed_count,0);
 assert.equal(intact.party_changed_count,0);
 assert.equal(intact.review_required,true,'Even matching tokens cannot certify legal equivalence');
});
test('R130 UC07: missing, duplicated or reversed proposal boundaries fail closed',()=>{
 const source='Bên A phải thanh toán 10 triệu vào ngày 30/09/2026.';
 for(const response of [
  'Phiên bản đề xuất: Bên A có thể thanh toán 20 triệu ngày 01/10/2026.',
  '[KẾT THÚC BẢN SỬA]\nBên A phải thanh toán.\n[BẮT ĐẦU BẢN SỬA]',
  '[BẮT ĐẦU BẢN SỬA]\nBên A phải thanh toán.\n[KẾT THÚC BẢN SỬA]\n[BẮT ĐẦU BẢN SỬA]\nBên A có thể trả.',
  '[BẮT ĐẦU BẢN SỬA]\n \n[KẾT THÚC BẢN SỬA]'
 ]){
  const check=grammarIntegrityCheck(source,response);
  assert.equal(check.status,'manual_review_no_proposed_version',response);
  assert.equal(check.isolated_proposal,false);
  assert.equal(check.review_required,true);
 }
 const many=grammarIntegrityCheck(
  'Bên A phải trả 100 đồng vào ngày 01/01/2026.\n'+Array.from({length:22},(_,i)=>'Số tiền '+(1000+i)+'.').join(' '),
  '[BẮT ĐẦU BẢN SỬA]\nBên B có thể trả 999 đồng vào ngày 02/01/2026.\n[KẾT THÚC BẢN SỬA]');
 assert.ok(many.number_changed_count>12);
 assert.equal(many.number_changes.length,12);
 assert.equal(many.review_required,true);
});
test('R130 UC07: API returns scoped grammar risk without changing model output, other UCs isolated',async()=>{
 const source='Bên A phải thanh toán 2.000.000 đồng trước 15/09/2026 cho Công ty Minh Anh.';
 const originalResponse='[BẮT ĐẦU BẢN SỬA]\nBên B có thể thanh toán 3,000,000 đồng trước 16/09/2026 cho Công ty Minh Anh.\n[KẾT THÚC BẢN SỬA]\n' +
  'Bản chỉnh sửa là bản đề xuất QA, cần luật sư duyệt.';
 const f=fixture();
 f.env.AI.run=async(model,args)=>{f.providerCalls.push({model,args});return {response:originalResponse};};
 const result=await legalApi(request({uc:'UC07',source}),f.env,{now:NOW});
 assert.equal(result.status,200,await result.clone().text());
 const body=await result.json();
 assert.equal(body.answer,originalResponse);
 assert.equal(body.grammar_review.status,'review_required');
 assert.equal(body.grammar_review.review_required,true);
 assert.equal(body.grammar_review.isolated_proposal,true);
 assert.ok(body.grammar_review.number_changed_count>0);
 assert.ok(body.grammar_review.duty_changed_count>0);
 assert.ok(body.grammar_review.party_changed_count>0);
 assert.equal(body.review_required,true);
 assert.equal(result.headers.get('Cache-Control'),'no-store');
 assert.match(f.providerCalls[0].args.messages[1].content,/BẮT ĐẦU BẢN SỬA/);
 assert.ok(f.calls.every(x=>x.params.every(p=>p!==source&&p!==originalResponse)),
  'Do not persist private draft or source text in D1');
 for(const uc of ['UC03','UC04']){
  const other=fixture();
  const rr=await legalApi(request({uc}),other.env,{now:NOW});
  assert.equal(rr.status,200);
  assert.equal(Object.hasOwn(await rr.json(),'grammar_review'),false);
 }
 const denied=fixture({acl:false});
 const no=await legalApi(request({uc:'UC07',source}),denied.env,{now:NOW});
 assert.equal(no.status,404);
 assert.equal(denied.providerCalls.length,0);
});

test('R128 UC04: omission signals for missing obligation anchors, key amounts and dates',()=>{
 const rows=[{id:'A1',text:'Điều 1. Bên A phải thanh toán 2.000.000 đồng vào ngày 15 tháng 9 năm 2026.'},
  {id:'A2',text:'Điều 2. Bên B bàn giao 10 tài liệu trước ngày 20/09/2026.'}];
 const risk=summaryReviewCheck(rows,'[A1] Bên A thanh toán 2,000,000 đồng ngày 15/09/2026.');
 assert.equal(risk.status,'review_required');
 assert.equal(risk.critical_source_count,2);
 assert.equal(risk.marked_critical_count,1);
 assert.equal(risk.missing_critical_source_count,1);
 assert.deepEqual(risk.missing_critical_source_ids,['A2']);
 assert.ok(risk.missing_numbers.includes('10'));
 assert.ok(!risk.missing_numbers.includes('2000000'),'Vietnamese/English thousands separators should normalize');
 assert.deepEqual(risk.missing_dates,['20/9/2026']);
 assert.equal(risk.missing_date_count,1);
 assert.equal(risk.review_required,true);
 assert.match(risk.note,/KHÔNG xác nhận/);
 const all=summaryReviewCheck(rows,
  '[A1] Điều 1. Bên A thanh toán 2,000,000 đồng ngày 15/09/2026.\n[A2] Điều 2. Bên B bàn giao 10 tài liệu ngày 20 tháng 9 năm 2026.');
 assert.equal(all.status,'no_obvious_omission_not_verified');
 assert.equal(all.missing_number_count,0);
 assert.equal(all.missing_date_count,0);
 assert.equal(all.missing_critical_source_count,0);
 assert.equal(all.review_required,true,'No heuristic can certify summary fidelity');
 const bogus=summaryReviewCheck(rows,'[A1] [A9] 2,000,000 đồng ngày 15/9/2026.');
 assert.deepEqual(bogus.missing_critical_source_ids,['A2']);
 const many=summaryReviewCheck(Array.from({length:33},(_,i)=>({
  id:'A'+(i+1),text:'Bên A phải thanh toán '+(5000+i)+' đồng trước ngày 31/12/2026.'
 })),'[A1] Chỉ có khoản 5000 đồng, hạn 31/12/2026.');
 assert.ok(many.missing_critical_source_count>=30);
 assert.equal(many.missing_critical_source_ids.length,12);
 assert.equal(many.missing_numbers.length,12);
});
test('R128 UC04: actual API returns review signals without persisting source or changing UC03/07',async()=>{
 const source='Điều 1. Bên A phải thanh toán 2.000.000 đồng vào ngày 15 tháng 9 năm 2026.\n\nĐiều 2. Bên B bàn giao 10 tài liệu trước ngày 20/09/2026.';
 const responseText='[A1] Bên A thanh toán 2,000,000 đồng vào 15/09/2026.';
 const f=fixture();
 f.env.AI.run=async(model,args)=>{f.providerCalls.push({model,args});return {response:responseText};};
 const r=await legalApi(request({uc:'UC04',source}),f.env,{now:NOW});
 assert.equal(r.status,200,await r.clone().text());
 const d=await r.json();
 assert.equal(d.answer,responseText,'Never mutate model draft to fix a detected omission');
 assert.equal(d.summary_review.status,'review_required');
 assert.deepEqual(d.summary_review.missing_critical_source_ids,['A2']);
 assert.ok(d.summary_review.missing_numbers.includes('10'));
 assert.equal(d.summary_review.review_required,true);
 assert.equal(d.review_required,true);
 assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.ok(f.calls.every(x=>x.params.every(p=>p!==source&&p!==responseText)),
   'Source and model output may not be stored in D1');
 assert.match(f.providerCalls[0].args.messages[1].content,/NHIỆM VỤ UC04/);
 assert.match(f.providerCalls[0].args.messages[1].content,/dẫn mã \[A#\]/);
 for(const uc of ['UC03','UC07']){
  const other=fixture();
  const o=await legalApi(request({uc}),other.env,{now:NOW});
  assert.equal(o.status,200);
  assert.equal(Object.hasOwn(await o.json(),'summary_review'),false);
 }
 const denied=fixture({acl:false});
 const no=await legalApi(request({uc:'UC04',source}),denied.env,{now:NOW});
 assert.equal(no.status,404);
 assert.equal(denied.providerCalls.length,0);
});

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
test('R111 fails closed on noncanonical or grouped source IDs instead of silently accepting fabricated anchors',()=>{
  const anchors=[{id:'A1'},{id:'B1'}];
  assert.equal(sourceReferencesExist('Theo [A1] và [B1].',anchors),true);
  assert.equal(sourceReferencesExist('Theo [A1, B1].',anchors),true);
  assert.equal(sourceReferencesExist('Theo [C1].',anchors),false);
  assert.equal(sourceReferencesExist('Theo [A99'+('x'.repeat(280))+'].',anchors),false);
  assert.equal(sourceReferencesExist('Theo [A1-A99].',anchors),false);
  assert.equal(sourceReferencesExist('Theo [a99].',anchors),false);
  assert.equal(sourceReferencesExist('Theo [A1, B99].',anchors),false);
  assert.equal(sourceReferencesExist('Theo [B2: B99].',anchors),false);
  assert.equal(sourceReferencesExist('Các lựa chọn [A/B] thông thường.',anchors),true);
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
