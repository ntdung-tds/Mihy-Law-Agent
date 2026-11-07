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
  setAttribute(){},removeAttribute(){},click(){this.clicked=true;},remove(){},
  replaceChildren(){this.options=[];},
  append(...x){this.options.push(...x);if(this.id==='document-matter'&&this.options.length===2)this.value=x[0].value;},
  querySelector(){return null;},
  showModal(){this.open=true;},close(){this.open=false;}
 };
}
async function mount(status,{query='',connectResponse={authorization_url:GOOGLE},confirmDisconnect=true,directUpload=false,directStartError=null,directGoogleError='',downloadCase=null,storageSelection=false,saveChoice='root'}={}){
 const ids=['document-matter','document-upload-form','document-file','document-file-name','document-feedback',
  'qa-document-list','drive-setup','drive-status','drive-connect','drive-disconnect',
  'document-google-status','drive-blob-test','document-save-dialog',
  'document-save-root','document-save-folder','document-save-cancel'];
 if(storageSelection)ids.push('document-storage-provider','document-destination','document-storage-hint',
  'storage-admin-controls','storage-folder-name','storage-create','storage-member','storage-assign','storage-revoke');
 const els=Object.fromEntries(ids.map(x=>[x,element(x)]));
 els['document-save-dialog'].showModal=()=>{
  els['document-save-dialog'].open=true;
  setImmediate(()=>{
   if(saveChoice==='root')els['document-save-root'].onclick?.();
   else if(saveChoice==='cancel')els['document-save-cancel'].onclick?.();
   else if(saveChoice==='folder')els['document-save-folder'].onclick?.();
  });
 };
 const submit=element('submit');
 const pending=[];
 els['document-upload-form'].querySelector=()=>submit;
 els['document-upload-form'].requestSubmit=()=>{
  pending.push(Promise.resolve(els['document-upload-form'].listeners.submit({preventDefault(){}})));
 };
 els['drive-blob-test'].dataset.googleClientId='748514165913-petg8vmsa7cvkmvutothq5g8keocuvga.apps.googleusercontent.com';
 const calls=[],assignments=[],historyUrls=[],confirmations=[],savedFiles=[],savedBlobs=[],googleGrants=[];
 const downloadUuid='66666666-6666-4666-8666-666666666666';
 const matterUuid='44444444-4444-4444-8444-444444444444';
 const raw=downloadCase?.original||new Uint8Array();
 const hash=downloadCase?Buffer.from(await webcrypto.subtle.digest('SHA-256',raw)).toString('hex'):'';
 const record={id:downloadUuid,name:downloadCase?.name||'qa_gpt.pdf',mime_type:'application/pdf',bytes:raw.length,sha256:hash};
 const currentStatus={...status};
 const location={
  href:'https://ai-law-web-qa.iaict-platform.workers.dev/app'+query+'#documents',
  hash:'#documents',
  assign(url){assignments.push(url);},
  replace(url){assignments.push(url);}
 };
 const document={
  body:{appendChild(node){savedFiles.push(node);}},
  getElementById(id){return els[id]||null;},
  createElement(tag){if(!['option','p','div','span','a','small'].includes(tag))throw Error('Unexpected HTML node');return element(tag);}
 };
 const fetch=async(url,opts)=>{
  calls.push({url,method:opts?.method||'GET',headers:opts?.headers||{},body:opts?.body});
  if(url==='/api/qa/drive/status')return Response.json(currentStatus);
  if(storageSelection&&url==='/api/qa/storage/destinations')
   return Response.json({destinations:[{id:'77777777-7777-4777-8777-777777777777',
    label:'Hồ sơ luật sư A',provider:'google_drive',kind:'organization',assigned:true}],can_manage:false,
    providers:{google_drive:true,onedrive:false}});
  if(url==='/api/qa/drive/disconnect'){
   currentStatus.connected=false;currentStatus.connected_at=null;
   return Response.json({connected:false,disconnected:true,files_preserved:true});
  }
  if(url==='/api/qa/matters')return Response.json({matters:downloadCase?[{id:matterUuid,title:'Synthetic QA'}]:[]});
  if(downloadCase&&typeof url==='string'&&url.startsWith('/api/qa/documents?'))
   return Response.json({documents:[record]});
  if(downloadCase&&typeof url==='string'&&url.endsWith('/download')){
   if(downloadCase.httpError)return Response.json({error:'denied'},{status:downloadCase.httpError,headers:{'Content-Type':'application/json'}});
   const bytes=downloadCase.received||raw;
   return new Response(bytes,{headers:{'Content-Type':downloadCase.mime||'application/pdf','Content-Length':String(bytes.length)}});
  }
  if(directUpload&&directStartError&&url==='/api/qa/documents/upload/start')
   return Response.json(directStartError,{status:503});
  if(url==='/api/qa/drive/picker-config')return Response.json({
   configured:true,api_key:'AIza'+'X'.repeat(35)});
  if(url==='/api/qa/storage/select')return Response.json({
   destination:{id:'77777777-7777-4777-8777-777777777777',
    label:'Shared Folder',provider:'google_drive'}});
  if(directUpload&&url==='/api/qa/documents/upload/start')
   return Response.json({ticket:'55555555-5555-4555-8555-555555555555',
    drive_folder_id:'syntheticQAroot_12345'});
  if(directUpload&&typeof url==='string'&&url.startsWith('https://www.googleapis.com/upload/drive/v3/files?')){
   if(directGoogleError==='network')throw Error('synthetic CORS/rejected fetch');
   if(directGoogleError==='403')return Response.json({error:'forbidden'},{status:403});
   return Response.json({id:'syntheticRemoteDriveId1234'});
  }
  if(directUpload&&url==='/api/qa/documents/upload/finish')
   return Response.json({id:'55555555-5555-4555-8555-555555555555',status:'unverified'},{status:201});
  if(directUpload&&typeof url==='string'&&url.startsWith('/api/qa/documents?'))
   return Response.json({documents:[]});
  if(url==='/api/qa/drive/connect')return Response.json(connectResponse);
  throw Error('Unexpected endpoint '+url);
 };
 const window={addEventListener(){},
  google:{accounts:{oauth2:{initTokenClient(config){return{requestAccessToken(overrides){
   googleGrants.push({clientId:config.client_id,scope:config.scope,prompt:overrides?.prompt});
   config.callback({access_token:'synthetic-google-browser-token',expires_in:3600});
  }};}}}},
  confirm(text){confirmations.push(text);return confirmDisconnect;}};
 if(saveChoice==='folder'){
  class DocsView{
   constructor(view){this.view=view;}
   setIncludeFolders(){return this;}
   setSelectFolderEnabled(){return this;}
   setEnableDrives(enabled){this.sharedDrivesOnly=enabled;return this;}
  }
  class PickerBuilder{
   constructor(){this.views=[];}
   setDeveloperKey(){return this;}
   setAppId(){return this;}
   setOAuthToken(){return this;}
   addView(view){this.views.push(view);return this;}
   setCallback(cb){this.cb=cb;return this;}
   build(){const cb=this.cb;return {setVisible(){cb({action:'picked',docs:[{id:'sharedTeamFolder123456'}]});}};}
  }
  window.google.picker={PickerBuilder,DocsView,
   ViewId:{FOLDERS:'folders'},Action:{PICKED:'picked',CANCEL:'cancel'},
   Response:{DOCUMENTS:'docs'},Document:{ID:'id'}};
 }
 class StubURL extends URL{
  static createObjectURL(blob){savedBlobs.push(blob);return 'blob:synthetic-verified-file';}
  static revokeObjectURL(){}
 }
 vm.runInNewContext(code,{document,window,location,history:{replaceState(_a,_b,url){historyUrls.push(url);}},
  fetch,URL:StubURL,Response,Blob,console,crypto:webcrypto,Uint8Array,TextDecoder,setTimeout(){}},{filename:'documents.js'});
 await new Promise(resolve=>setImmediate(resolve));
 return {els,submit,calls,assignments,historyUrls,confirmations,pending,savedFiles,savedBlobs,record,googleGrants};
}

 // The Save chooser now precedes OAuth. Synthetic Google callbacks can resume
 // a second submit in a microtask; wait for all resulting work to settle.
 async function settleSave(t){
  for(let i=0;i<8;i++){
   await new Promise(resolve=>setImmediate(resolve));
   await Promise.all(t.pending);
  }
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
 assert.equal(t.submit.disabled,false,'one Save action is available after tenant Drive connection');
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
 assert.equal(t.submit.disabled,false,'no extra Google permission control after top connection');
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

test('R102 connected Drive upload reuses Google consent and cached browser token across successive saves',async()=>{
 const t=await mount({connected:true,configuration_ready:true,can_connect:true},{directUpload:true});
 const original=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF\n');
 t.els['document-matter'].value='44444444-4444-4444-8444-444444444444';
 const form=t.els['document-upload-form'];
 for(const n of [1,2]){
  t.els['document-file'].files=[{name:'qa_'+n+'.pdf',size:original.length,
   async arrayBuffer(){return original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength);}}];
  await form.listeners.submit({preventDefault(){}});
  await settleSave(t);
  assert.equal(t.els['document-feedback'].dataset.state,'success',JSON.stringify({save:n,calls:t.calls.map(x=>x.url),grants:t.googleGrants.length,feedback:t.els['document-feedback'].textContent,dialog:t.els['document-save-dialog'].open,pending:t.pending.length,submitDisabled:t.submit.disabled}));
 }
 assert.equal(t.googleGrants.length,1,'never request a second Google account chooser in same browser session');
 assert.equal(t.googleGrants[0].prompt,'','do not force consent or select_account');
 assert.equal(t.googleGrants[0].scope,'https://www.googleapis.com/auth/drive.file');
 assert.equal(t.calls.filter(c=>c.url==='/api/qa/documents/upload/start').length,2);
 assert.equal(t.calls.filter(c=>String(c.url).includes('uploadType=multipart')).length,2);
 assert.equal(t.calls.filter(c=>c.url==='/api/qa/documents/upload/finish').length,2);
});

