/** R138: actual browser source regression for stale legal results after tenant rotation.
 * Runs legal.js with controlled network; synthetic only, no passwords or AI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const SOURCE=readFileSync(new URL('../../../web/r0-preview/legal.js',import.meta.url),'utf8');
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEXT='Điều 1. Bên A giao đủ mười bộ hồ sơ giả lập vào ngày 15 tháng 9 năm 2026.';

function element(){
  const listeners=new Map();
  const e={
    textContent:'',value:'',hidden:false,disabled:false,checked:false,required:false,
    dataset:{},children:[],style:{},
    addEventListener(type,fn){listeners.set(type,fn);},
    fire(type,ev={preventDefault(){}}){return listeners.get(type)?.(ev);},
    replaceChildren(...parts){e.children=parts;e.textContent='';},
    append(...parts){e.children.push(...parts);},
    scrollIntoView(){},focus(){},setAttribute(){},
    get options(){return e.children;}
  };
  return e;
}
function harness(){
  const nodes=new Map(),pending=[],redirects=[],events=new Map();
  const query=selector=>{
    if(!nodes.has(selector))nodes.set(selector,element());
    return nodes.get(selector);
  };
  const window={
    addEventListener(name,fn){const ls=events.get(name)||[];ls.push(fn);events.set(name,ls);},
    dispatchEvent(event){for(const fn of events.get(event.type)||[])fn(event);},
    requestAnimationFrame(fn){fn();}
  };
  const fetch=(path,options={})=>new Promise(resolve=>pending.push({path,options,resolve}));
  const location={hash:'#assistant',replace(path){redirects.push(path);}};
  runInNewContext(SOURCE,{
    document:{querySelector:query,createElement:()=>element(),addEventListener(){}},
    window,fetch,location,AbortController,Event,
    navigator:{clipboard:{async writeText(){}}}
  },{filename:'legal.js',timeout:5000});
  assert.equal(pending.length,1,'first matter request must start');
  return {window,query,pending,redirects};
}
async function flush(){for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));}
function finish(req,body,status=200){
  req.resolve({status,ok:status>=200&&status<300,json:async()=>body});
}
function ready(h,matter=A){
  const latest=h.pending.at(-1);
  finish(latest,{matters:[{id:matter,title:matter===A?'QA GPT old':'QA GPT new'}]});
  return flush();
}
function submit(h,matter=A){
  h.query('#legal-qa-matter').value=matter;
  h.query('#legal-qa-source').value=TEXT;
  h.query('#legal-qa-consent').checked=true;
  const p=h.query('#legal-qa-form').fire('submit');
  assert.equal(h.pending.at(-1).path,'/api/qa/legal/run');
  return p;
}
const reply={title:'UC04',mode:'ai_draft_not_verified',answer:'QA GPT OLD PRIVATE RESPONSE',
  source_hash:'a'.repeat(64),source_anchors:[],review_notice:'Review needed'};

test('R138 old tenant matter 401 is ignored after switch, new list only',async()=>{
  const h=harness(),old=h.pending[0];
  h.window.dispatchEvent(new Event('ai-law:workspace-switch'));
  assert.equal(old.options.signal.aborted,true);
  assert.equal(h.pending.length,2);
  finish(old,{},401);
  await flush();
  assert.deepEqual(h.redirects,[],'obsolete 401 must not log out rotated session');
  await ready(h,B);
  assert.equal(h.query('#legal-qa-matter').options[1].value,B);
  assert.equal(h.query('#legal-qa-matter').options.length,2);
});

test('R138 late AI 200 after tenant switch never exposes old answer or blocks next run',async()=>{
  const h=harness();await ready(h,A);
  const oldPromise=submit(h,A),old=h.pending.at(-1);
  assert.equal(old.options.signal.aborted,false);
  h.window.dispatchEvent(new Event('ai-law:workspace-switch'));
  assert.equal(old.options.signal.aborted,true);
  assert.equal(h.query('#legal-qa-result').hidden,true);
  assert.equal(h.query('#legal-qa-output').textContent,'');
  finish(old,reply);
  await oldPromise;await flush();
  assert.equal(h.query('#legal-qa-result').hidden,true);
  assert.equal(h.query('#legal-qa-output').textContent,'');
  assert.deepEqual(h.redirects,[]);
  await ready(h,B);
  const newPromise=submit(h,B);
  finish(h.pending.at(-1),{...reply,answer:'QA GPT NEW TENANT RESPONSE'});
  await newPromise;
  assert.equal(h.query('#legal-qa-result').hidden,false);
  assert.equal(h.query('#legal-qa-output').textContent,'QA GPT NEW TENANT RESPONSE');
});

test('R138 stale HTTP 401 or delayed response JSON cannot log out or repaint',async()=>{
  for(const mode of ['401','delayed-json']){
    const h=harness();await ready(h,A);
    const oldPromise=submit(h,A),old=h.pending.at(-1);
    let resolveJSON;
    if(mode==='delayed-json'){
      old.resolve({status:200,ok:true,json:()=>new Promise(resolve=>{resolveJSON=resolve;})});
      await flush();
      assert.equal(typeof resolveJSON,'function');
    }
    h.window.dispatchEvent(new Event('ai-law:workspace-switch'));
    if(mode==='401')finish(old,{},401);
    else resolveJSON(reply);
    await oldPromise;await flush();
    assert.deepEqual(h.redirects,[]);
    assert.equal(h.query('#legal-qa-result').hidden,true);
    assert.equal(h.query('#legal-qa-output').textContent,'');
  }
});

test('R138 changing UC invalidates old AI response before new task',async()=>{
  const h=harness();await ready(h,A);
  const previous=submit(h,A),req=h.pending.at(-1);
  h.query('#legal-qa-uc').value='UC07';
  h.query('#legal-qa-uc').fire('change');
  assert.equal(req.options.signal.aborted,true);
  finish(req,reply);
  await previous;
  assert.equal(h.query('#legal-qa-result').hidden,true);
  assert.equal(h.query('#legal-qa-output').textContent,'');
  assert.equal(h.query('#legal-qa-run').disabled,false);
});
