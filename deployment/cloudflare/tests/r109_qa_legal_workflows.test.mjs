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
