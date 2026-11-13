import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../../web/r0-preview/documents.js',import.meta.url),'utf8');
const MATTER='44444444-4444-4444-8444-444444444444';
const record=(name,id='66666666-6666-4666-8666-666666666666')=>({
 id,name,mime_type:'application/pdf',bytes:123,
 sha256:'a'.repeat(64),status:'unverified'
});
function element(id){
 return {id,value:'',textContent:'',className:'',hidden:false,disabled:false,
  dataset:{},options:[],children:[],listeners:{},
  addEventListener(name,cb){this.listeners[name]=cb;},
  setAttribute(){},removeAttribute(){},click(){},remove(){},
  append(...x){this.children.push(...x);this.options.push(...x);
   if(id==='document-matter'&&this.options.length===2)this.value=x[0].value;},
  replaceChildren(...x){this.children=[...x];this.options=[...x];},
  querySelector(){return null;},
  fire(name,payload={}){return this.listeners[name]?.(payload);}
 };
}
async function flush(){await new Promise(resolve=>setImmediate(resolve));}
function harness(){
 const ids=[
  'document-matter','document-upload-form','document-file','document-file-name',
  'document-feedback','qa-document-list','drive-setup','drive-status',
  'drive-connect','drive-disconnect','document-google-status','drive-blob-test',
  'qa-document-search','qa-document-search-run'
 ];
 const els=Object.fromEntries(ids.map(id=>[id,element(id)]));
 els['document-upload-form'].querySelector=()=>element('submit');
 els['drive-setup'].dataset.state='disconnected';
 const calls=[],waiting=[],windowEvents={};
 const fetch=(url,opts)=>{
  calls.push({url,opts});
  if(url==='/api/qa/matters')return Promise.resolve(Response.json({
    matters:[{id:MATTER,title:'Hồ sơ QA giả lập'}]
  }));
  if(url.startsWith('/api/qa/documents?')){
   return new Promise((resolve,reject)=>waiting.push({url,opts,resolve,reject}));
  }
  if(url==='/api/qa/drive/status')return Promise.resolve(Response.json({connected:false}));
  throw Error('Unexpected network call: '+url);
 };
 const win={addEventListener(name,cb){windowEvents[name]=cb;},confirm(){return false;}};
 const doc={getElementById(id){return els[id]||null;},
  createElement(tag){
   assert.ok(['option','p','div','span','a','small'].includes(tag));
   return element(tag);
  },
  body:{appendChild(){}}
 };
 vm.runInNewContext(source,{window:win,document:doc,location:{
  href:'https://qa.example.test/app#documents',hash:'#documents',replace(){}
 },history:{replaceState(){}},fetch,URL,Response,Blob,AbortController,
 crypto,console,setTimeout(){}},{filename:'documents.js'});
 return {els,calls,waiting,windowEvents,flush};
}
function finish(item,body,status=200){item.resolve(Response.json(body,{status}));}

test('R155 stored file search is explicit, per-Matter, and shows only response filenames',async()=>{
 const h=harness();
 await flush();
 assert.equal(h.waiting.length,1);
 finish(h.waiting[0],{documents:[],search_scope:'file_name_only',has_more:false});
 await flush();
 const search=h.els['qa-document-search'];
 search.value='hop dong';
 assert.equal(h.waiting.length,1,'typing alone should not send any file metadata');
 h.els['qa-document-search-run'].fire('click');
 assert.equal(h.waiting.length,2);
 const req=h.waiting[1];
 assert.match(req.url,new RegExp('matter_id='+MATTER));
 assert.match(req.url,/q=hop%20dong/);
 assert.equal(req.opts.credentials,'same-origin');
 assert.equal(req.opts.cache,'no-store');
 finish(req,{documents:[record('<script>safe file.pdf</script>')],
  search_scope:'file_name_only',has_more:false});
 await flush();
 const rows=h.els['qa-document-list'].children;
 assert.equal(rows.length,1);
 assert.equal(rows[0].children[0].textContent,
  '<script>safe file.pdf</script> · Chưa kiểm chứng nội dung · 1 KB',
  'document name must be inert textContent, not HTML');
});

