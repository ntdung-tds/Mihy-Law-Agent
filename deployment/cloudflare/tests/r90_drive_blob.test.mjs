import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../../../web/qa/drive-blob.js',import.meta.url),'utf8');

function element(id) {
 return {id,textContent:'',hidden:true,disabled:false,dataset:{},files:[],handlers:{},
   addEventListener(type,callback){this.handlers[type]=callback;}};
}
function browser({googleError=false}={}) {
 const names=['drive-blob-test','connect-google','clear-token','blob-file','upload-blob',
   'selected-name','blob-status','result','result-info','result-link'];
 const el=Object.fromEntries(names.map(id=>[id,element(id)]));
 el['drive-blob-test'].dataset.googleClientId='qa-synthetic-client.apps.googleusercontent.com';
 el['result'].hidden=true;
 el['upload-blob'].disabled=true;
 const calls=[];
 const directFetch=async (url,init) => {
  assert.match(url,/^https:\/\/www\.googleapis\.com\//,'direct Google URL only');
  calls.push({url,init});
  if(init.method==='POST'){
   assert.match(url,/uploadType=multipart/);
   assert.equal(init.credentials,'omit');
   assert.equal(init.mode,'cors');
   assert.ok(init.body instanceof Blob);
   assert.match(init.headers['Content-Type'],/^multipart\/related; boundary=/);
   const bytes=await init.body.text();
   assert.ok(bytes.includes('qa_synthetic.pdf'));
   assert.ok(bytes.includes('%PDF-'));
   if(googleError)return Response.json({error:{errors:[{reason:'insufficientFilePermissions'}]}},{status:403});
   return Response.json({id:'syntheticGoogleFile12345',name:'qa_synthetic.pdf'},{status:200});
  }
  assert.equal(init.method,'GET');
  return Response.json({id:'syntheticGoogleFile12345',name:'qa_synthetic.pdf',mimeType:'application/pdf',
   size:String(el['blob-file'].files[0].size),trashed:false},{status:200});
 };
 const window={google:{accounts:{oauth2:{initTokenClient(cfg){
    assert.equal(cfg.scope,'https://www.googleapis.com/auth/drive.file');
    return {requestAccessToken(){
     cfg.callback({access_token:'qa-synthetic-not-real-google-token',expires_in:3600});
    }};
 }}}}};
 const context=vm.createContext({window,document:{getElementById:id=>el[id]||null},
   fetch:directFetch,Blob,crypto:webcrypto,Date,console});
 vm.runInContext(script,context,{filename:'drive-blob.js'});
 return {el,calls};
}

test('R90 Blob goes browser to Google multipart POST, verifies Google metadata, no Worker calls',async()=>{
 const b=browser();
 assert.equal(b.el['upload-blob'].disabled,true);
 b.el['connect-google'].handlers.click();
 const f=new Blob(['%PDF-1.7\n'+'x'.repeat(50)+'%%EOF'],{type:'application/pdf'});
 f.name='qa_synthetic.pdf';
 b.el['blob-file'].files=[f];
 b.el['blob-file'].handlers.change();
 assert.equal(b.el['upload-blob'].disabled,false);
 await b.el['upload-blob'].handlers.click();
 assert.equal(b.calls.length,2,'one direct Google POST plus one metadata GET');
 assert.equal(b.el['blob-status'].dataset.kind,'success');
 assert.equal(b.el['result'].hidden,false);
 assert.match(b.el['result-link'].href,/^https:\/\/drive\.google\.com\/file\/d\//);
 assert.ok(b.calls.every(x=>x.url.startsWith('https://www.googleapis.com/')));
});
test('R90 Drive HTTP 403 remains a clear error and cannot claim upload success',async()=>{
 const b=browser({googleError:true});
 b.el['connect-google'].handlers.click();
 const f=new Blob(['%PDF-1.7\n'+'x'.repeat(50)+'%%EOF'],{type:'application/pdf'});
 f.name='qa_synthetic.pdf';
 b.el['blob-file'].files=[f];
 b.el['blob-file'].handlers.change();
 await b.el['upload-blob'].handlers.click();
 assert.equal(b.calls.length,1);
 assert.equal(b.el['blob-status'].dataset.kind,'error');
 assert.match(b.el['blob-status'].textContent,/HTTP 403/);
 assert.equal(b.el['result'].hidden,true);
});
test('R90 invalid or oversized files never trigger a Google request',async()=>{
 const b=browser();
 b.el['connect-google'].handlers.click();
 const f=new Blob(['z'.repeat(1600000)],{type:'application/pdf'});
 f.name='qa_synthetic.pdf';
 b.el['blob-file'].files=[f];
 b.el['blob-file'].handlers.change();
 assert.equal(b.el['upload-blob'].disabled,true);
 await b.el['upload-blob'].handlers.click();
 assert.equal(b.calls.length,0);
});

test('R93 configured QA OAuth Client ID is passed from hosted HTML to the Google JavaScript token client',()=>{
 const html=readFileSync(new URL('../../../web/qa/drive-blob.html',import.meta.url),'utf8');
 const match=html.match(/id="drive-blob-test"[^>]*data-google-client-id="([^"]+)"/);
 assert.ok(match,'QA HTML carries the OAuth client ID');
 assert.equal(match[1],'748514165913-k1paechitoq2ds8337ondc1q2smk8dut.apps.googleusercontent.com');
 assert.doesNotMatch(html,/873907439100-vlno9kus5k18ikvfgj6smodoho71djsg/,'old Google project must not be reused');
 assert.match(script,/root\.dataset\.googleClientId/,'JS reads the configured current client ID');
 assert.match(script,/client_id:\s*clientId/,'JS passes it to Google Identity Services');
 assert.match(html,/https:\/\/accounts\.google\.com\/gsi\/client/);
});

test('R95 widget loader is lazy and reuses only the proven Google direct upload JavaScript',()=>{
 const src=readFileSync(new URL('../../../web/qa/drive-inline.js',import.meta.url),'utf8');
 const hooks={};
 const panel={open:false,addEventListener(event,fn){hooks[event]=fn;}};
 const status={textContent:'',dataset:{}};
 const inserted=[];
 const head={appendChild(el){inserted.push(el);}};
 const document={
  getElementById(id){return id==='qa-direct-drive-panel'?panel:id==='blob-status'?status:null;},
  createElement(tag){assert.equal(tag,'script');return {src:'',onload:null,onerror:null,async:false};},
  head
 };
 vm.runInNewContext(src,{document},{filename:'drive-inline.js'});
 assert.equal(inserted.length,0,'OAuth is not loaded until QA details opened');
 panel.open=true; hooks.toggle();
 assert.equal(inserted.length,1);
 assert.equal(inserted[0].src,'https://accounts.google.com/gsi/client');
 inserted[0].onload();
 assert.equal(inserted.length,2);
 assert.equal(inserted[1].src,'/drive-blob.js');
 hooks.toggle();
 assert.equal(inserted.length,2,'opening again does not duplicate script injection');
});