test('R99 MatterACL PDF uploads with proven Google multipart POST, then verifies D1 receipt',async()=>{
 const t=await mount({connected:true,configuration_ready:true,can_connect:true},{directUpload:true});
 const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF\n');
 t.els['document-matter'].value='44444444-4444-4444-8444-444444444444';
 t.els['document-file'].files=[{name:'qa_gpt.pdf',size:bytes.length,
  async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}}];

 assert.equal(t.submit.disabled,false,'tenant grant + browser Google consent required');
 await t.els['document-upload-form'].listeners.submit({preventDefault(){}});
 await settleSave(t);
 const starts=t.calls.filter(x=>x.url==='/api/qa/documents/upload/start');
 const finishes=t.calls.filter(x=>x.url==='/api/qa/documents/upload/finish');
 const direct=t.calls.filter(x=>String(x.url).startsWith('https://www.googleapis.com/upload/drive/v3/files?'));
 assert.equal(starts.length,1);
 assert.equal(direct.length,1);
 assert.equal(direct[0].method,'POST');
 assert.equal(direct[0].headers.Authorization,'Bearer synthetic-google-browser-token');
 assert.match(direct[0].headers['Content-Type'],/^multipart\/related; boundary=/);
 const payload=await direct[0].body.text();
 assert.match(payload,/"parents":\["syntheticQAroot_12345"\]/);
 assert.match(payload,/"ai_law_upload_ticket":"55555555-5555-4555-8555-555555555555"/);
 assert.match(payload,/%PDF-1.4/);
 const aiLawCalls=t.calls.filter(x=>String(x.url).startsWith('/api/qa/'));
 assert.ok(aiLawCalls.every(x=>!String(x.body||'').includes('%PDF-1.4')));
 assert.ok(aiLawCalls.every(x=>!String(x.body||'').includes('synthetic-google-browser-token')));
 assert.equal(finishes.length,1);
 assert.equal(t.calls.some(x=>x.url==='/api/qa/documents'&&x.method==='POST'),false);
 assert.equal(t.els['document-feedback'].dataset.state,'success',t.els['document-feedback'].textContent);
});
test('R99 ambiguous Google network failure never finalizes receipt or silently retries',async()=>{
 const t=await mount({connected:true,configuration_ready:true,can_connect:true},
  {directUpload:true,directGoogleError:'network'});
 const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF\n');
 t.els['document-matter'].value='44444444-4444-4444-8444-444444444444';
 t.els['document-file'].files=[{name:'qa_gpt.pdf',size:bytes.length,
  async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}}];

 await t.els['document-upload-form'].listeners.submit({preventDefault(){}});
 await settleSave(t);
 assert.equal(t.calls.filter(x=>x.url==='/api/qa/documents/upload/finish').length,0);
 assert.equal(t.calls.filter(x=>String(x.url).includes('uploadType=multipart')).length,1);
 assert.equal(t.submit.disabled,true,'no automatic retry on ambiguous Google response');
 assert.match(t.els['document-feedback'].textContent,/kiểm tra Drive trước khi thử lại/);
});

