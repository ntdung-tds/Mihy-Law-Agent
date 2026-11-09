import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {documentExtractApi,docxSourcePreflight,LEGAL_MATTER_ACCESS_SQL,LEGAL_QUOTA_SQL}
 from '../src/qa_legal_workflows.mjs';

const BASE='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const I='11111111-1111-4111-8111-111111111111';
const U='22222222-2222-4222-8222-222222222222';
const T='33333333-3333-4333-8333-333333333333';
const M='44444444-4444-4444-8444-444444444444';
const SID='55555555-5555-4555-8555-555555555555';
const NOW=1800000000;
const GOOD='Điều 1. Bên A giao 10 bộ hồ sơ vào ngày 15/09/2026. Bên B thanh toán 2.000.000 đồng.';

/** Small standards-shaped OOXML ZIP fixture; tests use real ZIP headers. */
const ENC=new TextEncoder();
const XML_HEAD='<?xml version="1.0" encoding="utf-8"?>';
const CONTENT_TYPES=XML_HEAD+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const RELS=XML_HEAD+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
const DOC_BODY='<w:p><w:r><w:t>Article 1 Party A delivers 10 synthetic files.</w:t></w:r></w:p>';
const wordDoc=body=>XML_HEAD+'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'</w:body></w:document>';
function qaZip(entries){
 let offset=0;const local=[],centers=[];
 const crc32=data=>{let c=0xffffffff;for(const v of data){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
 const u16=(b,i,n)=>{b[i]=n&255;b[i+1]=(n>>>8)&255;};
 const u32=(b,i,n)=>{u16(b,i,n&65535);u16(b,i+2,(n>>>16)&65535);};
 for(const {name,xml,method=8} of entries){
  const n=ENC.encode(name),raw=ENC.encode(xml),packed=method===8?deflateRawSync(raw):raw,crc=crc32(raw);
  const l=new Uint8Array(30+n.length+packed.length);
  u32(l,0,0x04034b50);u16(l,4,20);u16(l,6,0);u16(l,8,method);
  u32(l,14,crc);u32(l,18,packed.length);u32(l,22,raw.length);u16(l,26,n.length);
  l.set(n,30);l.set(packed,30+n.length);local.push(l);
  const c=new Uint8Array(46+n.length);
  u32(c,0,0x02014b50);u16(c,4,20);u16(c,6,20);u16(c,10,method);
  u32(c,16,crc);u32(c,20,packed.length);u32(c,24,raw.length);
  u16(c,28,n.length);u32(c,42,offset);c.set(n,46);centers.push(c);
  offset+=l.length;
 }
 const totalCentral=centers.reduce((n,c)=>n+c.length,0);
 const end=new Uint8Array(22);
 u32(end,0,0x06054b50);u16(end,8,entries.length);u16(end,10,entries.length);
 u32(end,12,totalCentral);u32(end,16,offset);
 const output=new Uint8Array(offset+totalCentral+22);
 let p=0;for(const chunk of [...local,...centers,end]){output.set(chunk,p);p+=chunk.length;}
 return output;
}
function qaDocx({body=DOC_BODY,settings,extraEntries=[],method=8}={}){
 return qaZip([
  {name:'[Content_Types].xml',xml:CONTENT_TYPES,method},
  {name:'_rels/.rels',xml:RELS,method},
  {name:'word/document.xml',xml:wordDoc(body),method},
  ...(settings?[{name:'word/settings.xml',xml:XML_HEAD+'<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+settings+'</w:settings>',method}]:[]),
  ...extraEntries
 ]);
}

function fixture({session=true,acl=true,quota=true,role='lawyer',
 convert=true,converted=GOOD,revokeAfterConvert=false}={}){
 const calls=[],conversions=[],runs=[];
 let aclReads=0;
 const env={AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:I,
  DB:{prepare(sql){return {bind(...args){
    calls.push({sql,args});
    return {async first(){
      if(sql.includes('FROM qa_sessions s'))return session?{user_id:U,tenant_id:T,role_key:role}:null;
      if(sql===LEGAL_MATTER_ACCESS_SQL){
     aclReads++;
     return acl&&!(revokeAfterConvert&&aclReads>1)?{'1':1}:null;
    }
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
   qaDocx(),'UC04'],
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
  {name:'x'.repeat(121)+'.pdf',status:400},
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
test('R138: revoke or deny Matter during conversion blocks text returned to former member',async()=>{
 const f=fixture({revokeAfterConvert:true});
 const response=await documentExtractApi(req(),f.env,{now:NOW});
 assert.equal(response.status,404);
 const body=await response.text();
 assert.ok(!body.includes(GOOD));
 assert.equal(f.conversions.length,1);
 assert.equal(f.calls.filter(x=>x.sql===LEGAL_MATTER_ACCESS_SQL).length,2);
 assert.equal(f.runs.length,0);
});


test('R140 DOCX preflight: deflated/stored OOXML and tables are detected before provider; no file storage',async()=>{
 for(const method of [0,8]){
  const f=fixture();
  const doc=qaDocx({method,body:'<w:tbl><w:tr><w:tc>'+DOC_BODY+'</w:tc></w:tr></w:tbl>'});
  const proof=await docxSourcePreflight(doc);
  assert.equal(proof.ok,true,JSON.stringify({method,proof}));
  const r=await documentExtractApi(req({name:'table.docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',bytes:doc}),f.env,{now:NOW});
  assert.equal(r.status,200,await r.clone().text());
  const data=await r.json();
  assert.deepEqual(data.document_warnings,['tables_present_review_layout']);
  assert.equal(data.review_required,true);
  assert.equal(data.source_text,GOOD);
  assert.equal(f.conversions.length,1);
  assert.equal(f.runs.length,0);
 }
});
test('R140 DOCX preflight: reject fake/truncated ZIP, duplicate entries, traversal, hidden and redline changes',async()=>{
 const mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
 const cases=[
  ['fake PK',Uint8Array.from([80,75,3,4,20,0,0,0,0,0,0,0])],
  ['truncated',qaDocx().slice(0,-14)],
  ['not OOXML',qaZip([{name:'random.txt',xml:'synthetic test',method:0}])],
  ['hidden text',qaDocx({body:'<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>Confidential clause</w:t></w:r>'+DOC_BODY})],
  ['tracked insertion',qaDocx({body:'<w:ins w:id="1" w:author="qa">'+DOC_BODY+'</w:ins>'})],
  ['tracked deletion',qaDocx({body:'<w:del w:id="2"><w:r><w:delText>Important</w:delText></w:r></w:del>'+DOC_BODY})],
  ['move from',qaDocx({body:'<w:moveFrom w:id="7">'+DOC_BODY+'</w:moveFrom>'})],
  ['track changes settings',qaDocx({settings:'<w:trackRevisions/>'})],
  ['comments',qaDocx({extraEntries:[{name:'word/comments.xml',xml:XML_HEAD+'<w:comments/>',method:8}]})],
  ['footnotes',qaDocx({extraEntries:[{name:'word/footnotes.xml',xml:XML_HEAD+'<w:footnotes/>',method:8}]})],
  ['duplicate part',qaDocx({extraEntries:[{name:'word/document.xml',xml:wordDoc(DOC_BODY),method:0}]})],
  ['zip path traversal',qaDocx({extraEntries:[{name:'../evil.xml',xml:'QA',method:0}]})],
  ['compression unsupported',qaZip([
    {name:'[Content_Types].xml',xml:CONTENT_TYPES,method:0},
    {name:'_rels/.rels',xml:RELS,method:0},
    {name:'word/document.xml',xml:wordDoc(DOC_BODY),method:99}])]
 ];
 for(const [label,bytes] of cases){
  const f=fixture();
  const r=await documentExtractApi(req({name:'unsafe.docx',mime,bytes}),f.env,{now:NOW});
  assert.equal(r.status,422,label+': '+r.status+', '+await r.clone().text());
  const body=await r.json();
  assert.ok(!JSON.stringify(body).includes('Confidential clause'),label);
  assert.equal(f.conversions.length,0,label+' should not reach converter');
  assert.equal(f.runs.length,0);
 }
});
