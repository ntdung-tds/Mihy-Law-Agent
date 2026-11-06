import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const temp=mkdtempSync(join(tmpdir(),'ai-law-preview-'));
const proc=spawnSync(process.execPath,[resolve('tools/build_cf_r0_preview.mjs'),temp],{encoding:'utf8'});
assert.equal(proc.status,0,proc.stderr||proc.stdout);
const {handlePreview}=await import(pathToFileURL(join(temp,'r0_preview_worker.mjs')).href);
const origin='https://ai-law-r0-preview.iaict-platform.workers.dev';
let logged=false,requests=[];
const env={QA_AUTH:{async fetch(req){
  const u=new URL(req.url);
  requests.push({url:u.href,origin:req.headers.get('Origin'),method:req.method});
  if(u.pathname==='/api/qa/session')
    return Response.json(logged?{email:'qa04.lawyer@ai-law.invalid',role:'lawyer',workspace_type:'organization'}:{error:'denied'},{status:logged?200:401});
  if(u.pathname==='/api/qa/login'){
    logged=true;
    return new Response('{"ok":true}',{headers:{'Content-Type':'application/json','Set-Cookie':'al_qa_session=00000000-0000-4000-8000-000000000000; Path=/; HttpOnly; Secure; SameSite=Strict'}});
  }
  if(u.pathname==='/api/qa/matters') {
    return Response.json(req.method==='GET'?{matters:[]}:{id:'f0000000-0000-4000-8000-000000000001',title:'QA case',created_at:1800000000},{status:req.method==='GET'?200:201});
  }
  if(u.pathname==='/api/qa/change-password'){
    if(!logged)return new Response('{"error":"expired"}',{status:401});
    logged=false;
    return new Response('{"ok":true}',{headers:{'Content-Type':'application/json',
      'Set-Cookie':'al_qa_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'}});
  }
  if(u.pathname==='/api/qa/logout'){
    logged=false;
    return new Response('{"ok":true}',{headers:{'Set-Cookie':'al_qa_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict'}});
  }
  return new Response('',{status:404});
}}};
test('anonymous preview URL with existing tracking query and #documents renders QA login',async()=>{
  const r=await handlePreview(new Request(origin+'/?utm_source=chatgpt.com#documents'),env);
  assert.equal(r.status,200);
  const html=await r.text();
  assert.match(html,/id="login-form"/);assert.match(html,/preview-login\.js/);
  assert.doesNotMatch(html,/11 nghiệp vụ hỗ trợ luật sư/);
  const denied=await handlePreview(new Request(origin+'/app.js'),env);
  assert.equal(denied.status,401);
});
test('login API rejects CSRF, forwards valid Origin internally and preserves HttpOnly cookie',async()=>{
  const attacker=await handlePreview(new Request(origin+'/api/qa/login',{method:'POST',
    headers:{Origin:'https://attacker.invalid','Content-Type':'application/json'},body:'{}'}),env);
  assert.equal(attacker.status,403);
  const valid=await handlePreview(new Request(origin+'/api/qa/login',{method:'POST',
    headers:{Origin:origin,'Content-Type':'application/json','Sec-Fetch-Site':'same-origin'},
    body:'{"email":"qa04.lawyer@ai-law.invalid","password":"synthetic-fake"}'}),env);
  assert.equal(valid.status,200);
  assert.match(valid.headers.get('Set-Cookie')||'',/HttpOnly/);
  assert.equal(requests.at(-1).origin,'https://ai-law-standalone-cf-qa.iaict-platform.workers.dev');
});
test('authenticated preview serves all four areas and 11 right-drawer functions',async()=>{
  const r=await handlePreview(new Request(origin+'/#documents',{headers:{Cookie:'al_qa_session=mock'}}),env);
  assert.equal(r.status,200);
  const html=await r.text();
  for(const id of ['UC01','UC02','UC03','UC04','UC05','UC06','UC07','UC08','UC09','UC10','UC11'])
    assert.match(html,new RegExp('data-feature-jump="'+id+'"'));
  assert.match(html,/mobile-bottom-nav/);assert.match(html,/id="preview-logout"/);
  for(const file of ['/styles.css','/app.js','/session.js','/matters.js'])
    assert.equal((await handlePreview(new Request(origin+file),env)).status,200);
});
test('R46 real matter API GET/POST are same-origin, service-bound and not public mock documents',async()=>{
  logged=true;
  const privateJs=await handlePreview(new Request(origin+'/matters.js',{headers:{Cookie:'al_qa_session=mock'}}),env);
  assert.equal(privateJs.status,200);
  assert.match(await privateJs.text(),/api\/qa\/matters/);
  const list=await handlePreview(new Request(origin+'/api/qa/matters',{headers:{Cookie:'al_qa_session=mock'}}),env);
  assert.equal(list.status,200);assert.deepEqual((await list.json()).matters,[]);
  const csrf=await handlePreview(new Request(origin+'/api/qa/matters',{
    method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:'{}'}),env);
  assert.equal(csrf.status,403);
  const created=await handlePreview(new Request(origin+'/api/qa/matters',{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{"title":"QA case"}'}),env);
  assert.equal(created.status,201);
  assert.equal(requests.at(-1).origin,'https://ai-law-standalone-cf-qa.iaict-platform.workers.dev');
});
test('R66 password change is QA service-bound, CSRF protected and clears the old session',async()=>{
 logged=true;
 const page=await handlePreview(new Request(origin+'/',{headers:{Cookie:'al_qa_session=mock'}}),env);
 assert.match(await page.text(),/id="change-password-dialog"/);
 const noGet=await handlePreview(new Request(origin+'/api/qa/change-password'),env);
 assert.equal(noGet.status,404);
 const csrf=await handlePreview(new Request(origin+'/api/qa/change-password',{method:'POST',
   headers:{Origin:'https://untrusted.invalid','Content-Type':'application/json'},body:'{}'}),env);
 assert.equal(csrf.status,403);
 const res=await handlePreview(new Request(origin+'/api/qa/change-password',{method:'POST',
   headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},
   body:JSON.stringify({current_password:'only-test-old',new_password:'only-test-new'})}),env);
 assert.equal(res.status,200);
 assert.match(res.headers.get('Set-Cookie'),/Max-Age=0/);
 assert.equal(requests.at(-1).origin,'https://ai-law-standalone-cf-qa.iaict-platform.workers.dev');
});
test('logout is CSRF protected and clears session',async()=>{
  const bad=await handlePreview(new Request(origin+'/api/qa/logout',{method:'POST',headers:{Origin:'https://evil.invalid'},body:'{}'}),env);
  assert.equal(bad.status,403);
  const good=await handlePreview(new Request(origin+'/api/qa/logout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}),env);
  assert.equal(good.status,200);assert.match(good.headers.get('Set-Cookie')||'',/Max-Age=0/);
  assert.match(await (await handlePreview(new Request(origin+'/'),env)).text(),/id="login-form"/);
});
test('unavailable backend fails closed, unsupported routes do not route to QA',async()=>{
  assert.equal((await handlePreview(new Request(origin+'/'),{})).status,503);
  assert.equal((await handlePreview(new Request(origin+'/styles.css'),{})).status,503);
  assert.equal((await handlePreview(new Request(origin+'/not-a-route'),env)).status,404);
});
after(()=>rmSync(temp,{recursive:true,force:true}));