test('R99 browser Google 403 on organization root does not generate receipt',async()=>{
 const t=await mount({connected:true,configuration_ready:true,can_connect:true},
  {directUpload:true,directGoogleError:'403'});
 const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF\n');
 t.els['document-matter'].value='44444444-4444-4444-8444-444444444444';
 t.els['document-file'].files=[{name:'qa_gpt.pdf',size:bytes.length,
  async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}}];

 await t.els['document-upload-form'].listeners.submit({preventDefault(){}});
 await settleSave(t);
 assert.equal(t.calls.filter(x=>x.url==='/api/qa/documents/upload/finish').length,0);
 assert.match(t.els['document-feedback'].textContent,/quyền ghi thư mục.*HTTP 403/);
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

 await t.els['document-upload-form'].listeners.submit({preventDefault(){}});
 await settleSave(t);
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

 await t.els['document-upload-form'].listeners.submit({preventDefault(){}});
 await settleSave(t);
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

test('R100 downloaded original PDF is verified by byte size and SHA before mobile Blob save',async()=>{
 const original=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF\n');
 const t=await mount({connected:true,configuration_ready:true,can_connect:true},{downloadCase:{original}});
 const row=t.els['qa-document-list'].options.find(x=>x.className==='matter-row');
 assert.ok(row,'authenticated file list rendered');
 const link=row.options.find(x=>x.textContent==='Tải về');
 assert.ok(link);
 await link.listeners.click({preventDefault(){}});
 assert.equal(t.savedBlobs.length,1);
 assert.equal(t.savedFiles[0].download,'qa_gpt.pdf');
 assert.deepEqual(new Uint8Array(await t.savedBlobs[0].arrayBuffer()),original);
 assert.equal(t.els['document-feedback'].dataset.state,'success');
 assert.match(t.els['document-feedback'].textContent,/SHA-256/);
});
test('R100 inflated download response is rejected before saving a corrupted document',async()=>{
 const original=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF\n');
 const received=new Uint8Array(1600001);
 const t=await mount({connected:true,configuration_ready:true,can_connect:true},{downloadCase:{original,received}});
 const row=t.els['qa-document-list'].options.find(x=>x.className==='matter-row');
 const link=row.options.find(x=>x.textContent==='Tải về');
 await link.listeners.click({preventDefault(){}});
 assert.equal(t.savedBlobs.length,0,'never save too large or wrong response as a PDF');
 assert.equal(t.els['document-feedback'].dataset.state,'error');
 assert.match(t.els['document-feedback'].textContent,/vượt giới hạn/);
});
test('R100 a login or HTML response is not saved under the original PDF filename',async()=>{
 const original=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF\n');
 const t=await mount({connected:true,configuration_ready:true,can_connect:true},
  {downloadCase:{original,httpError:503}});
 const row=t.els['qa-document-list'].options.find(x=>x.className==='matter-row');
 await row.options.find(x=>x.textContent==='Tải về').listeners.click({preventDefault(){}});
 assert.equal(t.savedBlobs.length,0);
 assert.match(t.els['document-feedback'].textContent,/HTTP 503/);
});

test('R101 verified browser download keeps a safe (2) filename instead of rejecting it',async()=>{
 const original=new TextEncoder().encode('%PDF-1.4\\n1 0 obj\\n<< >>\\nendobj\\n%%EOF\\n');
 const t=await mount({connected:true,configuration_ready:true,can_connect:true},
  {downloadCase:{original,name:'SRS_Drive_gpt (2).pdf'}});
 const row=t.els['qa-document-list'].options.find(x=>x.className==='matter-row');
 assert.ok(row,'authenticated matter file listed');
 await row.options.find(x=>x.textContent==='Tải về').listeners.click({preventDefault(){}});
 assert.equal(t.savedBlobs.length,1,'valid numbered basename must not be blocked; feedback='+t.els['document-feedback'].textContent);
 assert.equal(t.savedFiles[0].download,'SRS_Drive_gpt (2).pdf');
 assert.deepEqual(new Uint8Array(await t.savedBlobs[0].arrayBuffer()),original);
 assert.match(t.els['document-feedback'].textContent,/SHA-256/);
});

test('R106 mobile Save opens destination chooser before triggering a Google sign-in screen',async()=>{
 const t=await mount({connected:true,configuration_ready:true,can_connect:true},
  {directUpload:true,saveChoice:'hold'});
 const raw=new TextEncoder().encode('%PDF-1.4\\n1 0 obj\\n<< >>\\nendobj\\n%%EOF\\n');
 t.els['document-matter'].value='44444444-4444-4444-8444-444444444444';
 t.els['document-file'].files=[{name:'qa_gpt.pdf',size:raw.length,
  async arrayBuffer(){return raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);}}];
 const pending=t.els['document-upload-form'].listeners.submit({preventDefault(){}});
 await Promise.resolve();
 assert.equal(t.els['document-save-dialog'].open,true,'destination selection opens on Save');
 assert.equal(t.googleGrants.length,0,'do not send the user to Google before choosing where to save');
 assert.equal(t.calls.filter(x=>x.url==='/api/qa/documents/upload/start').length,0,'no upload before location');
 t.els['document-save-cancel'].onclick();
 await pending;
 assert.equal(t.googleGrants.length,0,'cancel must never launch Google sign-in');
 assert.equal(t.calls.filter(x=>x.url==='/api/qa/documents/upload/start').length,0);
});

