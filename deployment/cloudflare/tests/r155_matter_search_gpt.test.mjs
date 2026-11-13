import test from 'node:test';
import assert from 'node:assert/strict';
import {documentsApi,DOCUMENT_ACL_SQL,LIST_SQL,SEARCH_SQL} from '../src/qa_documents.mjs';

const HOST='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const I='11111111-1111-4111-8111-111111111111';
const T='33333333-3333-4333-8333-333333333333';
const U='22222222-2222-4222-8222-222222222222';
const M='44444444-4444-4444-8444-444444444444';
const OTHER='99999999-9999-4999-8999-999999999999';
const NOW=1800000000;
const rows=[
 {file_id:'66666666-6666-4666-8666-666666666661',file_name:'Ho so 01.pdf',
  mime_type:'application/pdf',byte_length:120,sha256:'a'.repeat(64),
  created_at:NOW,verification_status:'unverified'},
 {file_id:'66666666-6666-4666-8666-666666666662',file_name:'Phu luc hop dong.docx',
  mime_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  byte_length:130,sha256:'b'.repeat(64),created_at:NOW+1,
  verification_status:'unverified'},
 {file_id:'66666666-6666-4666-8666-666666666663',file_name:'100%_xac nhan.pdf',
  mime_type:'application/pdf',byte_length:140,sha256:'c'.repeat(64),
  created_at:NOW+2,verification_status:'unverified'}
];

function fixture({signedIn=true,acl=true,role='lawyer',records=rows}={}){
 const calls=[],drive=[];
 const env={AI_LAW_CF_MODE:'isolated-qa-only',
  INSTALLATION_ID:I,JWT_ISSUER:'https://issuer.test',
  DB:{prepare(sql){return {bind(...params){
   calls.push({sql,params});
   return {
    async first(){
     if(sql.includes('FROM qa_sessions s'))
       return signedIn?{user_id:U,tenant_id:T,role_key:role}:null;
     if(sql===DOCUMENT_ACL_SQL)
       return acl&&params[2]===M?{ok:1}:null;
     return null;
    },
    async all(){
     if(sql===LIST_SQL)return {results:records.slice(0,50)};
     if(sql===SEARCH_SQL){
      const q=params[3].toLowerCase();
      return {results:records.filter(r=>r.file_name.toLowerCase().includes(q))
        .slice(0,51)};
     }
     throw Error('unexpected DB query');
    }
   };
  }};}}
 };
 return {env,calls,drive};
}
const req=(query,withCookie=true)=>new Request(HOST+
 '/api/qa/documents?matter_id='+M+(query?'&'+query:''),{
 headers:withCookie?{Cookie:'al_qa_session=55555555-5555-4555-8555-555555555555'}:{}
});

test('R155 database search binds installation, tenant, matter and literal substring',()=>{
 assert.match(SEARCH_SQL,/r\.installation_id=\? AND r\.tenant_id=\? AND f\.matter_id=\?/);
 assert.match(SEARCH_SQL,/instr\(lower\(r\.file_name\),lower\(\?\)\)>0/);
 assert.doesNotMatch(SEARCH_SQL,/\bLIKE\b|\bOR\s+1=1\b/);
 const f=fixture();
 return documentsApi(req('q=hop%20dong'),f.env,{now:NOW}).then(async res=>{
  assert.equal(res.status,200);
  const data=await res.json();
  assert.deepEqual(data.documents.map(r=>r.name),['Phu luc hop dong.docx']);
  assert.equal(data.search_scope,'file_name_only');
  assert.equal(data.has_more,false);
  assert.deepEqual(f.calls.find(c=>c.sql===SEARCH_SQL).params,[I,T,M,'hop dong']);
  assert.ok(f.calls.find(c=>c.sql===DOCUMENT_ACL_SQL));
  assert.equal(f.drive.length,0,'search uses D1 receipt metadata only, not Drive');
 });
});

test('R155 special % and _ query characters search literally, not as SQL wildcards',async()=>{
 const f=fixture();
 const out=await documentsApi(req('q='+encodeURIComponent('%_')),f.env,{now:NOW});
 assert.equal(out.status,200);
 assert.deepEqual((await out.json()).documents.map(r=>r.name),['100%_xac nhan.pdf']);
 assert.equal(f.calls.find(c=>c.sql===SEARCH_SQL).params[3],'%_');
});

test('R155 no keyword retains existing 50-item matter list semantics',async()=>{
 const f=fixture();
 const r=await documentsApi(req(''),f.env,{now:NOW});
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.documents.length,3);
 assert.equal(data.search_scope,'file_name_only');
 assert.equal(data.has_more,false);
 assert.equal(f.calls.filter(c=>c.sql===LIST_SQL).length,1);
 assert.equal(f.calls.some(c=>c.sql===SEARCH_SQL),false);
});

test('R155 signed-in denial and revoked Matter ACL do not execute filename SQL',async()=>{
 for(const [opts,expected] of [
  [{signedIn:false},401],[{acl:false},404],[{role:'viewer'},404]
 ]){
  const f=fixture(opts);
  const r=await documentsApi(req('q=ho'),f.env,{now:NOW});
  assert.equal(r.status,expected);
  assert.equal(f.calls.some(c=>c.sql===SEARCH_SQL),false);
  assert.ok(!JSON.stringify(await r.json()).includes('Phu luc'),
    'denied requests must reveal no filenames');
 }
 const f=fixture();
 const r=await documentsApi(new Request(HOST+
  '/api/qa/documents?matter_id='+OTHER+'&q=ho',{
   headers:{Cookie:'al_qa_session=55555555-5555-4555-8555-555555555555'}
  }),f.env,{now:NOW});
 assert.equal(r.status,404,'other Matter IDs never fall back to global file searches');
 assert.equal(f.calls.some(c=>c.sql===SEARCH_SQL),false);
});

test('R155 duplicate, overlong, blank-padded and control-char searches fail closed',async()=>{
 for(const query of [
  'q=a','q='+encodeURIComponent('x'.repeat(81)),
  'q=+abc','q=ab%20','q=ab&q=cd','q='+encodeURIComponent('a\0b')
 ]){
  const f=fixture();
  const r=await documentsApi(req(query),f.env,{now:NOW});
  assert.equal(r.status,400,query);
  assert.equal(f.calls.some(c=>c.sql===SEARCH_SQL),false);
 }
});

test('R155 a search returning more than 50 states the limit, does not leak extra row',async()=>{
 const records=Array.from({length:57},(_,i)=>({
  ...rows[0],file_id:'66666666-6666-4666-8666-'+String(i).padStart(12,'0'),
  file_name:'synthetic-doc-'+String(i).padStart(3,'0')+'.pdf'
 }));
 const f=fixture({records});
 const r=await documentsApi(req('q=synthetic'),f.env,{now:NOW});
 assert.equal(r.status,200);
 const d=await r.json();
 assert.equal(d.documents.length,50);
 assert.equal(d.has_more,true);
 assert.equal(d.documents.some(x=>x.name==='synthetic-doc-050.pdf'),false);
 assert.equal(f.calls.find(c=>c.sql===SEARCH_SQL).params[3],'synthetic');
});
