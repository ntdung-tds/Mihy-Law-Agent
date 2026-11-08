import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const dir=mkdtempSync(join(tmpdir(),'ai-law-r62-site-'));
const proc=spawnSync(process.execPath,[resolve('tools/build_cf_site.mjs'),dir],{encoding:'utf8'});
assert.equal(proc.status,0,proc.stderr||proc.stdout);
const {handleSite}=await import(pathToFileURL(join(dir,'site_worker.mjs')).href);
const ORIGIN='https://ai-law-web-qa.iaict-platform.workers.dev';
const authOrigin='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const ORIGINAL='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NEW='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TARGET='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const observed=[];
const env={QA_AUTH:{async fetch(request){
  observed.push({path:new URL(request.url).pathname,
    origin:request.headers.get('Origin'),cookie:request.headers.get('Cookie'),
    method:request.method,fetchSite:request.headers.get('Sec-Fetch-Site')});
  const route=new URL(request.url).pathname;
  if(route==='/api/qa/workspaces')
    return Response.json({current_tenant_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      workspaces:[{tenant_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        role:'lawyer',workspace_type:'organization'},{tenant_id:TARGET,role:'lawyer',workspace_type:'personal'}]});
  if(route==='/api/qa/switch-workspace')
    return Response.json({ok:true},{headers:{'Set-Cookie':
      'al_qa_session='+NEW+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=300'}});
  return Response.json({error:'no session'},{status:401});
}}};
const req=(path,{method='GET',origin=ORIGIN,cookie=true,body}={})=>
  new Request(ORIGIN+path,{method,headers:{
    ...(cookie?{Cookie:'al_qa_session='+ORIGINAL}:{}),
    ...(method==='POST'?{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
test('R62: workspace list remains cookie-bound through same-origin service',async()=>{
  const r=await handleSite(req('/api/qa/workspaces'),env);
  assert.equal(r.status,200);
  const data=await r.json();
  assert.equal(data.workspaces.length,2);
  assert.equal(observed.at(-1).cookie,'al_qa_session='+ORIGINAL);
  assert.equal(observed.at(-1).origin,null);
  assert.equal(observed.at(-1).method,'GET');
});
test('R62: switch requires original origin and preserves rotated HttpOnly cookie',async()=>{
  const bad=await handleSite(req('/api/qa/switch-workspace',{
    method:'POST',origin:'https://evil.example.invalid',body:{tenant_id:TARGET}}),env);
  assert.equal(bad.status,403);
  const good=await handleSite(req('/api/qa/switch-workspace',{
    method:'POST',body:{tenant_id:TARGET}}),env);
  assert.equal(good.status,200);
  assert.match(good.headers.get('Set-Cookie')||'',/HttpOnly; Secure; SameSite=Strict/);
  assert.equal(observed.at(-1).origin,authOrigin);
  assert.equal(observed.at(-1).fetchSite,'same-origin');
  assert.equal(observed.at(-1).method,'POST');
  assert.equal(good.headers.get('Cache-Control'),'no-store');
});
test('R62: wrong route methods fail closed before reaching auth worker',async()=>{
  const before=observed.length;
  for(const request of [
    req('/api/qa/switch-workspace'),
    req('/api/qa/workspaces',{method:'POST',body:{}}),
    req('/api/qa/login'),
  ]){
    assert.equal((await handleSite(request,env)).status,404);
  }
  assert.equal(observed.length,before);
});
test('R138: file preview POST passes through same-origin QA service but denies other origins/methods',async()=>{
 const form=new FormData();
 form.append('uc','UC03');
 form.append('file',new Blob(['%PDF-1.4'],{type:'application/pdf'}),'synthetic.pdf');
 const request=new Request(ORIGIN+'/api/qa/legal/extract',{method:'POST',
  headers:{Origin:ORIGIN,'Sec-Fetch-Site':'same-origin',Cookie:'al_qa_session='+ORIGINAL},
  body:form});
 const result=await handleSite(request,env);
 assert.equal(result.status,401,'Relay does not invent authorization');
 assert.equal(observed.at(-1).path,'/api/qa/legal/extract');
 assert.equal(observed.at(-1).origin,authOrigin);
 assert.equal(observed.at(-1).cookie,'al_qa_session='+ORIGINAL);
 assert.equal(observed.at(-1).method,'POST');
 const n=observed.length;
 const forbidden=new Request(ORIGIN+'/api/qa/legal/extract',{method:'POST',
  headers:{Origin:'https://malicious.example.invalid','Sec-Fetch-Site':'cross-site'},
  body:new FormData()});
 assert.equal((await handleSite(forbidden,env)).status,403);
 assert.equal((await handleSite(req('/api/qa/legal/extract'),env)).status,404);
 assert.equal(observed.length,n);
});
rmSync(dir,{recursive:true,force:true});
