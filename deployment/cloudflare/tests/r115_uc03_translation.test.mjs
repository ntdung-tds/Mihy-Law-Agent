import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {translationIntegrityCheck,translationSourceCoverage,legalApi,LEGAL_MATTER_ACCESS_SQL,LEGAL_QUOTA_SQL} from '../src/qa_legal_workflows.mjs';

const BASE='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const I='11111111-1111-4111-8111-111111111111';
const U='22222222-2222-4222-8222-222222222222';
const T='33333333-3333-4333-8333-333333333333';
const M='44444444-4444-4444-8444-444444444444';
const SID='55555555-5555-4555-8555-555555555555';
const SOURCE='Điều 1. Bên A phải thanh toán 2.000.000 đồng trước ngày 15/09/2026. Điều 2. Bên B bàn giao 10 tài liệu.';
const TRANSLATION='Article 1. Party A must pay 2,000,000 VND before 15/09/2026. Article 2. Party B delivers 10 documents. [A1]';

test('R127 UC03: source markers are deterministic, missing passages flagged with human review',()=>{
 const rows=[{id:'A1',text:'Điều 1. Thời hạn.'},
  {id:'A2',text:'Điều 2. Số tiền.'},{id:'A3',text:'Điều 3. Ký tên.'}];
 const partial=translationSourceCoverage(rows,'[A1] Article 1.\n[A3] Article 3.');
 assert.equal(partial.status,'review_required');
 assert.equal(partial.source_segment_count,3);
 assert.equal(partial.marked_segment_count,2);
 assert.equal(partial.missing_source_count,1);
 assert.deepEqual(partial.missing_source_ids,['A2']);
 assert.equal(partial.review_required,true);
 assert.match(partial.note,/KHÔNG chứng minh/);
 const complete=translationSourceCoverage(rows,'[A1] X.\n[A2] Y.\n[A3] Z.');
 assert.equal(complete.status,'markers_present_not_verified');
 assert.equal(complete.marked_segment_count,3);
 assert.equal(complete.review_required,true,'all labels do NOT imply legal equivalence');
 const fake=translationSourceCoverage(rows,'[A1] [A1] [A9] [B2] and [A2, A3]');
 assert.deepEqual(fake.missing_source_ids,['A1','A2','A3']);
 assert.equal(fake.marked_segment_count,0,'duplicates, unknown and grouped references cannot raise coverage');
 const many=translationSourceCoverage(
  Array.from({length:35},(_,i)=>({id:'A'+(i+1),text:'Synthetic'})),'[A1]');
 assert.equal(many.missing_source_count,34);
 assert.equal(many.missing_source_ids.length,30,'bound the response size');
});
test('R127 UC03: UI has coverage panel, clears stale history on workflow switch, text-only rendering',()=>{
 const source=readFileSync('deployment/cloudflare/src/qa_legal_workflows.mjs','utf8');
 const ui=readFileSync('web/r0-preview/legal.js','utf8');
 const html=readFileSync('web/r0-preview/index.html','utf8');
 assert.match(source,/source_coverage:translationSourceCoverage\(primary,output\)/);
 assert.match(source,/Mỗi đoạn nguồn \[A1\]/);
 assert.match(html,/id="legal-qa-source-coverage"/);
 assert.match(ui,/showSourceCoverage\(data\.source_coverage\)/);
 assert.match(ui,/\['legal-qa-translation-check','legal-qa-source-coverage'(?:,'legal-qa-summary-review')?(?:,'legal-qa-grammar-review')?\]/);
 assert.match(ui,/root\.replaceChildren\(\);root\.hidden=true/);
 assert.doesNotMatch(ui,/source-coverage[\s\S]{0,900}innerHTML/);
});

test('R115 UC03: preserve formatted integer/date/article numbering, never claim semantic fidelity',()=>{
 const a=translationIntegrityCheck(SOURCE,TRANSLATION);
 assert.equal(a.status,'no_obvious_numeric_omission');
 assert.deepEqual(a.missing_numbers,[]);
 assert.deepEqual(a.missing_article_numbers,[]);
 assert.equal(a.review_required,true);
 assert.match(a.note,/KHÔNG xác minh/);
});

