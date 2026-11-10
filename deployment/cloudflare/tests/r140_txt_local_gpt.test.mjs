/** R140: execute actual legal.js TXT controls with a synthetic browser file interface.
 * No real user files, network or credentials. The source bytes stay local until
 * the operator explicitly submits and consents.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const SOURCE=readFileSync(new URL('../../../web/r0-preview/legal.js',import.meta.url),'utf8');
const TEXT='Điều 1. Đây là đoạn hợp đồng giả lập. Bên A giao 10 bộ chứng từ vào ngày 15 tháng 9 năm 2026.';
const MATTER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeNode(){
  const handlers=new Map();
  const node={
    value:'',hidden:false,disabled:false,checked:false,required:false,
    dataset:{},children:[],textContent:'',style:{},files:[],
    addEventListener(event,fn){handlers.set(event,fn);},
    fire(event,e={preventDefault(){}}){return handlers.get(event)?.(e);},
    replaceChildren(...parts){node.children=parts;node.textContent='';},
    append(...parts){node.children.push(...parts);},
    get options(){return node.children;},
    scrollIntoView(){},focus(){},setAttribute(){}
  };
  return node;
}
function harness(){
  const nodes=new Map(),pending=[],events=new Map(),redirects=[];
  const query=selector=>{
    if(!nodes.has(selector))nodes.set(selector,makeNode());
    return nodes.get(selector);
  };
  const win={addEventListener(name,fn){events.set(name,fn);},
    dispatchEvent(ev){return events.get(ev.type)?.(ev);},
    requestAnimationFrame(cb){cb();}};
  const fetch=(path,options={})=>new Promise(resolve=>pending.push({path,options,resolve}));
  const location={hash:'#assistant',replace(path){redirects.push(path);}};
  runInNewContext(SOURCE,{
    document:{querySelector:query,createElement:()=>makeNode(),addEventListener(){}},
    window:win,fetch,location,AbortController,Event,
    navigator:{clipboard:{async writeText(){}}}
  },{filename:'legal.js',timeout:5000});
  assert.equal(pending.length,1);
  return {query,pending,window:win,redirects};
}
function loadFile(h,part,file){
  const n=h.query('#legal-qa-file-'+part);
  n.files=[file];return n.fire('change');
}
function txt(text=TEXT){return {name:'qa_gpt.txt',size:Buffer.byteLength(text),type:'text/plain',async text(){return text;}};}

test('R140 source A TXT is read locally and never POSTed before explicit consent',async()=>{
  const h=harness();
  await loadFile(h,'a',txt());
  assert.equal(h.query('#legal-qa-source').value,TEXT);
  assert.equal(h.pending.length,1,'file selection cannot POST source bytes');
  assert.equal(h.query('#legal-qa-consent').checked,false);
  assert.match(h.query('#legal-qa-feedback').textContent,/Chưa gửi lên máy chủ/);
});
test('R140 rejects malformed, oversized and unsupported local file inputs safely',async()=>{
  for(const file of [
    {name:'private.pdf',size:100,type:'application/pdf',async text(){throw Error('should not read');}},
    {name:'too-large.txt',size:20_001,type:'text/plain',async text(){throw Error('should not read');}},
    txt('short'),
    txt(TEXT+'\ufffd'),
    {name:'bad-encoding.txt',size:100,type:'application/octet-stream',async text(){return TEXT;}}
  ]){
    const h=harness();
    await loadFile(h,'a',file);
    assert.equal(h.query('#legal-qa-source').value,'');
    assert.equal(h.query('#legal-qa-feedback').dataset.state,'error');
    assert.equal(h.pending.length,1);
  }
});
test('R140 local file read completing after tenant switch cannot restore previous tenant text',async()=>{
  const h=harness();let complete;
  const read=loadFile(h,'a',{
    name:'qa_gpt.txt',size:200,type:'text/plain',
    text(){return new Promise(resolve=>{complete=resolve;});}
  });
  assert.equal(typeof complete,'function');
  h.window.dispatchEvent(new Event('ai-law:workspace-switch'));
  complete('PREVIOUS_TENANT_PRIVATE_ '+TEXT);
  await read;
  assert.equal(h.query('#legal-qa-source').value,'');
  assert.equal(h.query('#legal-qa-consent').checked,false);
  assert.equal(h.pending.some(x=>x.path==='/api/qa/legal/run'),false);
  assert.deepEqual(h.redirects,[]);
});
test('R140 file B is available for comparison and not submitted to unrelated UC',async()=>{
  const h=harness();
  h.query('#legal-qa-uc').value='UC06';
  h.query('#legal-qa-uc').fire('change');
  assert.equal(h.query('#legal-qa-file-b-label').hidden,false);
  await loadFile(h,'b',txt());
  assert.equal(h.query('#legal-qa-source-b').value,TEXT);
  h.query('#legal-qa-uc').value='UC04';
  h.query('#legal-qa-uc').fire('change');
  assert.equal(h.query('#legal-qa-file-b-label').hidden,true);
  assert.equal(h.query('#legal-qa-source-b').value,'');
  h.query('#legal-qa-source').value=TEXT;
  h.query('#legal-qa-matter').value=MATTER;
  h.query('#legal-qa-consent').checked=true;
  const running=h.query('#legal-qa-form').fire('submit');
  const post=h.pending.at(-1);
  assert.equal(post.path,'/api/qa/legal/run');
  const data=JSON.parse(post.options.body);
  assert.equal(data.source_text_2,'','hidden source B must never leak to other UC');
  post.resolve({status:503,ok:false,json:async()=>({error:'QA provider unavailable'})});
  await running;
});
