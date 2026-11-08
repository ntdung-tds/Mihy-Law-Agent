import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('web/r0-preview/index.html','utf8');
const app=readFileSync('web/r0-preview/app.js','utf8');
const legal=readFileSync('web/r0-preview/legal.js','utf8');
const css=readFileSync('web/r0-preview/styles.css','utf8');
const ids=Array.from({length:11},(_,i)=>'UC'+String(i+1).padStart(2,'0'));

test('R112: 11 menu actions navigate to distinct task routes, never the shared assistant view',()=>{
 for(const uc of ids){
  assert.match(html,new RegExp('data-feature-jump="'+uc+'"'));
  assert.match(html,new RegExp('data-feature="'+uc+'"'));
 }
 assert.match(app,/goto\('uc-'\s*\+/);
 assert.match(app,/hashchange/);
 assert.match(app,/workflow-open/);
 assert.doesNotMatch(app,/goto\('overview'\); closeFunctionDrawer\(false\);[\s\S]{0,140}scrollIntoView/);
});
test('R112: the QA form belongs to exactly one isolated workflow screen with a dedicated heading',()=>{
 assert.equal((html.match(/id="legal-qa-form"/g)||[]).length,1);
 assert.match(html,/id="view-workflow"[^>]*data-panel="workflow"/);
 const assistant=html.indexOf('id="view-assistant"');
 const workflow=html.indexOf('id="view-workflow"');
 const research=html.indexOf('id="view-research"');
 const form=html.indexOf('id="legal-qa-form"');
 assert.ok(assistant>=0&&workflow>assistant&&research>workflow&&form>workflow&&form<research);
 assert.match(html,/id="workflow-title"/);
 assert.match(html,/id="workflow-stage"/);
 assert.match(html,/id="workflow-back"/);
 assert.match(css,/view-workflow/);
});
test('R113 P0 regression: all routed panels are true siblings, never nested inside a hidden assistant',()=>{
 const sectionStack=[];
 const opened=new Set();
 const closed=new Set();
 const tags=html.matchAll(/<\/?section\b[^>]*>/g);
 for(const match of tags){
  const tag=match[0];
  if(tag.startsWith('</')){
   assert.ok(sectionStack.length>0,'Orphan closing section');
   const id=sectionStack.pop();
   if(id)closed.add(id);
  }else{
   const id=tag.match(/\bid="(view-[^"]+)"/)?.[1]||null;
   if(id){
     assert.ok(!sectionStack.some(x=>x?.startsWith('view-')),
       id+' must not be nested in an invisible parent view panel');
     opened.add(id);
   }
   sectionStack.push(id);
  }
 }
 assert.equal(sectionStack.length,0,'All routed section tags must close correctly');
 assert.deepEqual([...opened].sort(),
  ['view-overview','view-documents','view-assistant','view-workflow','view-research'].sort());
 assert.deepEqual([...closed].sort(),[...opened].sort());
 assert.match(html,/<button[^>]*id="workflow-back"[^>]*data-go="assistant"/);
});

