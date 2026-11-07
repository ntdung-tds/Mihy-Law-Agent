import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
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
async function mount(status,{query='',connectResponse={authorization_url:GOOGLE},confirmDisconnect=true,directUpload=false,directStartError=null}={}){
 const ids=['document-matter','document-upload-form','document-file','document-file-name','document-feedback',
  'qa-document-list','drive-setup','drive-status','drive-connect','drive-disconnect',
  'document-google-authorize','document-google-status','drive-blob-test'];
 const els=Object.fromEntries(ids.map(x=>[x,element(x)]));
 const submit=element('submit');
 els['document-upload-form'].querySelector=()=>submit;
 els['drive-blob-test'].dataset.googleClientId='748514165913-petg8vmsa7cvkmvutothq5g8keocuvga.apps.googleusercontent.com';
 const calls=[],assignments=[],historyUrls=[],confirmations=[];
 const currentStatus={...status};
 const location={
  href:'https://ai-law-web-qa.iaict-platform.workers.dev/app'+query+'#documents',
  hash:'#documents',
  assign(url){assignments.push(url);},
  replace(url){assignments.push(url);}
 };
 const document={
  getElementById(id){return els[id]||null;},
  createElement(tag){if(!['option','p','div','span','a','small'].includes(tag))throw Error('Unexpected HTML node');return element(tag);}
 };
 const fetch=async(url,opts)=>{
  calls.push({url,method:opts?.method||'GET'});
  if(url==='/api/qa/drive/status')return Response.json(currentStatus);
  if(url==='/api/qa/drive/disconnect'){
   currentStatus.connected=false;currentStatus.connected_at=null;
   return Response.json({connected:false,disconnected:true,files_preserved:true});
  }
  if(url==='/api/qa/matters')return Response.json({matters:[]});
  if(directUpload&&directStartError&&url==='/api/qa/documents/upload/start')
   return Response.json(directStartError,{status:503});
  if(directUpload&&url==='/api/qa/documents/upload/start')
   return Response.json({ticket:'55555555-5555-4555-8555-555555555555',
    drive_folder_id:'syntheticQAroot_12345'});
  if(directUpload&&typeof url==='string'&&url.startsWith('https://www.googleapis.com/upload/drive/v3/files?'))
   return Response.json({id:'syntheticRemoteDriveId1234'});
  if(directUpload&&url==='/api/qa/documents/upload/finish')
   return Response.json({id:'55555555-5555-4555-8555-555555555555',status:'unverified'},{status:201});
  if(directUpload&&typeof url==='string'&&url.startsWith('/api/qa/documents?'))
   return Response.json({documents:[]});
  if(url==='/api/qa/drive/connect')return Response.json(connectResponse);
  throw Error('Unexpected endpoint '+url);
 };
 const window={addEventListener(){},
  google:{accounts:{oauth2:{initTokenClient(config){return{requestAccessToken(){
   config.callback({access_token:'synthetic-google-browser-token',expires_in:3600});
  }};}}}},
  confirm(text){confirmations.push(text);return confirmDisconnect;}};
 vm.runInNewContext(code,{document,window,location,history:{replaceState(_a,_b,url){historyUrls.push(url);}},
  fetch,URL,Response,Blob,console,crypto:webcrypto,Uint8Array,TextDecoder},{filename:'documents.js'});
 await new Promise(resolve=>setImmediate(resolve));
 return {els,submit,calls,assignments,historyUrls,confirmations};
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
 assert.equal(t.submit.disabled,true,'direct upload also requires browser Google consent');
 assert.equal(t.els['document-google-authorize'].hidden,false);
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

test('R79 mobile document picker displays selected filename without native overflowing control',async()=>{
 const t=await mount({connected:true,configuration_ready:true,can_connect:true});
 const name='synthetic-long-qa-file-name-for-small-screen-test.docx';
 t.els['document-file'].files=[{name,size:4200}];
 t.els['document-file'].listeners.change();
 assert.equal(t.els['document-file-name'].textContent,name);
 t.els['document-file'].files=[];
 t.els['document-file'].listeners.change();
 assert.equal(t.els['document-file-name'].textContent,'Chưa có tệp được chọn');
});
test('R79 oversized documents are rejected before upload and explained on the form',async()=>{
 const t=await mount({connected:true,configuration_ready:true,can_connect:true});
 t.els['document-matter'].value='44444444-4444-4444-8444-444444444444';
 t.els['document-file'].files=[{name:'synthetic-big.docx',size:1600000}];
 await t.els['document-upload-form'].listeners.submit({preventDefault(){}});
 assert.equal(t.els['document-feedback'].dataset.state,'error');
 assert.match(t.els['document-feedback'].textContent,/1,5 MB/);
 assert.equal(t.calls.some(x=>x.url==='/api/qa/documents'&&x.method==='POST'),false);
});
test('R79 upload controls use accessible file label, 16px select and mobile wrapping rules',()=>{
 const html=readFileSync(new URL('../../../web/r0-preview/index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../../../web/r0-preview/styles.css',import.meta.url),'utf8');
 assert.match(html,/id="document-file-name"/);
 assert.match(html,/class="qa-document-picker"/);
 assert.match(html,/for="document-file"/);
 assert.match(html,/aria-describedby="document-file-name document-file-hint"/);
 assert.match(css,/\.qa-document-file-input:focus-visible\+\.qa-document-file-control/);
 assert.match(css,/#document-matter\{[^}]*font-size:16px/);
 assert.match(css,/@media\(max-width:600px\)[\s\S]*\.qa-document-file-name\{[^}]*overflow-wrap:anywhere/);
});

test('R80 connected owner sees disconnect control and a confirmation, then reconnect option',async()=>{
 const t=await mount({connected:true,configuration_ready:true,can_connect:true});
 assert.equal(t.els['drive-disconnect'].hidden,false);
 assert.equal(t.els['drive-connect'].hidden,true);
 await t.els['drive-disconnect'].listeners.click();
 assert.equal(t.confirmations.length,1);
 assert.match(t.confirmations[0],/Tệp trên Google Drive không bị xóa/);
 assert.equal(t.calls.filter(x=>x.url==='/api/qa/drive/disconnect'&&x.method==='POST').length,1);
 assert.equal(t.els['drive-disconnect'].hidden,true);
 assert.equal(t.els['drive-connect'].hidden,false);
 assert.equal(t.els['drive-setup'].dataset.state,'disconnected');
 assert.match(t.els['drive-status'].textContent,/Đã ngắt kết nối/);
 assert.equal(t.submit.disabled,true);
});
test('R80 canceled user confirmation does not call disconnect endpoint',async()=>{
 const t=await mount({connected:true,configuration_ready:true,can_connect:true},
  {confirmDisconnect:false});
 await t.els['drive-disconnect'].listeners.click();
 assert.equal(t.calls.some(x=>x.url==='/api/qa/drive/disconnect'),false);
 assert.equal(t.els['drive-setup'].dataset.state,'connected');
 assert.equal(t.submit.disabled,true,'browser token is not granted yet');
});
test('R80 organization non-admin and disconnected workspaces never show disconnect',async()=>{
 for(const state of [{connected:true,configuration_ready:true,can_connect:false},
  {connected:false,configuration_ready:true,can_connect:true}]){
  const t=await mount(state);
  assert.equal(t.els['drive-disconnect'].hidden,true);
 }
});
test('R80 both desktop and mobile styles include safe secondary disconnect and HTML control',()=>{
 const html=readFileSync(new URL('../../../web/r0-preview/index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../../../web/r0-preview/styles.css',import.meta.url),'utf8');
 assert.match(html,/id="drive-disconnect" hidden/);
 assert.match(css,/#drive-disconnect\[hidden\]\{display:none!important\}/);
 assert.match(css,/@media\(max-width:600px\)[\s\S]*#drive-disconnect/);
});

test('R99 MatterACL PDF uploads with proven Google multipart POST, then verifies D1 receipt',async()=>{
 const t=await mount({connected:true,configuration_ready:true,can_connect:true},{directUpload:true});
 const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF\n');
 t.els['document-matter'].value='44444444-4444-4444-8444-444444444444';
 t.els['document-file'].files=[{name:'qa_gpt.pdf',size:bytes.length,
  async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}}];
 await t.els['document-google-authorize'].listeners.click();
 assert.equal(t.submit.disabled,false,'tenant grant + browser Google consent required');
 await t.els['document-upload-form'].listeners.submit({preventDefault(){}});
 const starts=t.calls.filter(x=>x.url==='/api/qa/documents/upload/start');
 const finishes=t.calls.filter(x=>x.url==='/api/qa/documents/upload/finish');
 const direct=t.calls.filter(x=>String(x.url).startsWith('https://www.googleapis.com/upload/drive/v3/files?'));
 assert.equal(starts.length,1);
 assert.equal(direct.length,1);
 assert.equal(direct[0].method,'POST');
 assert.equal(finishes.length,1);
 assert.equal(t.calls.some(x=>x.url==='/api/qa/documents'&&x.method==='POST'),false);
 assert.equal(t.els['document-feedback'].dataset.state,'success',t.els['document-feedback'].textContent);
});
test('R88 real QA start failure shows bounded stage, provider HTTP and reason, never secrets',async()=>{
 const t=await mount({connected:true,configuration_ready:true,can_connect:true},{
  directUpload:true,directStartError:{
   code:'DRIVE_UPLOAD_UNAVAILABLE',error:'Google Drive chưa hoàn tất tải tệp.',
   stage:'provider',provider_status:403,provider_reason:'insufficientFilePermissions',
   access_token:'MUST_NOT_RENDER',upload_url:'MUST_NOT_RENDER'
  }
 });
 const bytes=new TextEncoder().encode('%PDF-1.4\\n1 0 obj\\n<< >>\\nendobj\\n%%EOF\\n');
 t.els['document-matter'].value='44444444-4444-4444-8444-444444444444';
 t.els['document-file'].files=[{name:'qa_gpt.pdf',size:bytes.length,
  async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}}];
 await t.els['document-google-authorize'].listeners.click();
 await t.els['document-upload-form'].listeners.submit({preventDefault(){}});
 const msg=t.els['document-feedback'].textContent;
 assert.equal(t.els['document-feedback'].dataset.state,'error');
 assert.match(msg,/stage=provider/);
 assert.match(msg,/HTTP 403/);
 assert.match(msg,/insufficientFilePermissions/);
 assert.match(msg,/Thiếu quyền ghi/);
 assert.doesNotMatch(msg,/MUST_NOT_RENDER/);
 assert.equal(t.calls.filter(x=>x.url==='/api/qa/documents/upload/start').length,1);
 assert.equal(t.calls.some(x=>String(x.url).includes('upload_id=')),false);
});
test('R88 transport failures show stage without implying a mobile connection defect',async()=>{
 const t=await mount({connected:true,configuration_ready:true,can_connect:true},{
  directUpload:true,directStartError:{code:'DRIVE_UPLOAD_UNAVAILABLE',stage:'transport',
   error:'Google Drive chưa hoàn tất tải tệp.'}
 });
 const bytes=new TextEncoder().encode('%PDF-1.4\\n1 0 obj\\n<< >>\\nendobj\\n%%EOF\\n');
 t.els['document-matter'].value='44444444-4444-4444-8444-444444444444';
 t.els['document-file'].files=[{name:'qa_gpt.pdf',size:bytes.length,
  async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}}];
 await t.els['document-google-authorize'].listeners.click();
 await t.els['document-upload-form'].listeners.submit({preventDefault(){}});
 assert.match(t.els['document-feedback'].textContent,/stage=transport/);
 assert.doesNotMatch(t.els['document-feedback'].textContent,/đường truyền.*ổn định/i);
});

test('R96 deleted Google OAuth client is intercepted before navigation and users are directed to safe direct QA',async()=>{
 const deleted='873907439100-vlno9kus5k18ikvfgj6smodoho71djsg.apps.googleusercontent.com';
 const url='https://accounts.google.com/o/oauth2/v2/auth?client_id='+deleted+'&response_type=code';
 const t=await mount({connected:false,configuration_ready:true,can_connect:true},
  {connectResponse:{authorization_url:url}});
 await t.els['drive-connect'].listeners.click();
 assert.deepEqual(t.assignments,[],'must not navigate to Google 401 deleted_client');
 assert.equal(t.els['drive-setup'].dataset.state,'error');
 assert.match(t.els['drive-status'].textContent,/OAuth Client đã bị xóa/);
 assert.match(t.els['drive-status'].textContent,/Client Secret mới/);
 assert.match(t.els['drive-status'].textContent,/tệp thử chưa được gắn/);
 assert.equal(t.calls.filter(x=>x.url==='/api/qa/drive/connect').length,1);
});

test('R96 new Google OAuth client remains allowed when backend credentials are updated',async()=>{
 const newClient='748514165913-k1paechitoq2ds8337ondc1q2smk8dut.apps.googleusercontent.com';
 const url='https://accounts.google.com/o/oauth2/v2/auth?client_id='+newClient+'&response_type=code';
 const t=await mount({connected:false,configuration_ready:true,can_connect:true},
  {connectResponse:{authorization_url:url}});
 await t.els['drive-connect'].listeners.click();
 assert.deepEqual(t.assignments,[url],'new valid client is not blocked');
});
