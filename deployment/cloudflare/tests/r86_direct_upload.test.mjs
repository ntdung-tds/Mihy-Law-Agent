import test from 'node:test';
import assert from 'node:assert/strict';
import {documentsApi,DOCUMENT_ACL_SQL} from '../src/qa_documents.mjs';
import {GoogleDriveAdapter} from '../src/google_drive.mjs';
const I='11111111-1111-4111-8111-111111111111';
const U='22222222-2222-4222-8222-222222222222';
const T='33333333-3333-4333-8333-333333333333';
const M='44444444-4444-4444-8444-444444444444';
const S='55555555-5555-4555-8555-555555555555';
const ROOT='syntheticQAroot_12345',REMOTE='syntheticDriveFile_67890';
const ORIGIN='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const now=1800000000;
const MANIFEST={matter_id:M,file_name:'qa_gpt.pdf',mime_type:'application/pdf',
 byte_length:42,sha256:'b'.repeat(64)};
function request(path,body,{cookie=true,origin=ORIGIN}={}){
 const headers={'Content-Type':'application/json',Origin:origin,'Sec-Fetch-Site':'same-origin'};
 if(cookie)headers.Cookie='al_qa_session='+S;
 return new Request(ORIGIN+path,{method:'POST',headers,body:JSON.stringify(body)});
}
function fixture({allow=true,grant=true,badProof=false,active=true,sessionMode='ok'}={}){
 let ticket=null,used=false,receipt=false;const requests=[],statements=[];
 const env={AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:I,
  JWT_ISSUER:'https://issuer.test',
  ...(grant?{GOOGLE_DRIVE_ACCESS_TOKEN:'synthetic-drive-access-token',
    GOOGLE_DRIVE_ROOT_ID:ROOT}:{}),
  DB:{
   prepare(sql){return {bind(...params){
    statements.push({sql,params});
    return {
     async first(){
      if(sql.includes('FROM qa_sessions s'))return active?
       {user_id:U,tenant_id:T,role_key:'lawyer',subject:'qa',expires_at:now+400}:null;
      if(sql===DOCUMENT_ACL_SQL)return allow?{ok:1}:null;
      if(sql.includes('COUNT(*)'))return {n:0};
      if(sql.includes('FROM qa_document_upload_tickets WHERE')){
       if(!ticket||used||params[2]!==ticket.ticket_id)return null;
       return {ticket_id:ticket.ticket_id,user_id:U,matter_id:M,
        file_name:ticket.file_name,mime_type:ticket.mime_type,
        byte_length:ticket.byte_length,sha256:ticket.sha256};
      }
      return null;
     },
     async run(){
      if(sql.startsWith('INSERT INTO qa_document_upload_tickets')){
       ticket={ticket_id:params[2],file_name:params[5],
        mime_type:params[6],byte_length:params[7],sha256:params[8]};
      }
      return {success:true,meta:{changes:1}};
     }
    };
   }};},
   async batch(actions){
    assert.equal(actions.length,3);
    used=true;receipt=true;
    return actions.map(()=>({success:true,meta:{changes:1}}));
   }
  }
 };
 async function driveFetch(url,init){
  requests.push({url,init});
  if(init.method==='POST'){
   if(sessionMode==='transport')throw Error('synthetic Worker fetch failure');
   if(sessionMode==='provider403')return Response.json({
    error:{errors:[{reason:'insufficientFilePermissions'}]}
   },{status:403});
   if(sessionMode==='badLocation')return new Response(null,{status:200,
    headers:{Location:'https://evil.invalid/upload/drive/v3/files?uploadType=resumable&upload_id=example12345'}});
   assert.match(url,/uploadType=resumable/);
   assert.equal(typeof init.body,'string','Only JSON manifest is sent from Worker to Google');
   assert.ok(!init.body.includes('%PDF-'));
   return new Response(null,{status:200,headers:{Location:
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=syntheticTicket12345'}});
  }
  if(init.method==='GET')return Response.json({
   id:REMOTE,name:'qa_gpt.pdf',mimeType:'application/pdf',size:'42',
   parents:[ROOT],trashed:false,
   appProperties:{ai_law_upload_ticket:badProof?'other-ticket':ticket?.ticket_id}
  });
  throw Error('Unexpected Google method');
 }
 return {env,driveFetch,requests,statements,
  ticket:()=>ticket,receipt:()=>receipt};
}
const start='/api/qa/documents/upload/start',finish='/api/qa/documents/upload/finish';
test('R99 server issues ACL-bound ticket and approved tenant folder, not CORS-blocked Google upload session',async()=>{
 const f=fixture();
 const r=await documentsApi(request(start,MANIFEST),f.env,{now,driveFetch:f.driveFetch});
 assert.equal(r.status,200,await r.clone().text());
 const data=await r.json();
 assert.match(data.ticket,/^[0-9a-f-]{36}$/);
 assert.equal(data.drive_folder_id,ROOT);
 assert.equal(data.expires_in,600);
 assert.equal(Object.hasOwn(data,'upload_url'),false);
 assert.equal(f.requests.length,0,'no Google resumable session; browser uses multipart POST');
 assert.ok(!JSON.stringify(data).includes('synthetic-drive-access-token'));
 assert.equal(f.receipt(),false,'no D1 receipt until Google metadata confirms');
});
test('R86 finalize rechecks authorized file, approved root and app-specific ticket, writes D1 only after proof',async()=>{
 const f=fixture();
 const init=await (await documentsApi(request(start,MANIFEST),f.env,{now,driveFetch:f.driveFetch})).json();
 const r=await documentsApi(request(finish,{ticket:init.ticket,file_id:REMOTE}),
  f.env,{now,driveFetch:f.driveFetch});
 assert.equal(r.status,201,await r.clone().text());
 assert.equal((await r.json()).status,'unverified');
 assert.equal(f.receipt(),true);
 assert.equal(f.statements.some(x=>x.sql.startsWith('UPDATE qa_document_upload_tickets')),true);
 const repeat=await documentsApi(request(finish,{ticket:init.ticket,file_id:REMOTE}),
  f.env,{now,driveFetch:f.driveFetch});
 assert.equal(repeat.status,404,'single-use finalization');
});
test('R86 wrong Google appProperties never creates receipt',async()=>{
 const f=fixture({badProof:true});
 const init=await (await documentsApi(request(start,MANIFEST),f.env,{now,driveFetch:f.driveFetch})).json();
 const r=await documentsApi(request(finish,{ticket:init.ticket,file_id:REMOTE}),
  f.env,{now,driveFetch:f.driveFetch});
 assert.equal(r.status,409);
 assert.equal(f.receipt(),false);
});
test('R86 denied write, no session, CSRF or invalid metadata never initiates Drive session',async()=>{
 for(const x of [
  [fixture({allow:false}),request(start,MANIFEST),404],
  [fixture({active:false}),request(start,MANIFEST),401],
  [fixture(),request(start,MANIFEST,{origin:'https://evil.invalid'}),403],
  [fixture(),request(start,{...MANIFEST,byte_length:9999999}),400],
  [fixture(),request(start,{...MANIFEST,mime_type:'text/plain'}),400],
 ]){
  const [f,req,status]=x;
  const response=await documentsApi(req,f.env,{now,driveFetch:f.driveFetch});
  assert.equal(response.status,status,await response.clone().text());
  assert.equal(f.requests.length,0);
 }
});
test('R86 only metadata JSON endpoints are accepted, never arbitrary GET',async()=>{
 const f=fixture();
 const requestGet=new Request(ORIGIN+start,{headers:{Cookie:'al_qa_session='+S}});
 assert.equal((await documentsApi(requestGet,f.env,{now,driveFetch:f.driveFetch})).status,405);
});

test('R99 missing organization Drive grant never issues a ticket or exposes file bytes',async()=>{
 const f=fixture({grant:false});
 const res=await documentsApi(request(start,MANIFEST),f.env,{now,driveFetch:f.driveFetch});
 assert.equal(res.status,503);
 const data=await res.json();
 assert.equal(data.code,'DRIVE_GRANT_UNAVAILABLE');
 assert.equal(f.ticket(),null);
 assert.equal(f.receipt(),false);
 assert.equal(f.requests.length,0);
});

test('R89 Cloudflare fetch brand binding: bare invocation works for session start and metadata GET',async()=>{
 const root='syntheticQAroot_12345',remote='syntheticDriveFile_67890';
 const ticket='55555555-5555-4555-8555-555555555555';
 const calls=[];
 // Cloudflare global fetch throws TypeError when assigned as an object method
 // and then called with an incorrect this. Reproduce without real credentials.
 function cloudflareBrandSensitiveFetch(url,init){
  assert.equal(this,undefined,'Worker fetch must not receive GoogleDriveAdapter as receiver');
  calls.push({url,method:init.method});
  if(init.method==='POST')
   return Promise.resolve(new Response(null,{status:200,headers:{
    Location:'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=syntheticSession12345'
   }}));
  if(init.method==='GET')
   return Promise.resolve(Response.json({id:remote,name:'qa_gpt.pdf',
    mimeType:'application/pdf',size:'42',parents:[root],trashed:false,
    appProperties:{ai_law_upload_ticket:ticket}}));
  throw Error('unexpected request');
 }
 const adapter=new GoogleDriveAdapter({
  accessToken:'synthetic-drive-access-token',
  rootId:root,
  fetcher:cloudflareBrandSensitiveFetch
 });
 const session=await adapter.beginResumable({
  name:'qa_gpt.pdf',mimeType:'application/pdf',size:42,ticketId:ticket
 });
 assert.match(session,/upload_id=syntheticSession12345/);
 const proof=await adapter.verifyDirectUpload(remote,{
  ticketId:ticket,name:'qa_gpt.pdf',mimeType:'application/pdf',size:42
 });
 assert.equal(proof.id,remote);
 assert.deepEqual(calls.map(x=>x.method),['POST','GET']);
});
