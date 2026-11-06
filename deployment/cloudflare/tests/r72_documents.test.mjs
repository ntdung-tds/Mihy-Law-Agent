import test from 'node:test';
import assert from 'node:assert/strict';
import {documentsApi,DOCUMENT_ACL_SQL,LIST_SQL,READ_SQL} from '../src/qa_documents.mjs';
import {GoogleDriveAdapter} from '../src/google_drive.mjs';
const I='11111111-1111-4111-8111-111111111111';
const U='22222222-2222-4222-8222-222222222222';
const T='33333333-3333-4333-8333-333333333333';
const M='44444444-4444-4444-8444-444444444444';
const S='55555555-5555-4555-8555-555555555555';
const F='66666666-6666-4666-8666-666666666666';
const DRIVEID='syntheticDriveObject_12345',ROOT='syntheticQAroot_12345';
const ORIGIN='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const now=1800000000;
const pdf=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF\n');
function fixture({authenticated=true,allow=true,grant=true,dbFail=false}={}){
 const calls=[],uploads=[],removes=[];let saved=null;
 const env={
  AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:I,JWT_ISSUER:'https://issuer.test',
  ...(grant?{GOOGLE_DRIVE_ACCESS_TOKEN:'synthetic-token-for-tests',
    GOOGLE_DRIVE_ROOT_ID:ROOT}:{}),
  DB:{
   prepare(sql){return {bind(...params){
    calls.push({sql,params});
    return {
     async first(){
      if(sql.includes('FROM qa_sessions s'))return authenticated?
       {user_id:U,tenant_id:T,role_key:'lawyer',subject:'qa',expires_at:now+400}:null;
      if(sql===DOCUMENT_ACL_SQL)return allow?{ok:1}:null;
      if(sql.includes('COUNT(*)'))return {n:0};
      if(sql===READ_SQL&&saved)return {
        file_id:F,file_name:'synthetic.pdf',mime_type:'application/pdf',
        byte_length:pdf.length,sha256:saved.sha,matter_id:M,
        provider:'google_drive',provider_object_id:DRIVEID
      };
      return null;
     },
     async all(){if(sql===LIST_SQL&&saved)return {results:[{
      file_id:F,file_name:'synthetic.pdf',mime_type:'application/pdf',
      byte_length:pdf.length,sha256:saved.sha,verification_status:'unverified',created_at:now
     }]};return {results:[]};}
    };
   }};},
   async batch(actions){
    if(dbFail)throw Error('synthetic database failure');
    const receipt=calls.find(x=>x.sql.includes('INSERT INTO qa_document_receipts'));
    saved={sha:receipt.params[6]};
    return actions.map(()=>({success:true}));
   }
  }
 };
 async function driveFetch(url,options){
  if(options.method==='POST'){
   assert.match(url,/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?/);
   assert.match(options.headers['Content-Type'],/^multipart\/related/);
   uploads.push({url,body:options.body});
   return Response.json({id:DRIVEID,name:'synthetic.pdf',mimeType:'application/pdf',
    parents:[ROOT],trashed:false},{status:200});
  }
  if(options.method==='DELETE'){removes.push(url);return new Response(null,{status:204});}
  if(url.includes('alt=media'))return new Response(pdf,{headers:{'Content-Type':'application/pdf'}});
  return Response.json({id:DRIVEID,name:'synthetic.pdf',
   mimeType:'application/pdf',size:String(pdf.length),parents:[ROOT],trashed:false});
 }
 return {env,calls,uploads,removes,driveFetch};
}
function request(path,method='GET',{withCookie=true,origin=ORIGIN,fileBytes=pdf}={}){
 const headers={};if(withCookie)headers.Cookie='al_qa_session='+S;
 if(method==='POST'){
  headers.Origin=origin;headers['Sec-Fetch-Site']='same-origin';
  const form=new FormData();form.set('matter_id',M);
  form.set('file',new File([fileBytes],'synthetic.pdf',{type:'application/pdf'}));
  return new Request(ORIGIN+path,{method,headers,body:form});
 }
 return new Request(ORIGIN+path,{method,headers});
}
test('queries scope installation and tenant, allow-minus-deny, version and valid time',()=>{
 assert.match(DOCUMENT_ACL_SQL,/m\.installation_id=\? AND m\.tenant_id=\? AND m\.matter_id=\?/);
 assert.match(DOCUMENT_ACL_SQL,/NOT EXISTS/);
 assert.match(DOCUMENT_ACL_SQL,/acl_version=m\.acl_version/);
 assert.match(DOCUMENT_ACL_SQL,/permission=\?/);
 assert.match(LIST_SQL,/f\.matter_id=\?/);
 assert.match(READ_SQL,/r\.file_id=\?/);
});
test('anonymous, missing grant, CSRF and wrong matter permissions fail closed',async()=>{
 let f=fixture();
 assert.equal((await documentsApi(request('/api/qa/documents?matter_id='+M,'GET',{withCookie:false}),f.env,{now})).status,401);
 f=fixture({allow:false});
 assert.equal((await documentsApi(request('/api/qa/documents?matter_id='+M),f.env,{now})).status,404);
 assert.equal((await documentsApi(request('/api/qa/documents','POST'),f.env,{now,driveFetch:f.driveFetch})).status,404);
 assert.equal(f.uploads.length,0);
 f=fixture();
 assert.equal((await documentsApi(request('/api/qa/documents','POST',{origin:'https://evil.invalid'}),f.env,{now,driveFetch:f.driveFetch})).status,403);
 f=fixture({grant:false});
 assert.equal((await documentsApi(request('/api/qa/documents','POST'),f.env,{now,driveFetch:f.driveFetch})).status,503);
});
test('spoofed PDF fails before Drive upload or D1 mutation',async()=>{
 const f=fixture();
 const r=await documentsApi(request('/api/qa/documents','POST',{fileBytes:new TextEncoder().encode('this is not a real PDF format despite its filename and mime')}),f.env,{now,driveFetch:f.driveFetch});
 assert.equal(r.status,415);assert.equal(f.uploads.length,0);
 assert.equal(f.calls.some(x=>x.sql.includes('INSERT INTO')),false);
});
test('real multipart QA upload gets Drive root proof, SHA256 and two D1 receipts',async()=>{
 const f=fixture();
 const r=await documentsApi(request('/api/qa/documents','POST'),f.env,{now,driveFetch:f.driveFetch});
 assert.equal(r.status,201,await r.clone().text());
 const data=await r.json();
 assert.match(data.sha256,/^[0-9a-f]{64}$/);
 assert.equal(data.status,'unverified');
 assert.equal(f.uploads.length,1);
 assert.equal(f.calls.filter(x=>x.sql.includes('INSERT INTO')).length,2);
 assert.deepEqual(f.calls.filter(x=>x.sql===DOCUMENT_ACL_SQL).map(x=>x.params[4]),['write','write']);
 const listed=await documentsApi(request('/api/qa/documents?matter_id='+M),f.env,{now,driveFetch:f.driveFetch});
 assert.equal(listed.status,200);
 assert.equal((await listed.json()).documents[0].status,'unverified');
});
test('Drive cleans orphan if D1 transaction fails',async()=>{
 const f=fixture({dbFail:true});
 const r=await documentsApi(request('/api/qa/documents','POST'),f.env,{now,driveFetch:f.driveFetch});
 assert.equal(r.status,503);assert.equal(f.removes.length,1);
});
test('download requires read ACL, verifies exact SHA and parent before release',async()=>{
 const f=fixture();
 assert.equal((await documentsApi(request('/api/qa/documents','POST'),f.env,{now,driveFetch:f.driveFetch})).status,201);
 let r=await documentsApi(request('/api/qa/documents/'+F+'/download'),f.env,{now,driveFetch:f.driveFetch});
 assert.equal(r.status,200);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),pdf);
 assert.match(r.headers.get('Content-Disposition'),/attachment/);
 const denied=fixture({allow:false});
 assert.equal((await documentsApi(request('/api/qa/documents/'+F+'/download'),denied.env,{now,driveFetch:denied.driveFetch})).status,404);
});
test('Drive root guard forbids out-of-folder material even with token',async()=>{
 const adapter=new GoogleDriveAdapter({accessToken:'synthetic-token-for-tests',rootId:ROOT,
  fetcher:async()=>Response.json({id:DRIVEID,trashed:false,mimeType:'application/pdf',parents:['differentRoot_12345']})});
 await assert.rejects(()=>adapter.download(DRIVEID),/approved customer folder/);
});
