import test from 'node:test';
import assert from 'node:assert/strict';
import {documentExtractApi,LEGAL_MATTER_ACCESS_SQL,LEGAL_QUOTA_SQL}
 from '../src/qa_legal_workflows.mjs';

const BASE='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const I='11111111-1111-4111-8111-111111111111';
const U='22222222-2222-4222-8222-222222222222';
const T='33333333-3333-4333-8333-333333333333';
const M='44444444-4444-4444-8444-444444444444';
const SID='55555555-5555-4555-8555-555555555555';
const NOW=1800000000;
const GOOD='Điều 1. Bên A giao 10 bộ hồ sơ vào ngày 15/09/2026. Bên B thanh toán 2.000.000 đồng.';
function fixture({session=true,acl=true,quota=true,role='lawyer',convert=true,converted=GOOD}={}){
 const calls=[],conversions=[],runs=[];
 const env={AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:I,
  DB:{prepare(sql){return {bind(...args){
    calls.push({sql,args});
    return {async first(){
      if(sql.includes('FROM qa_sessions s'))return session?{user_id:U,tenant_id:T,role_key:role}:null;
      if(sql===LEGAL_MATTER_ACCESS_SQL)return acl?{'1':1}:null;
      return null;
     },async run(){return {meta:{changes:quota?1:0}};}};
  }};}},
  AI:{
   async toMarkdown(doc,options){
    conversions.push({name:doc.name,size:doc.blob.size,options,blob:doc.blob});
    if(!convert)throw Error('test simulated converter unavailability');
    return {name:doc.name,format:'text',data:converted};
   },
   async run(...args){runs.push(args);throw Error('Model must never run during extraction');}
  }
 };
 return {env,calls,conversions,runs};
}
function req({bytes=new TextEncoder().encode('%PDF-1.4\n% Synthetic QA PDF placeholder'),
 name='synthetic.pdf',mime='application/pdf',uc='UC03',
 consent=true,matter_id=M,session=true,origin=BASE,method='POST',extras=[]}={}){
 const fd=new FormData();
 fd.append('uc',uc);fd.append('matter_id',matter_id);
 fd.append('synthetic_consent',String(consent));
 fd.append('file',new Blob([bytes],{type:mime}),name);
 for(const [k,v] of extras)fd.append(k,v);
 const headers={Origin:origin,'Sec-Fetch-Site':'same-origin'};
 if(session)headers.Cookie='al_qa_session='+SID;
 return new Request(BASE+'/api/qa/legal/extract',{method,headers,body:fd});
}
test('R138 PDF and DOCX: real multipart bytes, ACL first, conversion text returned only for manual preview',async()=>{
 for(const [name,mime,bytes,uc] of [
  ['synthetic.pdf','application/pdf',new TextEncoder().encode('%PDF-1.7\nsynthetic sample test'), 'UC03'],
  ['synthetic.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   Uint8Array.from([0x50,0x4b,3,4,0x14,0,0,0,0,0,0,0]),'UC04'],
  ['qa.pdf','application/pdf',new TextEncoder().encode('%PDF-1.4\nsynthetic QA sample'), 'UC07']
 ]){
  const f=fixture();
  const response=await documentExtractApi(req({bytes,name,mime,uc}),f.env,{now:NOW});
  assert.equal(response.status,200,await response.clone().text());
  const data=await response.json();
  assert.equal(data.source_text,GOOD);
  assert.equal(data.file_name,name);
  assert.equal(data.review_required,true);
  assert.equal(data.storage,'none');
  assert.equal(data.mode,'qa_file_text_preview_not_verified');
  assert.equal(data.source_sha256.length,64);
  assert.equal(data.uc,uc);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal(f.conversions.length,1);
  assert.equal(f.conversions[0].name,name);
  assert.equal(f.conversions[0].options.conversionOptions.output.format,'text');
  assert.equal(f.runs.length,0,'Extraction may not invoke legal AI draft');
  assert.ok(f.calls.some(x=>x.sql===LEGAL_MATTER_ACCESS_SQL));
  assert.ok(f.calls.some(x=>x.sql===LEGAL_QUOTA_SQL));
  assert.ok(f.calls.every(x=>x.args.every(p=>p!==GOOD)),
   'Never persist extracted text in D1');
 }
});
test('R138 extraction fails closed before provider on auth, role, MatterACL and consent',async()=>{
 for(const [options,change,status] of [
  [{session:false},{},401],
  [{role:'viewer'},{},403],
  [{acl:false},{},404],
  [{},{consent:false},400],
  [{},{origin:'https://other.example'},400],
  [{},{uc:'UC08'},400],
  [{},{matter_id:'not-a-uuid'},400],
  [{quota:false},{},429],
  [{},{extras:[['unexpected','x']]},400],
 ]){
  const f=fixture(options);
  const res=await documentExtractApi(req(change),f.env,{now:NOW});
  assert.equal(res.status,status,await res.clone().text());
  assert.equal(f.conversions.length,0);
  assert.equal(f.runs.length,0);
 }
});
test('R138 conversion rejects oversize, mislabeled files, invalid PDF/ZIP signatures and unsafe text',async()=>{
 const cases=[
  {bytes:new Uint8Array(1500001),name:'large.pdf',mime:'application/pdf',status:413},
  {bytes:new TextEncoder().encode('not a PDF'),status:400},
  {bytes:new TextEncoder().encode('%PDF-1.4\nzip filename'),name:'fake.docx',
   mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',status:400},
  {name:'fake.exe',status:400},
  {mime:'text/plain',status:400},
  {name:'a/../b.pdf',status:400},
 ];
 for(const {status,...input} of cases){
  const f=fixture();
  const result=await documentExtractApi(req(input),f.env,{now:NOW});
  assert.equal(result.status,status,await result.clone().text());
  assert.equal(f.conversions.length,0);
 }
 for(const converted of ['', 'Too short',GOOD+' x'.repeat(5000),GOOD+'\u0000hidden']){
  const f=fixture({converted});
  const r=await documentExtractApi(req(),f.env,{now:NOW});
  assert.equal(r.status,422,JSON.stringify({status:r.status,converted:converted.length}));
  assert.equal(f.conversions.length,1);
 }
 const f=fixture({convert:false});
 const r=await documentExtractApi(req(),f.env,{now:NOW});
 assert.equal(r.status,503);
 assert.equal(f.conversions.length,1);
});
