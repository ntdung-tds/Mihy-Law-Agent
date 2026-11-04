import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const tmp=mkdtempSync(join(tmpdir(),'ai-law-website-'));
const compiled=spawnSync(process.execPath,[resolve('tools/build_cf_site.mjs'),tmp],{encoding:'utf8'});
assert.equal(compiled.status,0,compiled.stderr||compiled.stdout);
const {handleSite}=await import(pathToFileURL(join(tmp,'site_worker.mjs')).href);
const ORIGIN='https://ai-law-web.iaict-platform.workers.dev';
let logged=false;const calls=[];
const env={QA_AUTH:{async fetch(request){
 const u=new URL(request.url);calls.push({path:u.pathname,method:request.method,origin:request.headers.get('Origin')});
 if(u.pathname==='/api/qa/session')return Response.json(
  logged?{email:'qa04.lawyer@ai-law.invalid',role:'lawyer',workspace_type:'organization'}:{error:'denied'},
  {status:logged?200:401});
 if(u.pathname==='/api/qa/login'){
  logged=true;
  return new Response('{"ok":true}',{status:200,headers:{'Content-Type':'application/json','Set-Cookie':'al_qa_session=00000000-0000-4000-8000-000000000000; Path=/; HttpOnly; Secure; SameSite=Strict'}});
 }
 if(u.pathname==='/api/qa/logout'){
  logged=false;
  return new Response('{"ok":true}',{status:200,headers:{'Set-Cookie':'al_qa_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict'}});
 }
 if(u.pathname==='/api/qa/matters')
  return Response.json(request.method==='GET'?{matters:[]}:{id:'f0000000-0000-4000-8000-000000000001',title:'QA synthetic',created_at:1800000000},{status:request.method==='GET'?200:201});
 return new Response('',{status:404});
}}};
const get=(pathname,envArg=env)=>handleSite(new Request(ORIGIN+pathname),envArg);
test('website is an indexable public home with header, footer, real product descriptions',async()=>{
 const r=await get('/');
 assert.equal(r.status,200);
 const html=await r.text();
 for(const text of ['Không gian','<header','<footer','Giải pháp','Câu hỏi','href="/login"','id="hero-title"','AI Law'])assert.ok(html.includes(text),text);
 for(const id of ['about','features','workspace','trust','faq'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.equal(r.headers.get('X-Robots-Tag'),null,'public page is indexable');
 assert.ok(!html.includes('id="matter-form"'),'private workspace not in public HTML');
 const noEnv=await get('/',{});
 assert.equal(noEnv.status,200,'public home works when login service is unavailable');
});
test('public assets include mobile navigation and website styling',async()=>{
 for(const p of ['/site.css','/site.js','/favicon.svg','/robots.txt']){
  const r=await get(p);
  assert.equal(r.status,200,p);
 }
 const css=await (await get('/site.css')).text();
 assert.match(css,/\.hero-grid/);assert.match(css,/\.site-footer/);
 assert.match(css,/@media\(max-width:700px\)/);
 const script=await (await get('/site.js')).text();
 assert.match(script,/aria-expanded/);
 const robots=await (await get('/robots.txt')).text();
 assert.match(robots,/Disallow: \/app/);
});
test('anonymous workspace and assets are denied, login page remains public',async()=>{
 const login=await get('/login');
 assert.equal(login.status,200);
 assert.match(await login.text(),/id="login-form"/);
 assert.equal(login.headers.get('X-Robots-Tag'),'noindex,nofollow,noarchive');
 const r=await get('/app#documents');
 assert.equal(r.status,302);assert.equal(r.headers.get('Location'),'/login');
 for(const p of ['/styles.css','/app.js','/session.js','/matters.js']){
  const d=await get(p);assert.equal(d.status,401,p);
 }
 assert.equal((await get('/app',{})).status,503,'private gate fails closed without QA_AUTH');
});
test('POST login is service-bound and CSRF-origin guarded, cookie unchanged',async()=>{
 const denied=await handleSite(new Request(ORIGIN+'/api/qa/login',{
  method:'POST',headers:{Origin:'https://attacker.invalid','Content-Type':'application/json'},body:'{}'}),env);
 assert.equal(denied.status,403);
 const ok=await handleSite(new Request(ORIGIN+'/api/qa/login',{
  method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json','Sec-Fetch-Site':'same-origin'},
  body:JSON.stringify({email:'qa04.lawyer@ai-law.invalid',password:'synthetic-only-not-real'})}),env);
 assert.equal(ok.status,200);assert.match(ok.headers.get('Set-Cookie')||'',/HttpOnly/);
 assert.equal(calls.at(-1).origin,'https://ai-law-standalone-cf-qa.iaict-platform.workers.dev');
});
test('authenticated workspace retains R0 11 functions and R46 real matter UI',async()=>{
 const r=await get('/app#documents');
 assert.equal(r.status,200);
 const html=await r.text();
 assert.match(html,/Không gian làm việc/);
 assert.match(html,/id="matter-form"/);
 assert.match(html,/mobile-right-rail/);
 for(let i=1;i<=11;i++)assert.match(html,new RegExp('data-feature-jump="UC'+String(i).padStart(2,'0')+'"'));
 assert.equal(r.headers.get('X-Robots-Tag'),'noindex,nofollow,noarchive');
 for(const p of ['/styles.css','/app.js','/session.js','/matters.js']){
  const asset=await get(p);assert.equal(asset.status,200,p);
 }
 const list=await get('/api/qa/matters');
 assert.equal(list.status,200);
 assert.deepEqual((await list.json()).matters,[]);
});
test('POST matter, logout and legacy paths do not bypass permissions',async()=>{
 const csrf=await handleSite(new Request(ORIGIN+'/api/qa/matters',{
  method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},
  body:'{"title":"QA fake"}'}),env);assert.equal(csrf.status,403);
 const save=await handleSite(new Request(ORIGIN+'/api/qa/matters',{
  method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:'{"title":"QA synthetic"}'}),env);
 assert.equal(save.status,201);
 const signout=await handleSite(new Request(ORIGIN+'/api/qa/logout',{
  method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:'{}'}),env);
 assert.equal(signout.status,200);
 assert.match(signout.headers.get('Set-Cookie')||'',/Max-Age=0/);
 assert.equal((await get('/app')).status,302);
 assert.equal((await get('/app/')).status,308);
 assert.equal((await get('/not-found')).status,404);
});
test('public home still works after logout, health honestly says QA environment',async()=>{
 assert.equal((await get('/')).status,200);
 const health=await (await get('/health')).json();
 assert.equal(health.environment,'qa_nonproduction');
 assert.equal(health.workspace_auth_binding,true);
});
after(()=>rmSync(tmp,{recursive:true,force:true}));
