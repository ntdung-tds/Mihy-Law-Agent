import test from 'node:test';
import assert from 'node:assert/strict';
import {GoogleDriveAdapter,DriveUploadFailure} from '../src/google_drive.mjs';

const ROOT='syntheticQAroot_12345';
const FILE='syntheticDriveObject_12345';
const TOKEN='synthetic-token-no-real-credentials';
const PDF=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF\n');
const mime='application/pdf';
function adapter(provider={id:FILE}){
 const captured=[];
 const fetcher=async(url,init)=>{
  captured.push({url,init});
  if(init.method==='POST'){
   if(provider.error)return Response.json(provider.error.body,{status:provider.error.status});
   if(provider.network)throw Error('synthetic network refusal SECRET_MUST_NOT_ESCAPE');
   return Response.json(provider.create??{id:FILE},{status:200});
  }
  if(init.method==='GET')return Response.json(provider.metadata??{
   id:FILE,name:'synthetic.pdf',mimeType:mime,size:String(PDF.length),
   parents:[ROOT],trashed:false
  });
  throw Error('Unexpected remote method');
 };
 return {store:new GoogleDriveAdapter({accessToken:TOKEN,rootId:ROOT,fetcher}),captured};
}
const sample={name:'synthetic.pdf',mimeType:mime,bytes:PDF};
test('R81 Drive multipart sends Google-documented framing and byte-perfect media',async()=>{
 const t=adapter({create:{id:FILE}});const id=await t.store.upload(sample);
 assert.equal(id,FILE);assert.equal(t.captured.length,2);
 const request=t.captured[0],ct=request.init.headers['Content-Type'];
 assert.equal(request.init.method,'POST');
 assert.match(request.url,/uploadType=multipart/);
 assert.match(ct,/^multipart\/related; boundary=ai_law_[a-f0-9]{32}$/);
 assert.equal(request.init.headers.Authorization,'Bearer '+TOKEN);
 const boundary=ct.split('boundary=')[1];
 assert.equal(request.init.body instanceof ReadableStream,true,
  'Cloudflare Workers outgoing Request body must be ReadableStream, not Blob');
 assert.equal(request.init.duplex,'half');
 // Construct a real Fetch Request rather than only inspecting a stubbed
 // fetch argument, which previously hid the Blob/Workers incompatibility.
 const transport=new Request(request.url,request.init);
 const raw=new Uint8Array(await transport.arrayBuffer());
 const text=new TextDecoder().decode(raw);
 assert.match(text,new RegExp('^--'+boundary+'\\r\\nContent-Type: application/json; charset=UTF-8\\r\\n\\r\\n'));
 assert.ok(!text.includes('Content-Transfer-Encoding'));
 const first=text.indexOf(JSON.stringify({name:'synthetic.pdf',mimeType:mime,parents:[ROOT]}));
 assert.ok(first>0,'metadata is before media');
 const mediaHead='\r\n--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n';
 const offset=text.indexOf(mediaHead);
 assert.ok(offset>first,'media part follows metadata');
 const start=new TextEncoder().encode(text.slice(0,offset+mediaHead.length)).length;
 assert.deepEqual(raw.slice(start,start+PDF.length),PDF);
 assert.equal(text.slice(-('\r\n--'+boundary+'--').length),'\r\n--'+boundary+'--');
 assert.equal(t.captured[1].init.method,'GET','server verifies with a separate Drive metadata call');
});
test('R81 a legitimate partial create response is accepted only after authoritative root verification',async()=>{
 const t=adapter({create:{id:FILE}});
 assert.equal(await t.store.upload(sample),FILE);
});
test('R81 Google 403 storage reason is bounded and never discloses raw response',async()=>{
 const t=adapter({error:{status:403,body:{error:{
  code:403,errors:[{reason:'storageQuotaExceeded',message:'PRIVATE FILE NAME: secret.pdf'}],
  message:'Bearer secret-credential'
 }}}});
 await assert.rejects(()=>t.store.upload(sample),error=>{
  assert.equal(error instanceof DriveUploadFailure,true);
  assert.equal(error.stage,'provider');assert.equal(error.httpStatus,403);
  assert.equal(error.reason,'storageQuotaExceeded');
  assert.ok(!JSON.stringify(error).includes('secret-credential'));
  assert.ok(!JSON.stringify(error).includes('secret.pdf'));
  return true;
 });
 assert.equal(t.captured.length,1,'no metadata read after rejected provider');
});
test('R81 Google 400 unknown reason is not copied to the response',async()=>{
 const t=adapter({error:{status:400,body:{error:{
  errors:[{reason:'privateOAuthStateSecret',message:'SESSION_123'}]
 }}}});
 await assert.rejects(()=>t.store.upload(sample),error=>{
  assert.equal(error.stage,'provider');assert.equal(error.httpStatus,400);
  assert.equal(error.reason,'');return true;
 });
});
test('R81 Google confirmed upload with wrong parent, name or byte length must fail closed',async()=>{
 for(const bad of [
  {id:FILE,name:'synthetic.pdf',mimeType:mime,parents:['wrongFolder12345'],trashed:false,size:String(PDF.length)},
  {id:FILE,name:'wrong.pdf',mimeType:mime,parents:[ROOT],trashed:false,size:String(PDF.length)},
  {id:FILE,name:'synthetic.pdf',mimeType:mime,parents:[ROOT],trashed:false,size:String(PDF.length-1)}
 ]){
  const t=adapter({create:{id:FILE},metadata:bad});
  await assert.rejects(()=>t.store.upload(sample),e=>e instanceof DriveUploadFailure&&e.stage==='verify');
 }
});
test('R81 transport exceptions and malformed Google IDs are classified without secrets',async()=>{
 for(const x of [
  [adapter({network:true}),'transport'],
  [adapter({create:{id:'not-valid'}}),'response']
 ]){
  await assert.rejects(()=>x[0].store.upload(sample),e=>
   e instanceof DriveUploadFailure&&e.stage===x[1]&&e.httpStatus===0);
 }
});
