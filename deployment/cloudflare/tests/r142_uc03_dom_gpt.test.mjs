/** R142: execute the real browser-side legal.js against synthetic controlled data.
 * Does not simulate real Cloudflare login, provider or Word/PDF rendering.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const SOURCE=readFileSync(new URL('../../../web/r0-preview/legal.js',import.meta.url),'utf8');
const MATTER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function node(){
  const listeners=new Map();
  const e={children:[],value:'',hidden:false,required:false,checked:false,disabled:false,
    dataset:{},textContent:'',style:{},className:'',
    addEventListener(type,fn){listeners.set(type,fn);},
    fire(type,ev={preventDefault(){}}){return listeners.get(type)?.(ev);},
    replaceChildren(...items){e.children=items;e.textContent='';},
    append(...items){e.children.push(...items);},
    prepend(...items){e.children.unshift(...items);},
    get options(){return e.children;},
    scrollIntoView(){},focus(){},setAttribute(){}
  };
  return e;
}
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
function harness(){
  const elements=new Map(),events=new Map(),pending=[],redirects=[];
  const query=selector=>{
    if(!elements.has(selector))elements.set(selector,node());
    return elements.get(selector);
  };
  const win={addEventListener(name,fn){events.set(name,fn);},
    dispatchEvent(ev){events.get(ev.type)?.(ev);},
    requestAnimationFrame(fn){fn();}
  };
  const fetch=(path,options={})=>new Promise(resolve=>pending.push({path,options,resolve}));
  runInNewContext(SOURCE,{
    document:{querySelector:query,createElement:()=>node(),addEventListener(){}},
    window:win,fetch,AbortController,Event,
    FormData:class {constructor(){this.items=[];}append(...args){this.items.push(args);}},
    location:{hash:'#assistant',replace:path=>redirects.push(path)},
    navigator:{clipboard:{async writeText(){}}}
  },{filename:'legal.js',timeout:5000});
  assert.equal(pending.length,1);
  return {query,events,pending,win,redirects};
}
function finish(req,body,status=200){
 req.resolve({status,ok:status>=200&&status<300,json:async()=>body});
}
async function render(h,{rows,flags=[]}){
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic UC03 QA matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='UC03';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 h.query('#legal-qa-source').value='Điều 1. Số tiền 10 đồng và thời hạn 30 ngày.';
 h.query('#legal-qa-consent').checked=true;
 const complete=h.query('#legal-qa-form').fire('submit');
 assert.equal(h.pending.at(-1).path,'/api/qa/legal/run');
 finish(h.pending.at(-1),{
   uc:'UC03',title:'Dịch tài liệu, hợp đồng',mode:'ai_draft_not_verified',
   answer:'[A1] Article 1. 10 VND due in 30 days.',
   source_anchors:[{id:'A1',preview:'Điều 1...'}],
   source_hash:'0'.repeat(64),
   evidence_diagnostics:{flags:[],reference_coverage:'not_required_for_transform'},
   translation_review:{
     rows,total_segments:rows.length,paired_segments:rows.filter(r=>r.status==='paired').length,
     flags,mode:'qa_anchor_pairing_not_verified'
   },
   review_notice:'Synthetic only'
 });
 await complete;
 assert.equal(h.query('#legal-qa-result').hidden,false);
 return h.query('#legal-qa-translation-rows');
}

test('R142 complete UC03 bilingual pairs render safely and vanish on tenant rotation',async()=>{
 const h=harness();
 const rows=await render(h,{rows:[
 {source_id:'A1',source_text:'SECRET_SYNTHETIC_SOURCE 10 đồng',
  draft_text:'<strong>UNTRUSTED_AI_TEXT</strong> 10 dong',status:'paired'}
 ]});
 assert.equal(h.query('#legal-qa-translation-review').hidden,false);
 assert.equal(rows.children.length,1);
 assert.equal(rows.children[0].children[1].children[1].textContent,
  'SECRET_SYNTHETIC_SOURCE 10 đồng');
 assert.equal(rows.children[0].children[2].children[1].textContent,
  '<strong>UNTRUSTED_AI_TEXT</strong> 10 dong',
  'model output is plain text, not HTML');
 h.win.dispatchEvent(new Event('ai-law:workspace-switch'));
 assert.equal(h.query('#legal-qa-translation-review').hidden,true);
 assert.equal(h.query('#legal-qa-translation-rows').children.length,0);
 assert.equal(h.query('#legal-qa-output').textContent,'');
 assert.deepEqual(h.redirects,[]);
});

test('R142 missing or duplicate paragraph is prominently warned, never silently paired',async()=>{
 const h=harness();
 const rows=await render(h,{rows:[
 {source_id:'A1',source_text:'SYNTHETIC_MISSING_SOURCE',draft_text:'',status:'duplicate'}
 ],flags:['TRANSLATION_SEGMENTS_DUPLICATE']});
 assert.equal(h.query('#legal-qa-translation-review').hidden,false);
 assert.equal(rows.children.length,2,'warning and paragraph');
 assert.match(rows.children[0].textContent,/Đối chiếu UC03 chưa đầy đủ/);
 assert.equal(rows.children[1].children[2].children[1].textContent,
   'Chưa ghép được đoạn dịch');
 assert.equal(h.query('#legal-qa-feedback').dataset.state,'error');
});

test('R144 UC07 DOM safely displays per-paragraph source, proposed grammar and numeric alarm',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic UC07 QA matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='UC07';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 h.query('#legal-qa-source').value='Điều 1. Bên A giao 10 bộ hàng trong 30 ngày.';
 h.query('#legal-qa-consent').checked=true;
 const done=h.query('#legal-qa-form').fire('submit');
 assert.equal(h.pending.at(-1).path,'/api/qa/legal/run');
 finish(h.pending.at(-1),{
   uc:'UC07',title:'Sửa lỗi ngữ pháp',mode:'ai_draft_not_verified',
   answer:'[A1] Đề xuất chưa được xác minh.',
   source_anchors:[{id:'A1',preview:'Điều 1...'}],
   source_hash:'0'.repeat(64),
   evidence_diagnostics:{flags:[],reference_coverage:'not_required_for_transform'},
   correction_review:{
     rows:[{source_id:'A1',source_text:'SOURCE_WITHIN_TEST 10',
       proposed_text:'<script>UNTRUSTED_DRAFT_20</script>',
       status:'changed',numeric_check:'literal_numeric_change_requires_review'}],
     paired_segments:1,total_segments:1,
     flags:['GRAMMAR_PARAGRAPH_NUMBERS_CHANGED']
   }
 });
 await done;
 const section=h.query('#legal-qa-grammar-review');
 const rows=h.query('#legal-qa-grammar-rows');
 assert.equal(section.hidden,false);
 assert.equal(rows.children.length,2,'warning and grammar paragraph');
 const row=rows.children[1];
 assert.equal(row.children[1].children[1].textContent,'SOURCE_WITHIN_TEST 10');
 assert.equal(row.children[2].children[1].textContent,
   '<script>UNTRUSTED_DRAFT_20</script>',
   'textContent must keep model text inert');
 assert.match(row.children[3].textContent,/số liệu ở đoạn này đã thay đổi/);
 assert.equal(h.query('#legal-qa-feedback').dataset.state,'error');
 h.win.dispatchEvent(new Event('ai-law:workspace-switch'));
 assert.equal(section.hidden,true);
 assert.equal(rows.children.length,0);
 assert.equal(h.query('#legal-qa-output').textContent,'');
});

test('R144 UC07 DOM detects missing correction payload from stale backend instead of false green',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic UC07 QA matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='UC07';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 h.query('#legal-qa-source').value='Điều 1. Bên A giao 10 bộ hàng trong 30 ngày.';
 h.query('#legal-qa-consent').checked=true;
 const done=h.query('#legal-qa-form').fire('submit');
 finish(h.pending.at(-1),{
   uc:'UC07',title:'Sửa lỗi ngữ pháp',mode:'ai_draft_not_verified',
   answer:'An unstructured suggestion.',
   source_anchors:[{id:'A1',preview:'Điều 1...'}],
   source_hash:'0'.repeat(64),
   evidence_diagnostics:{flags:[],reference_coverage:'not_required_for_transform'}
 });
 await done;
 assert.equal(h.query('#legal-qa-grammar-review').hidden,true);
 assert.equal(h.query('#legal-qa-feedback').dataset.state,'error');
});

test('R145 UC02 browser review displays literal clause evidence as inert text and clears on tenant rotation',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic UC02 matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='UC02';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 h.query('#legal-qa-source').value='Điều 1. Bên A giao 10 hồ sơ trong vòng 30 ngày.';
 h.query('#legal-qa-consent').checked=true;
 const done=h.query('#legal-qa-form').fire('submit');
 assert.equal(h.pending.at(-1).path,'/api/qa/legal/run');
 finish(h.pending.at(-1),{
  uc:'UC02',title:'Rà soát hợp đồng',mode:'ai_draft_not_verified',
  answer:'[A1]\nTRICH: Bên A giao 10 hồ sơ',
  source_hash:'0'.repeat(64),source_anchors:[{id:'A1',preview:'Điều 1...'}],
  evidence_diagnostics:{flags:[],reference_coverage:'anchor_ids_matched_not_fact_checked'},
  contract_review:{
   rows:[{source_id:'A1',source_text:'Điều 1. Bên A giao 10 hồ sơ trong vòng 30 ngày.',
    model_quote:'Bên A giao 10 hồ sơ',review_note:'<script>UNTRUSTED_AI_RISK</script>',
    verification_question:'Có biên bản bàn giao hay chưa?',
    status:'quote_matched_not_legally_verified',literal_source_quote_matched:true}],
   total_segments:1,literal_quote_matched_segments:1,flags:[]
  },
  review_notice:'Source-only fictional QA, not legal advice'
 });
 await done;
 const panel=h.query('#legal-qa-contract-review');
 const rows=h.query('#legal-qa-contract-rows');
 assert.equal(panel.hidden,false);
 assert.equal(rows.children.length,1);
 const item=rows.children[0];
 assert.match(item.children[0].textContent,/chưa xác minh nhận định/);
 assert.equal(item.children[1].children[1].textContent,
  'Điều 1. Bên A giao 10 hồ sơ trong vòng 30 ngày.');
 assert.equal(item.children[2].children[1].textContent,'Bên A giao 10 hồ sơ');
 assert.equal(item.children[3].children[1].textContent,
  '<script>UNTRUSTED_AI_RISK</script>',
  'untrusted model output must remain inert text');
 assert.equal(h.query('#legal-qa-feedback').dataset.state,'info');
 h.win.dispatchEvent(new Event('ai-law:workspace-switch'));
 assert.equal(panel.hidden,true);
 assert.equal(rows.children.length,0);
 assert.equal(h.query('#legal-qa-output').textContent,'');
});

test('R145 UC02 browser highlights unmatched quotes and never treats missing metadata as green',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic UC02 matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='UC02';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 h.query('#legal-qa-source').value='Điều 1. Bên A giao 10 hồ sơ trong vòng 30 ngày.';
 h.query('#legal-qa-consent').checked=true;
 const done=h.query('#legal-qa-form').fire('submit');
 finish(h.pending.at(-1),{
  uc:'UC02',title:'Rà soát hợp đồng',mode:'ai_draft_not_verified',
  answer:'Bản nháp chưa đối chiếu',
  source_hash:'0'.repeat(64),source_anchors:[{id:'A1',preview:'Điều 1...'}],
  evidence_diagnostics:{flags:[],reference_coverage:'anchor_ids_matched_not_fact_checked'},
  contract_review:{
   rows:[{source_id:'A1',source_text:'Điều 1. Bên A giao 10 hồ sơ.',
    model_quote:'Sai điều khoản nguồn',review_note:'Cần rà soát',
    verification_question:'Cần xác minh gì?',status:'quote_mismatch',
    literal_source_quote_matched:false}],
   total_segments:1,literal_quote_matched_segments:0,
   flags:['CONTRACT_QUOTES_NOT_IN_SOURCE']
  }
 });
 await done;
 assert.equal(h.query('#legal-qa-feedback').dataset.state,'error');
 assert.match(h.query('#legal-qa-contract-rows').children[0].textContent,
  /điều khoản thiếu, trích dẫn không khớp/);
});

test('R146 UC01 browser shows source and draft with invented-number warning; clears on tenant rotation',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic UC01 QA matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='UC01';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 h.query('#legal-qa-source').value='Điều 1. Bên A giao 10 bộ hàng trong vòng 30 ngày.';
 h.query('#legal-qa-consent').checked=true;
 const done=h.query('#legal-qa-form').fire('submit');
 assert.equal(h.pending.at(-1).path,'/api/qa/legal/run');
 finish(h.pending.at(-1),{
   uc:'UC01',title:'Soạn bản nháp hợp đồng/văn bản',mode:'ai_draft_not_verified',
   answer:'[A1] Trích dữ kiện và điều khoản QA.',
   source_hash:'0'.repeat(64),source_anchors:[{id:'A1',preview:'Điều 1...'}],
   evidence_diagnostics:{flags:[],reference_coverage:'anchor_ids_matched_not_fact_checked'},
   drafting_review:{
     rows:[{source_id:'A1',source_text:'Điều 1. Bên A giao 10 bộ hàng trong vòng 30 ngày.',
       source_quote:'Bên A giao 10 bộ hàng',
       draft_clause:'<strong>UNTRUSTED_DRAFT_99</strong>',
       verification_question:'Các bên xác minh lại thời hạn chưa?',
       status:'draft_for_human_review',
       number_check:'draft_has_number_absent_from_source',
       literal_source_quote_matched:true}],
     total_segments:1,matched_quote_segments:1,flags:['DRAFT_NUMBER_NOT_IN_SOURCE']
   }
 });
 await done;
 const panel=h.query('#legal-qa-drafting-review');
 const rows=h.query('#legal-qa-drafting-rows');
 assert.equal(panel.hidden,false);
 assert.equal(rows.children.length,2,'warning followed by draft row');
 const draft=rows.children[1];
 assert.match(draft.children[0].textContent,/chờ luật sư kiểm duyệt/);
 assert.equal(draft.children[1].children[1].textContent,
  'Điều 1. Bên A giao 10 bộ hàng trong vòng 30 ngày.');
 assert.equal(draft.children[3].children[1].textContent,
  '<strong>UNTRUSTED_DRAFT_99</strong>',
  'model output must remain plain text, not render HTML');
 assert.match(draft.children[5].textContent,/số không xuất hiện/);
 assert.equal(h.query('#legal-qa-feedback').dataset.state,'error');
 h.win.dispatchEvent(new Event('ai-law:workspace-switch'));
 assert.equal(panel.hidden,true);
 assert.equal(rows.children.length,0);
 assert.equal(h.query('#legal-qa-output').textContent,'');
});
test('R146 UC01 absent structured review metadata cannot render a false green result',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic UC01 QA matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='UC01';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 h.query('#legal-qa-source').value='Điều 1. Bên A giao 10 bộ hàng trong vòng 30 ngày.';
 h.query('#legal-qa-consent').checked=true;
 const done=h.query('#legal-qa-form').fire('submit');
 finish(h.pending.at(-1),{
   uc:'UC01',title:'Soạn bản nháp hợp đồng/văn bản',mode:'ai_draft_not_verified',
   answer:'Bản nháp chưa ghép nguồn.',
   source_hash:'0'.repeat(64),source_anchors:[{id:'A1',preview:'Điều 1...'}],
   evidence_diagnostics:{flags:[],reference_coverage:'anchor_ids_matched_not_fact_checked'}
 });
 await done;
 assert.equal(h.query('#legal-qa-drafting-review').hidden,true);
 assert.equal(h.query('#legal-qa-feedback').dataset.state,'error');
});

test('R148 F08 source-linked extraction displays inert money text and clears on tenant switch',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic F08 QA matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='F08';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 h.query('#legal-qa-source').value='Điều 1. Bên A thanh toán 2.000.000 đồng trong vòng 30 ngày.';
 h.query('#legal-qa-consent').checked=true;
 const done=h.query('#legal-qa-form').fire('submit');
 assert.equal(h.pending.at(-1).path,'/api/qa/legal/run');
 finish(h.pending.at(-1),{
  uc:'F08',title:'Trích xuất dữ liệu pháp lý QA',mode:'ai_draft_not_verified',
  answer:'[A1] LOAI: SO_TIEN TRICH: 2.000.000 đồng',
  source_hash:'0'.repeat(64),source_anchors:[{id:'A1',preview:'Điều 1...'}],
  evidence_diagnostics:{flags:[],reference_coverage:'not_required_for_transform'},
  extraction_review:{
    rows:[{source_id:'A1',
      source_text:'Điều 1. Bên A thanh toán 2.000.000 đồng trong vòng 30 ngày.',
      kind:'SO_TIEN',source_quote:'thanh toán 2.000.000 đồng',
      value:'<script>UNTRUSTED_MONEY</script>',
      status:'source_mismatch',literal_quote_matched:true,
      literal_value_matched:false}],
    total_source_segments:1,reviewed_source_segments:1,
    flags:['EXTRACTION_SOURCE_MISMATCH']
  }
 });
 await done;
 const panel=h.query('#legal-qa-extraction-review');
 const rows=h.query('#legal-qa-extraction-rows');
 assert.equal(panel.hidden,false);
 assert.equal(rows.children.length,2,'warning and extraction row');
 assert.equal(h.query('#legal-qa-feedback').dataset.state,'error');
 const row=rows.children[1];
 assert.match(row.children[0].textContent,/Số tiền/);
 assert.equal(row.children[1].children[1].textContent,
  'Điều 1. Bên A thanh toán 2.000.000 đồng trong vòng 30 ngày.');
 assert.equal(row.children[3].children[1].textContent,
  '<script>UNTRUSTED_MONEY</script>',
  'untrusted AI output is textContent only');
 assert.match(row.children[4].textContent,/Dữ kiện này chưa được xác nhận/);
 h.win.dispatchEvent(new Event('ai-law:workspace-switch'));
 assert.equal(panel.hidden,true);
 assert.equal(rows.children.length,0);
 assert.equal(h.query('#legal-qa-output').textContent,'');
});

test('R148 F08 missing extraction review metadata never gets green completion state',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic F08 QA matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='F08';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 h.query('#legal-qa-source').value='Điều 1. Bên A thanh toán 2.000.000 đồng trong vòng 30 ngày.';
 h.query('#legal-qa-consent').checked=true;
 const done=h.query('#legal-qa-form').fire('submit');
 finish(h.pending.at(-1),{
  uc:'F08',title:'Trích xuất dữ liệu pháp lý QA',mode:'ai_draft_not_verified',
  answer:'Không có dữ liệu đối chiếu.',
  source_hash:'0'.repeat(64),source_anchors:[{id:'A1',preview:'Điều 1...'}],
  evidence_diagnostics:{flags:[],reference_coverage:'not_required_for_transform'}
 });
 await done;
 assert.equal(h.query('#legal-qa-extraction-review').hidden,true);
 assert.equal(h.query('#legal-qa-feedback').dataset.state,'error');
});

test('R149 F07 local file selection does not transmit until consent + explicit read, then manual accept',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic F07 QA matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='F08';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 const file={name:'synthetic.pdf',size:154,type:'application/pdf'};
 h.query('#legal-qa-doc-file').files=[file];
 h.query('#legal-qa-doc-file').fire('change');
 assert.equal(h.pending.length,1,'selection alone must not upload');
 await h.query('#legal-qa-doc-read').fire('click');
 assert.equal(h.pending.length,1,'must deny without explicit fictional consent');
 h.query('#legal-qa-consent').checked=true;
 const done=h.query('#legal-qa-doc-read').fire('click');
 assert.equal(h.pending.length,2);
 const req=h.pending.at(-1);
 assert.equal(req.path,'/api/qa/legal/extract');
 assert.equal(req.options.method,'POST');
 assert.equal(req.options.credentials,'same-origin');
 const fields=req.options.body.items;
 assert.ok(fields.some(x=>x[0]==='matter_id'&&x[1]===MATTER));
 assert.ok(fields.some(x=>x[0]==='uc'&&x[1]==='F08'));
 assert.ok(fields.some(x=>x[0]==='synthetic_consent'&&x[1]==='true'));
 assert.ok(fields.some(x=>x[0]==='file'&&x[1]===file));
 const extracted='Điều 1. Bên A thanh toán 2.000.000 đồng trong vòng 30 ngày.';
 finish(req,{
   uc:'F08',file_name:file.name,file_size:file.size,
   mode:'qa_file_text_preview_not_verified',source_text:extracted
 });
 await done;
 assert.equal(h.query('#legal-qa-doc-preview').hidden,false);
 assert.equal(h.query('#legal-qa-doc-preview').textContent,extracted);
 assert.equal(h.query('#legal-qa-source').value,'','preview does not silently replace source A');
 assert.equal(h.query('#legal-qa-doc-use').hidden,false);
 assert.equal(h.pending.length,2,'conversion must NOT launch model AI');
 h.query('#legal-qa-doc-use').fire('click');
 assert.equal(h.query('#legal-qa-source').value,extracted);
 assert.equal(h.query('#legal-qa-consent').checked,false,'model run needs separate consent');
 assert.equal(h.query('#legal-qa-doc-preview').hidden,true);
 assert.equal(h.pending.length,2,'manual accept must NOT call the model');
});

test('R149 F07 delayed conversion result cannot leak after workspace switch or selected Matter change',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic F07 QA matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='F08';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 h.query('#legal-qa-consent').checked=true;
 h.query('#legal-qa-doc-file').files=[{name:'synthetic.docx',size:128,type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}];
 const done=h.query('#legal-qa-doc-read').fire('click');
 const req=h.pending.at(-1);
 assert.equal(req.path,'/api/qa/legal/extract');
 h.win.dispatchEvent(new Event('ai-law:workspace-switch'));
 finish(req,{
   uc:'F08',file_name:'synthetic.docx',file_size:128,
   mode:'qa_file_text_preview_not_verified',
   source_text:'Điều 1. Bên A thanh toán 2.000.000 đồng trong vòng 30 ngày.'
 });
 await done;
 assert.equal(h.query('#legal-qa-doc-preview').hidden,true);
 assert.equal(h.query('#legal-qa-doc-use').hidden,true);
 assert.equal(h.query('#legal-qa-source').value,'');
 assert.equal(h.query('#legal-qa-doc-preview').textContent,'');
 assert.equal(h.query('#legal-qa-doc-file').value,'');
});

test('R152 F09 browser source-to-answer review is inert and cleared across tenant switch',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic F09 matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='UC09';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 h.query('#legal-qa-question').value='Bên A giao hồ sơ vào ngày nào?';
 h.query('#legal-qa-source').value='Điều 1. Bên A giao 10 bộ hồ sơ vào ngày 15/9/2026.';
 h.query('#legal-qa-consent').checked=true;
 const done=h.query('#legal-qa-form').fire('submit');
 assert.equal(h.pending.at(-1).path,'/api/qa/legal/run');
 finish(h.pending.at(-1),{
  uc:'UC09',title:'Trả lời câu hỏi pháp lý',mode:'ai_draft_not_verified',
  answer:'[A1] Dự thảo câu trả lời theo nguồn.',
  source_hash:'0'.repeat(64),source_anchors:[{id:'A1',preview:'Điều 1...'}],
  evidence_diagnostics:{flags:[],reference_coverage:'anchor_ids_matched_not_fact_checked'},
  question_review:{
   question:'Bên A giao hồ sơ vào ngày nào?',
   answer:'<script>UNTRUSTED_ANSWER</script>',
   verification_question:'Kiểm chứng ngày giao bằng văn bản?',
   answer_state:'proposed_answer_not_verified',
   reference_integrity:'literal_quotes_matched_not_semantic_proof',
   references:[{
     source_id:'A1',
     source_text:'Điều 1. Bên A giao 10 bộ hồ sơ vào ngày 15/9/2026.',
     model_quote:'Bên A giao 10 bộ hồ sơ vào ngày 15/9/2026.',
     status:'literal_quote_matched_not_semantic_proof',literal_match:true
   }],flags:[]
  }
 });
 await done;
 const panel=h.query('#legal-qa-question-review');
 const rows=h.query('#legal-qa-question-rows');
 assert.equal(panel.hidden,false);
 assert.equal(rows.children.length,3);
 assert.equal(rows.children[1].children[2].children[1].textContent,
   '<script>UNTRUSTED_ANSWER</script>',
   'untrusted model answer is textContent, not injected HTML');
 assert.equal(rows.children[2].children[1].children[1].textContent,
   'Điều 1. Bên A giao 10 bộ hồ sơ vào ngày 15/9/2026.');
 assert.equal(h.query('#legal-qa-feedback').dataset.state,'info');
 assert.equal(h.query('#legal-qa-copy').disabled,false,'reviewable draft may be copied for human editing');
 h.win.dispatchEvent(new Event('ai-law:workspace-switch'));
 assert.equal(panel.hidden,true);
 assert.equal(rows.children.length,0);
 assert.equal(h.query('#legal-qa-output').textContent,'');
});

test('R152 F09 browser warns when review metadata is missing or question mismatches',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic F09 matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='UC09';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 h.query('#legal-qa-question').value='Bên A giao hồ sơ vào ngày nào?';
 h.query('#legal-qa-source').value='Điều 1. Bên A giao 10 bộ hồ sơ vào ngày 15/9/2026.';
 h.query('#legal-qa-consent').checked=true;
 const done=h.query('#legal-qa-form').fire('submit');
 finish(h.pending.at(-1),{
  uc:'UC09',title:'Trả lời câu hỏi pháp lý',mode:'ai_draft_not_verified',
  answer:'[A1] Câu trả lời chưa có dữ liệu ghép.',
  source_hash:'0'.repeat(64),source_anchors:[{id:'A1',preview:'Điều 1...'}],
  evidence_diagnostics:{flags:[],reference_coverage:'anchor_ids_matched_not_fact_checked'}
 });
 await done;
 assert.equal(h.query('#legal-qa-question-review').hidden,true);
 assert.equal(h.query('#legal-qa-feedback').dataset.state,'error');
 assert.equal(h.query('#legal-qa-copy').disabled,true,
  'no one-click copy for missing source integrity metadata');
 h.win.dispatchEvent(new Event('ai-law:workspace-switch'));
 assert.equal(h.query('#legal-qa-copy').disabled,false,'workspace reset clears stale disabled state');
});

test('R154 F07 two files convert sequentially with one manual preview; source A does not contain filenames',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic F07 source matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='UC09';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 const one={name:'one.pdf',size:109,type:'application/pdf'};
 const two={name:'two.docx',size:218,type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
 h.query('#legal-qa-doc-file').files=[one,two];
 h.query('#legal-qa-doc-file').fire('change');
 assert.equal(h.pending.length,1,'file selection is local');
 h.query('#legal-qa-consent').checked=true;
 const done=h.query('#legal-qa-doc-read').fire('click');
 assert.equal(h.pending.length,2,'first upload starts only after click');
 assert.equal(h.query('#legal-qa-doc-read').disabled,true);
 const first=h.pending[1];
 assert.equal(first.path,'/api/qa/legal/extract');
 assert.equal(first.options.body.items.find(x=>x[0]==='file')[1],one);
 const textOne='Điều 1. Hồ sơ bàn giao 10 bộ tài liệu ngày 15/09/2026.';
 finish(first,{uc:'UC09',file_name:one.name,file_size:one.size,
  mode:'qa_file_text_preview_not_verified',source_text:textOne});
 await flush();
 assert.equal(h.pending.length,3,'second file starts after first succeeds');
 const second=h.pending[2];
 assert.equal(second.options.body.items.find(x=>x[0]==='file')[1],two);
 assert.equal(h.query('#legal-qa-doc-use').hidden,true,'no partial approval');
 const textTwo='Điều 2. Bên B thanh toán 2.000.000 đồng sau nghiệm thu.';
 finish(second,{uc:'UC09',file_name:two.name,file_size:two.size,
  mode:'qa_file_text_preview_not_verified',source_text:textTwo});
 await done;
 assert.equal(h.query('#legal-qa-doc-read').disabled,false);
 assert.equal(h.query('#legal-qa-doc-preview').hidden,false);
 assert.match(h.query('#legal-qa-doc-preview').textContent,/Tệp 1: one.pdf/);
 assert.match(h.query('#legal-qa-doc-preview').textContent,/Tệp 2: two.docx/);
 assert.equal(h.query('#legal-qa-source').value,'','conversion is preview only');
 assert.equal(h.query('#legal-qa-doc-use').hidden,false);
 assert.equal(h.pending.length,3,'preview never invokes language model');
 h.query('#legal-qa-doc-use').fire('click');
 assert.equal(h.query('#legal-qa-source').value,textOne+'\n\n'+textTwo);
 assert.equal(h.query('#legal-qa-source').value.includes('one.pdf'),false);
 assert.equal(h.query('#legal-qa-source').value.includes('two.docx'),false);
 assert.equal(h.query('#legal-qa-consent').checked,false,
   'separate model-run consent is still required');
 assert.equal(h.pending.length,3,'manual source acceptance does not call AI');
});

test('R154 F07 failed second file never displays a partial conversion or calls third upload',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic F07 matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='F08';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 const files=['a.pdf','b.pdf','c.pdf'].map((name,i)=>({name,size:101+i,type:'application/pdf'}));
 h.query('#legal-qa-doc-file').files=files;
 h.query('#legal-qa-consent').checked=true;
 const done=h.query('#legal-qa-doc-read').fire('click');
 finish(h.pending[1],{uc:'F08',file_name:files[0].name,file_size:files[0].size,
  mode:'qa_file_text_preview_not_verified',source_text:'Điều 1. Bên A giao 10 bộ hồ sơ trong 20 ngày.'});
 await flush();
 assert.equal(h.pending.length,3);
 finish(h.pending[2],{error:'Không trích được văn bản tin cậy từ tệp QA.'},422);
 await done;
 assert.equal(h.pending.length,3,'third file never uploaded after failure');
 assert.equal(h.query('#legal-qa-doc-preview').hidden,true);
 assert.equal(h.query('#legal-qa-doc-preview').textContent,'');
 assert.equal(h.query('#legal-qa-doc-use').hidden,true);
 assert.equal(h.query('#legal-qa-source').value,'');
 assert.match(h.query('#legal-qa-doc-status').textContent,/Không sử dụng nguồn chưa đủ tệp/);
 assert.equal(h.query('#legal-qa-doc-read').disabled,false);
});

test('R154 F07 rejects too many, invalid or duplicate files before charging QA quota',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic F07 matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='UC09';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 h.query('#legal-qa-consent').checked=true;
 const file=name=>({name,size:101,type:'application/pdf'});
 for(const files of [
  [file('a.pdf'),file('b.pdf'),file('c.pdf'),file('d.pdf')],
  [file('a.pdf'),file('A.PDF')],
  [file('a.pdf'),file('a.exe')],
  [file('a.pdf'),{name:'b.docx',size:1500001,type:'application/octet-stream'}]
 ]){
  h.query('#legal-qa-doc-file').files=files;
  await h.query('#legal-qa-doc-read').fire('click');
  assert.equal(h.pending.length,1,'invalid batch must not upload any file');
  assert.equal(h.query('#legal-qa-doc-use').hidden,true);
 }
});

test('R154 F07 combined source over 5000 chars cannot be approved for AI',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic F07 matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='F08';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 const files=[{name:'a.pdf',size:100,type:'application/pdf'},
   {name:'b.pdf',size:110,type:'application/pdf'}];
 h.query('#legal-qa-doc-file').files=files;
 h.query('#legal-qa-consent').checked=true;
 const done=h.query('#legal-qa-doc-read').fire('click');
 finish(h.pending[1],{uc:'F08',file_name:files[0].name,file_size:files[0].size,
  mode:'qa_file_text_preview_not_verified',source_text:'a'.repeat(3200)});
 await flush();
 finish(h.pending[2],{uc:'F08',file_name:files[1].name,file_size:files[1].size,
  mode:'qa_file_text_preview_not_verified',source_text:'b'.repeat(2100)});
 await done;
 assert.equal(h.query('#legal-qa-doc-preview').hidden,true);
 assert.equal(h.query('#legal-qa-doc-use').hidden,true);
 assert.equal(h.query('#legal-qa-source').value,'');
 assert.match(h.query('#legal-qa-doc-status').textContent,/5.000 ký tự/);
});

test('R154 F07 tenant change during second upload discards first conversion and delayed second response',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic F07 matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='UC09';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 const files=[{name:'a.pdf',size:100,type:'application/pdf'},
   {name:'b.pdf',size:110,type:'application/pdf'}];
 h.query('#legal-qa-doc-file').files=files;
 h.query('#legal-qa-consent').checked=true;
 const done=h.query('#legal-qa-doc-read').fire('click');
 finish(h.pending[1],{uc:'UC09',file_name:files[0].name,file_size:files[0].size,
  mode:'qa_file_text_preview_not_verified',source_text:'Điều 1. Nguồn A ngày 20/09/2026 không được lộ.'});
 await flush();
 assert.equal(h.pending.length,3);
 h.win.dispatchEvent(new Event('ai-law:workspace-switch'));
 finish(h.pending[2],{uc:'UC09',file_name:files[1].name,file_size:files[1].size,
  mode:'qa_file_text_preview_not_verified',source_text:'Điều 2. Nguồn B ngày 21/09/2026 không được lộ.'});
 await done;
 assert.equal(h.query('#legal-qa-doc-preview').hidden,true);
 assert.equal(h.query('#legal-qa-doc-preview').textContent,'');
 assert.equal(h.query('#legal-qa-doc-use').hidden,true);
 assert.equal(h.query('#legal-qa-source').value,'');
 assert.equal(h.query('#legal-qa-doc-file').value,'');
});

test('R154 F07 revoked user consent while a file is converting cannot leave a stuck button or preview',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[{id:MATTER,title:'Synthetic F07 consent matter'}]});
 await flush();
 h.query('#legal-qa-uc').value='F08';
 h.query('#legal-qa-uc').fire('change');
 h.query('#legal-qa-matter').value=MATTER;
 h.query('#legal-qa-doc-file').files=[{name:'one.pdf',size:100,type:'application/pdf'}];
 h.query('#legal-qa-consent').checked=true;
 const done=h.query('#legal-qa-doc-read').fire('click');
 assert.equal(h.query('#legal-qa-doc-read').disabled,true);
 h.query('#legal-qa-consent').checked=false;
 finish(h.pending[1],{uc:'F08',file_name:'one.pdf',file_size:100,
  mode:'qa_file_text_preview_not_verified',
  source_text:'Điều 1. Bên A có 10 bộ tài liệu phải bàn giao sau 20 ngày.'});
 await done;
 assert.equal(h.query('#legal-qa-doc-read').disabled,false);
 assert.equal(h.query('#legal-qa-doc-use').hidden,true);
 assert.equal(h.query('#legal-qa-doc-preview').hidden,true);
 assert.equal(h.query('#legal-qa-doc-preview').textContent,'');
 assert.equal(h.query('#legal-qa-source').value,'');
 assert.match(h.query('#legal-qa-doc-status').textContent,/Đã hủy xác nhận/);
});