test('R155 stale search response cannot overwrite a later query result or tenant change',async()=>{
 const h=harness();
 await flush();
 const query=h.els['qa-document-search'];
 query.value='hop dong';
 h.els['qa-document-search-run'].fire('click');
 const stale=h.waiting[1];
 query.value='phu luc';
 h.els['qa-document-search-run'].fire('click');
 const current=h.waiting[2];
 assert.equal(stale.opts.signal.aborted,true,'previous search must be cancelled');
 finish(current,{documents:[record('Phu luc 02.pdf')],
  search_scope:'file_name_only',has_more:false});
 await flush();
 finish(stale,{documents:[record('Old matter file.pdf')],
  search_scope:'file_name_only',has_more:false});
 await flush();
 assert.equal(h.els['qa-document-list'].children.length,1);
 assert.match(h.els['qa-document-list'].children[0].children[0].textContent,/Phu luc/);
 assert.ok(!h.els['qa-document-list'].children[0].children[0].textContent.includes('Old'));
 h.windowEvents['ai-law:workspace-switch']();
 assert.equal(h.els['qa-document-list'].children.length,0);
 assert.equal(h.els['qa-document-search'].value,'');
});

test('R155 one-character query is blocked locally without any file search request',async()=>{
 const h=harness();
 await flush();
 const search=h.els['qa-document-search'];search.value='h';
 h.els['qa-document-search-run'].fire('click');
 assert.equal(h.waiting.length,1);
 assert.match(h.els['document-feedback'].textContent,/2–80 ký tự/);
});

test('R155 stale search with cached HTML missing new search controls keeps document panel alive',async()=>{
 const old=source;
 const ids=['document-matter','document-upload-form','document-file','qa-document-list'];
 const els=Object.fromEntries(ids.map(x=>[x,element(x)]));
 els['document-upload-form'].querySelector=()=>element('submit');
 vm.runInNewContext(old,{window:{addEventListener(){}},
  document:{getElementById(id){return els[id]||null;},
   createElement(tag){return element(tag);}},
  location:{href:'https://qa.example.test/app#other',hash:'#other'},
  history:{replaceState(){}},fetch:async()=>Response.json({documents:[]}),
  URL,Response,Blob,console,setTimeout(){}},{filename:'documents.js'});
 assert.equal(typeof els['document-file'].listeners.change,'function',
  'old cached HTML must preserve existing file selection behavior');
});

test('R155 switching Matter clears prior filename query and drops stale results',async()=>{
 const h=harness();
 await flush();
 const query=h.els['qa-document-search'];
 query.value='hop dong';
 h.els['qa-document-search-run'].fire('click');
 const stale=h.waiting.at(-1);
 const nextMatter='77777777-7777-4777-8777-777777777777';
 h.els['document-matter'].value=nextMatter;
 h.els['document-matter'].fire('change');
 assert.equal(query.value,'');
 assert.match(h.waiting.at(-1).url,new RegExp('matter_id='+nextMatter));
 assert.equal(h.waiting.at(-1).url.includes('&q='),false);
 const fresh=h.waiting.at(-1);
 finish(fresh,{documents:[record('New matter receipt.pdf')],
  search_scope:'file_name_only',has_more:false});
 await flush();
 finish(stale,{documents:[record('Former Matter private receipt.pdf')],
  search_scope:'file_name_only',has_more:false});
 await flush();
 assert.equal(h.els['qa-document-list'].children.length,1);
 assert.match(h.els['qa-document-list'].children[0].children[0].textContent,
  /New matter receipt/);
 assert.ok(!h.els['qa-document-list'].children[0].children[0].textContent.includes('Former'));
});
