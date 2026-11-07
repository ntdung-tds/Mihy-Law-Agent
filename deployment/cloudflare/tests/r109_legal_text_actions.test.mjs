import test from 'node:test';
import assert from 'node:assert/strict';
import {legalTextApi,validatedSource,MODEL,RATE_SQL} from '../src/legal_text_actions.mjs';

const ORIGIN='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const I='11111111-1111-4111-8111-111111111111';
const T='22222222-2222-4222-8222-222222222222';
const U='33333333-3333-4333-8333-333333333333';
const S='44444444-4444-4444-8444-444444444444';
const NOW=1800000000;
const source='Bên A có trách nhiệm bàn giao tài liệu trước ngày 15/12/2026.\nBên B thanh toán trong mười ngày kể từ khi nhận đủ chứng từ.';
function setup({active=true,role='lawyer',quota=true,configured=true}={}){
 const calls=[],queries=[];
 const env={
  AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:I,
  ...(configured?{AI:{async run(model,input){calls.push({model,input});throw Error('Unmocked real provider must not run');}}}:{})
 };
 env.DB={
  prepare(sql){
   return {
    bind(...args){
     queries.push({sql,args});
     return {
      async first(){
       if(sql.includes('FROM qa_sessions s'))
        return active?{user_id:U,tenant_id:T,role_key:role}:null;
       if(sql===RATE_SQL)return quota?{attempts:1}:null;
       return null;
      }
     };
    }
   };
  }
 };
 return {env,calls,queries};
}
function req(payload,extra={}){
 const method=extra.method||'POST',url=ORIGIN+'/api/qa/legal-text';
 const headers={'Content-Type':extra.type||'application/json',Origin:extra.origin||ORIGIN,
  'Sec-Fetch-Site':extra.fetchSite||'same-origin'};
 if(extra.cookie!==false)headers.Cookie='al_qa_session='+S;
 return new Request(url,{method,headers,body:method==='POST'?(extra.raw||JSON.stringify(payload)):undefined});
}
const run=(answer)=>async()=>({response:JSON.stringify(answer)});
test('R109 UC03 real model draft must include every original source line with explicit review state',async()=>{
 const f=setup();
 const result=await legalTextApi(req({action:'UC03',direction:'vi-en',text:source}),f.env,{now:NOW,
  runModel:run({rows:[{id:'L1',translation:'Party A shall deliver the documents before December 15, 2026.'},
    {id:'L2',translation:'Party B shall pay within ten days of receiving all documents.'}]})});
 assert.equal(result.status,200,await result.clone().text());
 const j=await result.json();
 assert.equal(j.action,'UC03');
 assert.equal(j.status,'draft_requires_human_review');
 assert.equal(j.review_required,true);
 assert.equal(j.rows.length,2);
 assert.equal(j.rows[0].source,source.split('\n')[0]);
 assert.match(j.source_sha256,/^[0-9a-f]{64}$/);
 assert.equal(j.model,MODEL);
 assert.equal(result.headers.get('Cache-Control'),'no-store');
 const limit=f.queries.find(x=>x.sql===RATE_SQL);
 assert.deepEqual(limit.args,[I,'qa-ai:'+T+':'+U,Math.floor(NOW/3600)*3600]);
});
test('R109 UC04 source-anchored extractive summaries reject invented quotations',async()=>{
 const f=setup();
 const good=await legalTextApi(req({action:'UC04',text:source}),f.env,{now:NOW,
  runModel:run({bullets:[{id:'L2',quote:'Bên B thanh toán',summary:'Dòng nguồn đề cập nghĩa vụ thanh toán.'}]})});
 assert.equal(good.status,200);
 const j=await good.json();
 assert.equal(j.omitted_lines,1);
 assert.equal(j.bullets[0].id,'L2');
 const bad=await legalTextApi(req({action:'UC04',text:source}),f.env,{now:NOW,
  runModel:run({bullets:[{id:'L2',quote:'Điều 99 chưa có trong nguồn',summary:'Một luật không tồn tại'}]})});
 assert.equal(bad.status,502);
 assert.doesNotMatch(await bad.text(),/Điều 99|Một luật/);
});
test('R109 UC07 returns suggestions but never applies edits or changes source text',async()=>{
 const text='Bên A có trách nhiệm cung cấp tài liệu , và bên B phải kiểm tra hợp đồng.';
 const f=setup();
 const result=await legalTextApi(req({action:'UC07',text}),f.env,{now:NOW,
  runModel:run({suggestions:[{id:'L1',original:'tài liệu ,',replacement:'tài liệu,',
   reason:'Bỏ khoảng trắng thừa trước dấu phẩy.'}]})});
 assert.equal(result.status,200);
 const draft=await result.json();
 assert.equal(draft.suggestions[0].original,'tài liệu ,');
 assert.equal(draft.suggestions[0].replacement,'tài liệu,');
 assert.equal(draft.review_required,true);
 const invalid=await legalTextApi(req({action:'UC07',text}),f.env,{now:NOW,
  runModel:run({suggestions:[{id:'L1',original:'nội dung khác hoàn toàn',replacement:'x',reason:'y'}]})});
 assert.equal(invalid.status,502);
});
test('R109 authentication, CSRF and wrong methods always deny before invoking AI',async()=>{
 const invalidSession=setup({active:false});
 assert.equal((await legalTextApi(req({action:'UC04',text:source}),invalidSession.env,{now:NOW})).status,401);
 assert.equal(invalidSession.calls.length,0);
 const role=setup({role:'viewer'});
 assert.equal((await legalTextApi(req({action:'UC04',text:source}),role.env,{now:NOW})).status,403);
 assert.equal(role.calls.length,0);
 const f=setup();
 assert.equal((await legalTextApi(req({action:'UC04',text:source},{origin:'https://evil.invalid'}),f.env,{now:NOW})).status,400);
 assert.equal((await legalTextApi(req({action:'UC04',text:source},{fetchSite:'cross-site'}),f.env,{now:NOW})).status,400);
 assert.equal((await legalTextApi(req(null,{method:'GET'}),f.env,{now:NOW})).status,405);
 assert.equal((await legalTextApi(req({action:'UC04',text:source}),setup({configured:false}).env,{now:NOW})).status,503);
 assert.equal(f.calls.length,0);
});
test('R109 strict request parsing, line limits and quota failures do not invoke model',async()=>{
 const f=setup();
 const invalid=[
  {action:'UC04',direction:'vi-en',text:source},
  {action:'UC09',text:source},
  {action:'UC03',direction:'fr-en',text:source},
  {action:'UC04',text:source,tenant_id:T}
 ];
 for(const payload of invalid)
  assert.equal((await legalTextApi(req(payload),f.env,{now:NOW})).status,400);
 const big=await legalTextApi(req({action:'UC04',text:'A'.repeat(15000)}),f.env,{now:NOW});
 assert.equal(big.status,413);
 assert.equal((await legalTextApi(req({action:'UC04',text:'A'.repeat(4001)}),f.env,{now:NOW})).status,400);
 assert.throws(()=>validatedSource('Xin chào người dùng pháp lý\n'.repeat(17)),/lines/);
 const quota=setup({quota:false});
 assert.equal((await legalTextApi(req({action:'UC04',text:source}),quota.env,{now:NOW})).status,429);
 assert.equal(f.calls.length,0);
 assert.equal(quota.calls.length,0);
});
test('R109 model errors, missing source lines and malformed JSON fail closed without fabricated answers',async()=>{
 const f=setup();
 const payload={action:'UC03',direction:'en-vi',text:source};
 const incomplete=await legalTextApi(req(payload),f.env,{now:NOW,
  runModel:run({rows:[{id:'L1',translation:'Bản nháp thiếu dòng'}]})});
 assert.equal(incomplete.status,502);
 const wrong=await legalTextApi(req(payload),f.env,{now:NOW,
  runModel:async()=>({response:'text not JSON'})});
 assert.equal(wrong.status,502);
 const unavailable=await legalTextApi(req(payload),f.env,{now:NOW,
  runModel:async()=>{throw Error('sensitive provider internal error')}} );
 assert.equal(unavailable.status,502);
 assert.doesNotMatch(await unavailable.text(),/sensitive provider/);
});