test('R104 Save presents one explicit destination choice and never preselects Google root',async()=>{
 const html=readFileSync(new URL('../../../web/r0-preview/index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../../../web/r0-preview/styles.css',import.meta.url),'utf8');
 assert.match(html,/id="document-save-dialog"/);
 assert.match(html,/id="document-save-root"/);
 assert.match(html,/id="document-save-folder"/);
 assert.doesNotMatch(html,/id="storage-member"/,'do not rebuild per-employee folder admin UI');
 assert.match(html,/<button type="submit">Lưu<\/button>/);
 assert.match(css,/\.qa-save-dialog::backdrop/);
 const ready={connected:true,configuration_ready:true,can_connect:true};
 const original=new TextEncoder().encode('%PDF-1.4\\n1 0 obj\\n<< >>\\nendobj\\n%%EOF\\n');
 const prepare=t=>{
  t.els['document-matter'].value='44444444-4444-4444-8444-444444444444';
  t.els['document-file'].files=[{name:'qa_gpt.pdf',size:original.length,
   async arrayBuffer(){return original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength);}}];
 };
 const canceled=await mount(ready,{directUpload:true,saveChoice:'cancel'});
 prepare(canceled);
 await canceled.els['document-upload-form'].listeners.submit({preventDefault(){}});
 await Promise.all(canceled.pending);
 // Flush simulated modal user cancellation before reading the network calls.
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(canceled.calls.filter(x=>x.url==='/api/qa/documents/upload/start').length,0);
 assert.match(canceled.els['document-feedback'].textContent,/Đã hủy lưu/);
 const chosen=await mount(ready,{directUpload:true,saveChoice:'root'});
 prepare(chosen);
 await chosen.els['document-upload-form'].listeners.submit({preventDefault(){}});
 await Promise.all(chosen.pending);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(chosen.els['document-feedback'].dataset.state,'success');
 const start=chosen.calls.find(x=>x.url==='/api/qa/documents/upload/start');
 assert.equal(JSON.parse(start.body).destination_id,'root','explicit My Drive selection, not silent fallback');
 assert.equal(chosen.googleGrants.length,1);
});


