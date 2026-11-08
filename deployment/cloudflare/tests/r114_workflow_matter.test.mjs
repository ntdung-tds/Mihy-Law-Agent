import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync('web/r0-preview/index.html','utf8');
const source=readFileSync('web/r0-preview/legal.js','utf8');

test('R114: quick Matter create and resume controls exist on independent UC/document panels',()=>{
 assert.match(html,/id="workflow-create-matter"[^>]*type="button"/);
 assert.match(html,/id="workflow-resume"[^>]*type="button"/);
 assert.match(html,/id="workflow-resume-panel"[^>]*hidden/);
 const workflow=html.indexOf('id="view-workflow"'),documents=html.indexOf('id="view-documents"');
 assert.ok(workflow>=0&&documents>=0);
 assert.ok(html.indexOf('id="workflow-create-matter"')>workflow);
 assert.ok(html.indexOf('id="workflow-resume"')>documents);
});

test('R114: late Matter response from previous workspace never leaks or redirects; 401 on active request does',async()=>{
 const nodes=new Map(),listeners=new Map(),pending=[],redirects=[];
 function make(id=''){
  const events=new Map();
  const node={
   id,value:'',required:false,disabled:false,hidden:false,checked:false,children:[],
   dataset:{},textContent:'',
   addEventListener(event,fn){events.set(event,fn);},
   emit(event,e){events.get(event)?.(e);},
   replaceChildren(...args){this.children=[...args];},
   append(...args){this.children.push(...args);},
   get options(){return this.children;},
   closest(){return {hidden:false};},
   scrollIntoView(){},focus(){},
  };
  if(id)nodes.set(id,node);
  return node;
 }
 const ids=['legal-qa-form','legal-qa-uc','legal-qa-matter','legal-qa-question',
 'legal-qa-source','legal-qa-source-b','legal-qa-feedback','legal-qa-result',
 'legal-qa-output','legal-qa-copy','legal-qa-sources','legal-qa-source-b-label',
 'legal-qa-language','legal-qa-run','legal-qa-consent','legal-qa-example',
 'legal-qa-result-title','legal-qa-review','legal-qa-translation-check',
 'legal-qa-source-coverage','legal-qa-summary-review','legal-qa-grammar-review',
 'legal-qa-uc07-compare','legal-qa-uc07-original','legal-qa-uc07-edited',
 'legal-qa-uc07-reviewed','legal-qa-uc07-copy-edited','legal-qa-uc07-copy-status',
 'legal-qa-uc03-04-compare','legal-qa-uc03-04-original','legal-qa-uc03-04-draft',
 'legal-qa-uc03-04-reviewed','legal-qa-uc03-04-copy-reviewed','legal-qa-uc03-04-copy-status'];
 for(const id of ids)make(id);
 const document={
  querySelector(q){return nodes.get(q.slice(1))||null;},
  createElement(){return make();},
  addEventListener(){}
 };
 const window={
  addEventListener(kind,callback){const arr=listeners.get(kind)||[];arr.push(callback);listeners.set(kind,arr);},
  dispatchEvent(e){for(const cb of listeners.get(e.type)||[])cb(e);}
 };
 const location={hash:'#assistant',replace(url){redirects.push(url);}};
 const fetch=()=>new Promise(resolve=>pending.push(resolve));
 runInNewContext(source,{document,window,location,fetch,console,AbortController,
  navigator:{clipboard:{async writeText(){}}},Event});
 const emit=(type,detail={})=>window.dispatchEvent({type,detail});
 const reply=(matters,status=200)=>({status,ok:status===200,async json(){return {matters};}});
 const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
 emit('ai-law:workflow-open',{uc:'UC03'});
 assert.equal(pending.length,1);
 nodes.get('legal-qa-source').value='Văn bản giả lập chỉ kiểm thử UI. '.repeat(4);
 nodes.get('legal-qa-consent').checked=true;
 emit('ai-law:workspace-switch');
 assert.equal(pending.length,2);
 assert.equal(nodes.get('legal-qa-source').value,'');
 assert.equal(nodes.get('legal-qa-consent').checked,false);
 pending[1](reply([{id:'workspace-B-id',title:'Hồ sơ QA B'}]));
 await settle();
 const matter=nodes.get('legal-qa-matter');
 assert.deepEqual(matter.options.map(x=>x.textContent),['Chọn hồ sơ QA…','Hồ sơ QA B']);
 pending[0](reply([{id:'workspace-A-id',title:'Hồ sơ QA A'}],401));
 await settle();
 assert.equal(redirects.length,0,'Stale prior-workspace HTTP 401 cannot redirect active session');
 assert.deepEqual(matter.options.map(x=>x.textContent),['Chọn hồ sơ QA…','Hồ sơ QA B']);
 emit('ai-law:workflow-close');
 assert.equal(matter.options.length,0,'Leaving task must scrub old Matter labels');
 emit('ai-law:workflow-open',{uc:'UC04'});
 assert.equal(pending.length,3);
 pending[2](reply([],401));
 await settle();
 assert.deepEqual(redirects,['/login'],'Current workspace/session 401 must fail closed');
});
