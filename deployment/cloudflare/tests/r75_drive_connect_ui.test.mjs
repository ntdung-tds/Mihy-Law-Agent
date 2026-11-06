import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const code=readFileSync(new URL('../../../web/r0-preview/documents.js',import.meta.url),'utf8');
const GOOGLE='https://accounts.google.com/o/oauth2/v2/auth?client_id=synthetic';
function element(id){
 return {
  id,textContent:'',hidden:id==='drive-connect',disabled:false,
  value:'',dataset:{},options:[],listeners:{},
  addEventListener(name,fn){this.listeners[name]=fn;},
  replaceChildren(){this.options=[];},
  append(x){this.options.push(x);},
  querySelector(){return null;}
 };
}
async function mount(status,{query='',connectResponse={authorization_url:GOOGLE}}={}){
 const ids=['document-matter','document-upload-form','document-file','document-feedback',
  'qa-document-list','drive-setup','drive-status','drive-connect'];
 const els=Object.fromEntries(ids.map(x=>[x,element(x)]));
 const submit=element('submit');
 els['document-upload-form'].querySelector=()=>submit;
 const calls=[],assignments=[],historyUrls=[];
 const location={
  href:'https://ai-law-web-qa.iaict-platform.workers.dev/app'+query+'#documents',
  hash:'#documents',
  assign(url){assignments.push(url);},
  replace(url){assignments.push(url);}
 };
 const document={
  getElementById(id){return els[id]||null;},
  createElement(tag){if(tag!=='option')throw Error('Unexpected HTML node');return element(tag);}
 };
 const fetch=async(url,opts)=>{
  calls.push({url,method:opts?.method||'GET'});
  if(url==='/api/qa/drive/status')return Response.json(status);
  if(url==='/api/qa/matters')return Response.json({matters:[]});
  if(url==='/api/qa/drive/connect')return Response.json(connectResponse);
  throw Error('Unexpected endpoint '+url);
 };
 const window={addEventListener(){}};
 vm.runInNewContext(code,{document,window,location,history:{replaceState(_a,_b,url){historyUrls.push(url);}},
  fetch,URL,Response,console},{filename:'documents.js'});
 await new Promise(resolve=>setImmediate(resolve));
 return {els,submit,calls,assignments,historyUrls};
}

test('unconfigured OAuth shows operator-only setup status without a broken consent button',async()=>{
 const t=await mount({connected:false,configuration_ready:false,can_connect:true});
 assert.equal(t.els['drive-connect'].hidden,true);
 assert.equal(t.submit.disabled,true);
 assert.match(t.els['drive-status'].textContent,/đang hoàn tất cấu hình/);
 assert.equal(t.els['drive-setup'].dataset.state,'setup');
});
test('ready admin has one-step Google redirect and no credential form',async()=>{
 const t=await mount({connected:false,configuration_ready:true,can_connect:true});
 const button=t.els['drive-connect'];
 assert.equal(button.hidden,false);
 assert.equal(t.submit.disabled,true);
 await button.listeners.click();
 assert.deepEqual(t.assignments,[GOOGLE]);
 assert.equal(t.calls.filter(c=>c.url==='/api/qa/drive/connect'&&c.method==='POST').length,1);
});
test('Google cancel returns to documents with retry and cleaned result URL',async()=>{
 const t=await mount({connected:false,configuration_ready:true,can_connect:true},
  {query:'?drive=failed&issue=consent'});
 assert.equal(t.els['drive-connect'].hidden,false);
 assert.match(t.els['drive-status'].textContent,/Google chưa cấp quyền/);
 assert.deepEqual(t.historyUrls,['/app#documents']);
 assert.equal(t.calls.some(c=>c.url==='/api/qa/matters'),true);
});
test('successful consent is verified by server status; upload enabled only if connected',async()=>{
 const t=await mount({connected:true,configuration_ready:true,can_connect:true},
  {query:'?drive=connected'});
 assert.equal(t.els['drive-connect'].hidden,true);
 assert.equal(t.submit.disabled,false);
 assert.equal(t.els['drive-setup'].dataset.state,'connected');
 assert.deepEqual(t.historyUrls,['/app#documents']);
});
test('non-admin cannot start tenant Google grant',async()=>{
 const t=await mount({connected:false,configuration_ready:true,can_connect:false});
 assert.equal(t.els['drive-connect'].hidden,true);
 assert.match(t.els['drive-status'].textContent,/quản trị đơn vị/i);
});
test('unsafe redirect from API is refused and shown as an actionable error',async()=>{
 const t=await mount({connected:false,configuration_ready:true,can_connect:true},
  {connectResponse:{authorization_url:'https://malicious.example.test/authorize'}});
 await t.els['drive-connect'].listeners.click();
 assert.deepEqual(t.assignments,[]);
 assert.equal(t.els['drive-setup'].dataset.state,'error');
});

test('drive failure after Google consent explains the missing Drive API setup and clears callback query',async()=>{
 const t=await mount({connected:false,configuration_ready:true,can_connect:true},
  {query:'?drive=failed&issue=drive'});
 assert.equal(t.els['drive-connect'].hidden,false);
 assert.match(t.els['drive-status'].textContent,/Google Drive API/);
 assert.deepEqual(t.historyUrls,['/app#documents']);
});
test('expired QA session during OAuth is explained without revealing a token',async()=>{
 const t=await mount({connected:false,configuration_ready:true,can_connect:true},
  {query:'?drive=failed&issue=session'});
 assert.match(t.els['drive-status'].textContent,/Phiên đăng nhập AI Law/);
 assert.equal(t.els['drive-setup'].dataset.state,'disconnected');
 assert.deepEqual(t.historyUrls,['/app#documents']);
});