test('R104 real Google Picker callback registers folder selected by user before uploading',async()=>{
 const t=await mount({connected:true,configuration_ready:true,can_connect:true},{
  directUpload:true,saveChoice:'folder'});
 const bytes=new TextEncoder().encode('%PDF-1.4\\n1 0 obj\\n<< >>\\nendobj\\n%%EOF\\n');
 t.els['document-matter'].value='44444444-4444-4444-8444-444444444444';
 t.els['document-file'].files=[{name:'qa_gpt.pdf',size:bytes.length,
  async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}}];
 await t.els['document-upload-form'].listeners.submit({preventDefault(){}});
 await Promise.race([settleSave(t),new Promise((_,reject)=>setTimeout(()=>reject(Error('Picker flow did not finish: '+JSON.stringify({calls:t.calls.map(x=>x.url),feedback:t.els['document-feedback'].textContent,dialog:t.els['document-save-dialog'].open}))),2000))]);
 const selected=t.calls.find(x=>x.url==='/api/qa/storage/select');
 assert.ok(selected,'provider choice must be checked with application and Google permissions');
 assert.equal(JSON.parse(selected.body).folder_id,'sharedTeamFolder123456');
 const start=t.calls.find(x=>x.url==='/api/qa/documents/upload/start');
 assert.ok(start);
 assert.equal(JSON.parse(start.body).destination_id,'77777777-7777-4777-8777-777777777777');
 assert.equal(t.els['document-feedback'].dataset.state,'success');
});