test('R115 UC03: flag a model omission and repeated source numbers while keeping exact model draft',()=>{
 const a=translationIntegrityCheck(SOURCE,'Article 1. Party A pays before 15/09/2026. No more text.');
 assert.equal(a.status,'review_required');
 assert.ok(a.missing_numbers.includes('2000000'));
 assert.ok(a.missing_numbers.includes('10'));
 assert.ok(a.missing_article_numbers.includes('2'));
 const duplicated=translationIntegrityCheck('Điều 1. Phí 10. Phí thứ hai 10.',
  'Article 1. Fee 10.');
 assert.ok(duplicated.missing_numbers.includes('10'),'Repeated number cannot be silently counted once');
});

test('R115 UC03: citation [A1] is not a translated number; other UCs are unaffected',()=>{
 const a=translationIntegrityCheck('Điều 1. Nộp 99 đồng.','Article 1. [A1] Fee payable.');
 assert.ok(a.missing_numbers.includes('99'));
 const source=readFileSync('deployment/cloudflare/src/qa_legal_workflows.mjs','utf8');
 assert.match(source,/body.uc==='UC03'\?\{\s*translation_check/);
 const html=readFileSync('web/r0-preview/index.html','utf8');
 const ui=readFileSync('web/r0-preview/legal.js','utf8');
 const css=readFileSync('web/r0-preview/styles.css','utf8');
 assert.match(html,/id="legal-qa-translation-check"[^>]*hidden/);
 assert.match(ui,/if\(currentTask==='UC03'\)\{\s*showTranslationCheck\(data.translation_check\)/);
 assert.match(ui,/check.hidden=true;check.replaceChildren\(\)/);
 assert.doesNotMatch(ui,/translation-check[\s\S]{0,600}innerHTML/);
 assert.match(css,/legal-qa-translation-check\[hidden\]/);
});

function env(response,{acl=true,role='lawyer'}={}){
 const calls=[],runCalls=[];
 const e={INSTALLATION_ID:I,AI_LAW_CF_MODE:'isolated-qa-only',
  DB:{prepare(sql){return{bind(...p){calls.push({sql,p});return{
   async first(){
    if(sql.includes('FROM qa_sessions s'))return{user_id:U,tenant_id:T,role_key:role};
    if(sql===LEGAL_MATTER_ACCESS_SQL)return acl?{'1':1}:null;
    return null;
   },
   async run(){return {meta:{changes:1}};}
  };}};}},
  AI:{async run(model,args){runCalls.push({model,args});return {response};}}
 };
 return {e,calls,runCalls};
}
function req(uc='UC03',source=SOURCE){
 return new Request(BASE+'/api/qa/legal/run',{method:'POST',headers:{
  'Content-Type':'application/json','Origin':BASE,'Sec-Fetch-Site':'same-origin',
  'Cookie':'al_qa_session='+SID
 },body:JSON.stringify({uc,matter_id:M,source_text:source,source_text_2:'',
  question:'',language:'en',synthetic_consent:true})});
}

test('R115 UC03: actual legalApi returns honest warning and original AI translation; no body persistence',async()=>{
 const f=env('[A1] Article 1. Party A pays before 15/09/2026.');
 const r=await legalApi(req(),f.e,{now:1800000000});
 assert.equal(r.status,200,await r.clone().text());
 const d=await r.json();
 assert.equal(d.answer,'[A1] Article 1. Party A pays before 15/09/2026.');
 assert.equal(d.translation_check.status,'review_required');
 assert.ok(d.translation_check.missing_numbers.includes('2000000'));
 assert.equal(d.translation_check.review_required,true);
 assert.equal(d.source_coverage.status,'markers_present_not_verified');
 assert.equal(d.source_coverage.source_segment_count,1);
 assert.equal(d.source_coverage.marked_segment_count,1);
 assert.equal(d.source_coverage.review_required,true);
 assert.equal(d.review_required,true);
 assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.equal(f.runCalls.length,1);
 assert.ok(f.calls.every(x=>x.p.every(v=>v!==SOURCE)));
 const other=env('Article 1. Party A pays before 15/09/2026. [A1]');
 const summary=await legalApi(req('UC04'),other.e,{now:1800000000});
 assert.equal(summary.status,200);
 const summaryData=await summary.json();
 assert.equal(Object.hasOwn(summaryData,'translation_check'),false);
 assert.equal(Object.hasOwn(summaryData,'source_coverage'),false);
 const denied=env(TRANSLATION,{acl:false});
 const deniedResult=await legalApi(req(),denied.e,{now:1800000000});
 assert.equal(deniedResult.status,404);
 assert.equal(denied.runCalls.length,0);
 assert.equal(denied.calls.some(x=>x.sql===LEGAL_QUOTA_SQL),false);
});