test('R112: deep links, safe switching, and task-specific fields do not reuse prior results or input',()=>{
 assert.match(app,/uc-\(UC/);
 assert.match(legal,/ai-law:workflow-open/);
 assert.match(legal,/clearResult\(\)/);
 assert.match(legal,/legal-qa-consent/);
 assert.match(legal,/legal-qa-source/);
 assert.match(legal,/legal-qa-source-b/);
});

test('R112: actual router opens 11 distinct task panels, updates heading and supports Back',async()=>{
 const {runInNewContext}=await import('node:vm');
 const clickers=new Map(),nodes=new Map(),events=new Map();
 const make=(id='',dataset={})=>{
  const listeners=new Map();
  const node={
   id,dataset,hidden:false,disabled:false,value:'',style:{},
   textContent:'',classList:{toggle(){},remove(){},add(){}},
   setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},
   addEventListener(k,fn){listeners.set(k,fn);},
   fire(k){listeners.get(k)?.({preventDefault(){},key:'',target:this});},
   replaceChildren(){},append(){},focus(){},scrollIntoView(){},
   querySelectorAll(){return [];}
  };
  if(id)nodes.set(id,node);
  return node;
 };
 const panels=['overview','documents','assistant','workflow','research'].map(p=>make('view-'+p,{panel:p}));
 const nav=['overview','documents','assistant','research'].map(p=>make('',{view:p}));
 const tasks=ids.map(uc=>make('',{featureJump:uc}));
 const go=[make('workflow-back',{go:'assistant'})];
 const noops=new Map();
 const needed=['function-drawer','drawer-backdrop','rail-features','desktop-features','drawer-close',
 'breadcrumb-current','recent-documents','document-list','document-search','empty-docs',
 'search-shortcut','matter-search','notifications','side-guide','sidebar-explore','modal-close',
 'modal-ack','modal-backdrop','modal-title','modal-description','modal-meta','upload-btn',
 'local-file','chat-input','chat-form','chat-preview-reply','research-form',
 'today-date','year','toast','workflow-title','workflow-code','workflow-stage','workflow-summary'];
 for(const id of needed)make(id);
 const root={
  body:{style:{},classList:{add(){},remove(){}}},
  activeElement:null,
  querySelector(q){return q.startsWith('#')?nodes.get(q.slice(1))??null:null;},
  querySelectorAll(q){
   if(q==='[data-panel]')return panels;
   if(q==='[data-view]')return nav;
   if(q==='[data-feature-jump]')return tasks;
   if(q==='[data-go]')return go;
   return [];
  },
  createElement(){return make();},
  createElementNS(){return make();}
 };
 let current='#overview';
 const seen=[];
 const window={
  addEventListener(k,fn){const old=events.get(k)||[];old.push(fn);events.set(k,old);},
  dispatchEvent(evt){for(const fn of events.get(evt.type)||[])fn(evt);return true;},
  scrollTo(){},history:{replaceState(){}},
  get location(){return location;}
 };
 const location={
  get hash(){return current;},
  set hash(h){current=h;window.dispatchEvent({type:'hashchange'});}
 };
 const Event=class{constructor(type){this.type=type;}};
 const CustomEvent=class extends Event{constructor(type,opts){super(type);this.detail=opts?.detail;}};
 window.addEventListener('ai-law:workflow-open',ev=>seen.push(ev.detail.uc));
 const timers=[];
 runInNewContext(app,{document:root,window,location,Event,CustomEvent,
   setTimeout:(cb)=>{timers.push(cb);return 1;},clearTimeout(){},
   Intl,Date,console});
 for(const uc of ids){
  tasks.find(n=>n.dataset.featureJump===uc).fire('click');
  assert.equal(current,'#uc-'+uc,'direct route: '+uc);
  assert.equal(panels.find(n=>n.dataset.panel==='workflow').hidden,false);
  assert.equal(panels.find(n=>n.dataset.panel==='assistant').hidden,true);
  assert.equal(nodes.get('workflow-code').textContent,uc);
  assert.ok(nodes.get('workflow-title').textContent.length>=8);
  assert.equal(nodes.get('breadcrumb-current').textContent,nodes.get('workflow-title').textContent);
 }
 assert.deepEqual(seen,ids);
 go[0].fire('click');
 assert.equal(current,'#assistant');
 assert.equal(panels.find(n=>n.dataset.panel==='workflow').hidden,true);
 assert.equal(panels.find(n=>n.dataset.panel==='assistant').hidden,false);
 location.hash='#uc-UC03';
 assert.equal(nodes.get('workflow-code').textContent,'UC03');
 location.hash='#uc-UC12';
 assert.equal(panels.find(n=>n.dataset.panel==='overview').hidden,false);
});