test('R104 authenticated app CSP permits Google Picker JS and docs iframe without weakening public pages',()=>{
 const source=readFileSync(new URL('../src/site_worker.mjs',import.meta.url),'utf8');
 const app=source.slice(source.indexOf('const directWorkspaceCsp='),
   source.indexOf('function directWorkspaceHeaders('));
 const blob=source.slice(source.indexOf('const driveBlobCsp='),
   source.indexOf('// Same OAuth popup origin'));
 const common=source.slice(source.indexOf('const csp='),source.indexOf('const driveBlobCsp='));
 assert.match(app,/https:\/\/apis\.google\.com/,'picker script must be allowed on /app');
 assert.match(app,/frame-src https:\/\/accounts\.google\.com https:\/\/docs\.google\.com/);
 assert.doesNotMatch(blob,/https:\/\/apis\.google\.com/,'isolated upload POC should not gain unrelated picker privileges');
 assert.doesNotMatch(common,/https:\/\/apis\.google\.com/,'public pages remain restricted');
 const ui=readFileSync(new URL('../../../web/r0-preview/documents.js',import.meta.url),'utf8');
 assert.match(ui,/setEnableDrives\(true\)/,'Google Picker includes shared-drive folder tab');
 assert.match(ui,/supportsAllDrives=true/,'selected shared-drive folders need Drive multipart support');
});
