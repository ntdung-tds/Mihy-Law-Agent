/** QA DOM regression: a slow previous-tenant /matters response must never repaint.
 * Runs actual browser-side matters.js in a minimal fake DOM; no credentials/data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const SOURCE=readFileSync(new URL('../../../web/r0-preview/matters.js',import.meta.url),'utf8');
const OLD={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',title:'QA GPT PREVIOUS TENANT PRIVATE',created_at:1700000000,version:1,can_write:false};
const NEW={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',title:'QA GPT NEXT TENANT OWN MATTER',created_at:1700000000,version:1,can_write:false};

function makeElement(){
 const listeners=new Map();
 const node={
  style:{},children:[],hidden:false,disabled:false,value:'',textContent:'',
  attributes:{},
  addEventListener(type,fn){listeners.set(type,fn);},
  fire(type,event={preventDefault(){}}){return listeners.get(type)?.(event);},
  replaceChildren(...parts){node.children=parts;node.textContent='';},
  append(...parts){node.children.push(...parts);},
  setAttribute(key,value){node.attributes[key]=value;},
  focus(){},
 };
 return node;
}
function harness(){
 const nodes=new Map();
 const query=selector=>{
  if(!nodes.has(selector))nodes.set(selector,makeElement());
  return nodes.get(selector);
 };
 const events=new Map(),pending=[],redirects=[];
 const window={
  addEventListener(name,fn){events.set(name,fn);},
  dispatchEvent(event){return events.get(event.type)?.(event);}
 };
 const location={replace(where){redirects.push(where);},hash:''};
 const fetch=(uri,options)=>new Promise(resolve=>{
  pending.push({uri,options,resolve});
 });
 runInNewContext(SOURCE,{
  document:{querySelector:query,createElement:()=>makeElement()},
  window,location,fetch,AbortController,Intl,Date,
 },{filename:'matters.js',timeout:5000});
 assert.equal(pending.length,1,'initial authenticated matter load requested');
 return {nodes,query,window,location,pending,redirects};
}
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
const titles=h=>h.query('#matter-list').children.map(row=>row.children[0].children[0].textContent);
function finish(req,body,status=200){
 req.resolve({status,ok:status>=200&&status<300,
  async json(){return body;}});
}

test('R126 previous-tenant slow successful response never reappears after workspace switch',async()=>{
 const h=harness();
 finish(h.pending[0],{matters:[OLD]});
 await flush();
 assert.deepEqual(titles(h),[OLD.title]);
 assert.equal(h.query('#matter-total').textContent,'1');

 h.query('#matter-refresh').fire('click');
 assert.equal(h.pending.length,2);
 const previous=h.pending[1];
 assert.equal(previous.options.signal.aborted,false);

 h.window.dispatchEvent({type:'ai-law:workspace-switch'});
 assert.equal(previous.options.signal.aborted,true,'obsolete HTTP request is aborted');
 assert.deepEqual(titles(h),[],'old private matter removed synchronously');
 assert.equal(h.query('#matter-total').textContent,'0');
 assert.equal(h.query('#dashboard-matter-count').textContent,'0');

 // Simulate a network stack which ignores AbortController and still resolves.
 finish(previous,{matters:[OLD]});
 await flush();
 assert.deepEqual(titles(h),[],'late previous-tenant reply must be discarded');
 assert.deepEqual(h.redirects,[]);

 h.query('#matter-refresh').fire('click');
 assert.equal(h.pending.length,3,'new tenant may refresh without waiting for prior fetch');
 finish(h.pending[2],{matters:[NEW]});
 await flush();
 assert.deepEqual(titles(h),[NEW.title],'only current tenant metadata is rendered');
 assert.equal(h.query('#matter-total').textContent,'1');
});

test('R126 old session HTTP 401 after tenant rotation never redirects new session to login',async()=>{
 const h=harness();
 const previous=h.pending[0];
 h.window.dispatchEvent({type:'ai-law:workspace-switch'});
 finish(previous,{},401);
 await flush();
 assert.deepEqual(h.redirects,[],'late old-session 401 cannot override rotated session');
 assert.deepEqual(titles(h),[]);
 h.query('#matter-refresh').fire('click');
 assert.equal(h.pending.length,2);
 finish(h.pending[1],{matters:[NEW]});
 await flush();
 assert.deepEqual(titles(h),[NEW.title]);
 assert.deepEqual(h.redirects,[]);
});

test('R126 prior tenant response JSON finishing after switch remains discarded',async()=>{
 const h=harness();
 let completeJson;
 h.pending[0].resolve({ok:true,status:200,
  json:()=>new Promise(resolve=>{completeJson=resolve;})});
 await flush();
 assert.equal(typeof completeJson,'function');

 h.window.dispatchEvent({type:'ai-law:workspace-switch'});
 completeJson({matters:[OLD]});
 await flush();
 assert.deepEqual(titles(h),[]);
 assert.equal(h.query('#matter-feedback').textContent,'');
 assert.deepEqual(h.redirects,[]);
});

test('R126 current-session 401 remains fail-closed and redirects to login',async()=>{
 const h=harness();
 finish(h.pending[0],{},401);
 await flush();
 assert.deepEqual(h.redirects,['/login']);
 assert.deepEqual(titles(h),[]);
});
