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
