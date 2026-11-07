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
 if(u.pathname==='/api/qa/profile')return Response.json(
   logged?{email:'qa04.lawyer@ai-law.invalid',profile:{display_name:'QA User',phone:'',job_title:'',bio:'',avatar_data:''},
     plan:{code:'demo',source:'qa_nonproduction',billing_active:false},
     active_workspace:{tenant_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role:'lawyer',type:'organization'},
     workspaces:[{tenant_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role:'lawyer',type:'organization'}]}
   :{error:'denied'},{status:logged?200:401});
 if(u.pathname==='/api/qa/profile/avatar')return Response.json(logged?{ok:true}:{error:'denied'},
   {status:logged?200:401});
 if(u.pathname==='/api/qa/change-password'){
  if(!logged)return Response.json({error:'denied'},{status:401});
  logged=false;
  return new Response('{"ok":true,"login_required":true}',{status:200,headers:{
   'Content-Type':'application/json',
   'Set-Cookie':'al_qa_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict'
  }});
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
 for(const text of ['Không gian','<header','<footer','Giải pháp','Câu hỏi','href="/login"','id="hero-title"','Mihy Law AI Agent'])assert.ok(html.includes(text),text);
 for(const id of ['about','features','workspace','trust','faq'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.equal(r.headers.get('X-Robots-Tag'),null,'public page is indexable');
 assert.ok(!html.includes('id="matter-form"'),'private workspace not in public HTML');
 const noEnv=await get('/',{});
 assert.equal(noEnv.status,200,'public home works when login service is unavailable');
});
test('both Mihy Agent landing pages serve as public pages and cannot expose private workspace',async()=>{
 for(const [path,heading] of [
  ['/trien-khai-rieng','AI pháp lý của bạn.'],
  ['/dich-vu-theo-goi','Việc pháp lý của bạn.']
 ]){
  const r=await get(path,{});
  assert.equal(r.status,200,path);
  assert.equal(r.headers.get('X-Robots-Tag'),null);
  const html=await r.text();
  assert.ok(html.includes(heading),path);
  assert.ok(html.includes('Mihy Law AI Agent'),path);
  assert.ok(html.includes('Mihy Agent'),path);
  assert.ok(html.includes('class="detail-hero"'),path);
  assert.ok(html.includes('detail-faq"'),path);
  assert.ok(html.includes('href="/login"'),path);
  assert.ok(!html.includes('id="matter-form"'),path);
 }
 const service=await (await get('/dich-vu-theo-goi')).text();
 assert.match(service,/chưa mở bán/);
 assert.match(service,/không có chức năng đăng ký hoặc thanh toán/);
});
test('four rich editorial routes remain public with shared company contact and no credential leaks',async()=>{
 for(const route of ['/gioi-thieu','/giai-phap','/chuc-nang','/an-toan-du-lieu']){
  const r=await get(route,{});
  assert.equal(r.status,200,route);
  const html=await r.text();
  assert.match(html,/id="editorial-title"/);
  assert.match(html,/Số 9 Tôn Thất Thuyết/);
  assert.match(html,/href="tel:\+84588550000"/);
  assert.match(html,/href="mailto:dungnt.myh@outlook.com"/);
  assert.ok(!html.includes('id="matter-form"'));
 }
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
 for(const p of ['/styles.css','/app.js','/session.js','/matters.js','/account.css','/account.js']){
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
 assert.match(html,/mobile-bottom-nav/);
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
test('R66 real workspace displays QA password change and same-origin service relay works',async()=>{
 const signIn=await handleSite(new Request(ORIGIN+'/api/qa/login',{
  method:'POST',headers:{Origin:ORIGIN,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},
  body:JSON.stringify({email:'synthetic@qa.invalid',password:'synthetic-only'})}),env);
 assert.equal(signIn.status,200);
 const app=await get('/app');
 assert.equal(app.status,200);
 const html=await app.text();
 for(const id of ['change-password-top','change-password-drawer','change-password-dialog','change-password-form',
                   'current-password','new-password','confirm-password'])assert.match(html,new RegExp('id="'+id+'"'));
 const js=await (await get('/session.js')).text();
 assert.match(js,/\/api\/qa\/change-password/);
 assert.equal((await get('/api/qa/change-password')).status,404,'GET not supported');
 const body=JSON.stringify({current_password:'synthetic-old',new_password:'synthetic-new-different'});
 const csrf=await handleSite(new Request(ORIGIN+'/api/qa/change-password',{method:'POST',
  headers:{Origin:'https://malicious.invalid','Content-Type':'application/json'},body}),env);
 assert.equal(csrf.status,403);
 const result=await handleSite(new Request(ORIGIN+'/api/qa/change-password',{method:'POST',
  headers:{Origin:ORIGIN,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body}),env);
 assert.equal(result.status,200);
 assert.match(result.headers.get('Set-Cookie')||'',/Max-Age=0/);
 assert.equal(calls.at(-1).origin,'https://ai-law-standalone-cf-qa.iaict-platform.workers.dev');
 assert.equal((await get('/app')).status,302,'change revokes current session');
});
test('R67 private account center shows profile, avatar, plan and permissions with origin-bound APIs',async()=>{
 logged=false;
 assert.equal((await get('/account')).status,302);
 assert.equal((await get('/account.css')).status,401);
 assert.equal((await get('/account.js')).status,401);
 const signed=await handleSite(new Request(ORIGIN+'/api/qa/login',{
   method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},
   body:'{"email":"qa@invalid.test","password":"synthetic"}'}),env);
 assert.equal(signed.status,200);
 const r=await get('/account');
 assert.equal(r.status,200);
 assert.equal(r.headers.get('X-Robots-Tag'),'noindex,nofollow,noarchive');
 const html=await r.text();
 for(const id of ['profile-form','avatar-file','plan-name','access-role','workspaces-list',
                  'account-password-form','profile-email','avatar-remove'])
   assert.match(html,new RegExp('id="'+id+'"'));
 for(const path of ['/account.css','/account.js']){
   const a=await get(path);assert.equal(a.status,200,path);
 }
 const workspace=await (await get('/app')).text();
 assert.match(workspace,/href="\/account"/);
 assert.equal((await get('/account/')).status,308);
 const profile=await get('/api/qa/profile');
 assert.equal(profile.status,200);
 assert.equal((await profile.json()).plan.code,'demo');
 const data=JSON.stringify({display_name:'QA X',phone:'',job_title:'',bio:''});
 const bad=await handleSite(new Request(ORIGIN+'/api/qa/profile',{
   method:'POST',headers:{Origin:'https://fake.invalid','Content-Type':'application/json'},body:data}),env);
 assert.equal(bad.status,403);
 const good=await handleSite(new Request(ORIGIN+'/api/qa/profile',{
   method:'POST',headers:{Origin:ORIGIN,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},
   body:data}),env);
 assert.equal(good.status,200);
 const upload=await handleSite(new Request(ORIGIN+'/api/qa/profile/avatar',{
   method:'POST',headers:{Origin:ORIGIN,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},
   body:'{"avatar_data":""}'}),env);
 assert.equal(upload.status,200);
 assert.equal(calls.at(-1).origin,'https://ai-law-standalone-cf-qa.iaict-platform.workers.dev');
 assert.equal((await handleSite(new Request(ORIGIN+'/api/qa/profile/avatar'),env)).status,404);
});
test('public home still works after logout, health honestly says QA environment',async()=>{
 assert.equal((await get('/')).status,200);
 const health=await (await get('/health')).json();
 assert.equal(health.environment,'qa_nonproduction');
 assert.equal(health.workspace_auth_binding,true);
});
after(()=>rmSync(tmp,{recursive:true,force:true}));

test('Google Drive return uses public 200 first-party landing, then Strict-cookie-friendly local navigation',async()=>{
 logged=false;
 const first=await get('/drive-return?drive=connected',{});
 assert.equal(first.status,200,'landing works without session cookies');
 assert.equal(first.headers.get('Referrer-Policy'),'no-referrer');
 assert.equal(first.headers.get('X-Robots-Tag'),'noindex,nofollow,noarchive');
 assert.equal(first.headers.get('Set-Cookie'),null,'landing must not mint sessions');
 const html=await first.text();
 assert.match(html,/http-equiv="refresh" content="0;url=\/app\?drive=connected#documents"/);
 assert.match(html,/href="\/app\?drive=connected#documents"/);
 assert.ok(!html.includes('code='),'OAuth codes never returned to client');
 const failed=await get('/drive-return?drive=failed&issue=drive',{});
 assert.equal(failed.status,200);
 assert.match(await failed.text(),/\/app\?drive=failed&issue=drive#documents/);
 const unsafe=await get('/drive-return?drive=failed&issue=%3Cscript%3E&next=https%3A%2F%2Fevil.invalid',{});
 const safeHtml=await unsafe.text();
 assert.equal(unsafe.status,200);
 assert.ok(!safeHtml.includes('evil.invalid'));
 assert.ok(!safeHtml.includes('<script>'));
 assert.match(safeHtml,/\/app\?drive=failed#documents/);
 assert.equal((await get('/drive-return?drive=unexpected',{})).status,404);
 assert.equal((await get('/app')).status,302,'protected app still requires signed-in user');
});

test('R80 Drive disconnect route is POST-only, relayed with same-origin CSRF and no secret in response',async()=>{
 const hits=[];
 const isolated={QA_AUTH:{async fetch(request){
  hits.push({pathname:new URL(request.url).pathname,method:request.method,
   origin:request.headers.get('Origin')});
  return Response.json({connected:false,disconnected:true,files_preserved:true});
 }}};
 const url=ORIGIN+'/api/qa/drive/disconnect';
 const getResult=await handleSite(new Request(url),isolated);
 assert.equal(getResult.status,404);
 assert.equal(hits.length,0,'GET is not relayed');
 const cross=await handleSite(new Request(url,{method:'POST',
  headers:{Origin:'https://evil.invalid','Sec-Fetch-Site':'cross-site'}}),isolated);
 assert.equal(cross.status,403);
 assert.equal(hits.length,0,'cross-origin POST must not reach the backend');
 const success=await handleSite(new Request(url,{method:'POST',
  headers:{Origin:ORIGIN,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:'{}'}),isolated);
 assert.equal(success.status,200);
 assert.deepEqual(await success.json(),{connected:false,disconnected:true,files_preserved:true});
 assert.equal(hits.length,1);
 assert.equal(hits[0].method,'POST');
 assert.equal(hits[0].pathname,'/api/qa/drive/disconnect');
 assert.equal(hits[0].origin,'https://ai-law-standalone-cf-qa.iaict-platform.workers.dev');
});

test('R86 QA CSP permits only Google Drive API as extra cross-origin upload destination',async()=>{
 const resp=await get('/login');
 assert.equal(resp.status,200);
 const csp=resp.headers.get('Content-Security-Policy')||'';
 assert.match(csp,/connect-src 'self' https:\/\/www\.googleapis\.com;/);
 assert.doesNotMatch(csp,/connect-src[^;]*\*/);
 assert.doesNotMatch(csp,/connect-src[^;]*storage\.googleapis\.com/);
});

test('R90 isolated Blob to Drive page is hosted static, without QA auth or Cloudflare upload',async()=>{
 logged=false;
 const before=calls.length;
 const r=await get('/drive-blob',{});
 assert.equal(r.status,200);
 assert.equal(calls.length,before,'no service-binding authentication for public QA probe');
 assert.equal(r.headers.get('X-Robots-Tag'),'noindex,nofollow,noarchive');
 const html=await r.text();
 assert.match(html,/Google Drive/);
 assert.match(html,/id="drive-blob-test"/);
 assert.match(html,/data-google-client-id="[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com"/);
 assert.match(html,/https:\/\/accounts\.google\.com\/gsi\/client/);
 assert.match(r.headers.get('Content-Security-Policy'),/accounts\.google\.com/);
 assert.match(r.headers.get('Content-Security-Policy'),/www\.googleapis\.com/);
 assert.equal((await get('/drive-blob.js',{})).status,200);
 const js=await (await get('/drive-blob.js',{})).text();
 assert.match(js,/new Blob\(/);
 assert.match(js,/uploadType=multipart/);
 assert.match(js,/google\.accounts\.oauth2\.initTokenClient/);
 assert.doesNotMatch(js,/fetch\(\s*['"]\/api\/qa\//);
 assert.doesNotMatch(js,/localStorage|sessionStorage/);
 assert.equal((await handleSite(new Request(ORIGIN+'/drive-blob',{method:'POST'}),{})).status,404);
 assert.equal(calls.length,before,'no Cloudflare API route used for Blob test');
 const robots=await (await get('/robots.txt')).text();
 assert.match(robots,/Disallow: \/drive-blob/);
});

test('R97 authenticated QA documents workspace hosts the proven direct Blob uploader without changing MatterACL flow',async()=>{
 logged=false;
 const denied=await get('/app');
 assert.equal(denied.status,302,'anonymous app still redirects to login');
 const closed=await get('/drive-inline.js');
 assert.equal(closed.status,401,'private lazy loader is never anonymously available');
 logged=true;
 const r=await get('/app');
 assert.equal(r.status,200);
 const html=await r.text();
 assert.match(html,/id="qa-direct-drive-panel"/);
 assert.match(html,/id="drive-blob-test"/);
 assert.match(html,/data-google-client-id="748514165913-petg8vmsa7cvkmvutothq5g8keocuvga\.apps\.googleusercontent\.com"/);
 assert.match(html,/src="\/drive-inline\.js"/);
 assert.match(html,/không được gắn với hồ sơ AI Law/);
 assert.match(html,/id="document-upload-form"/,'existing ACL-backed upload is retained');
 assert.doesNotMatch(html,/src="https:\/\/accounts\.google\.com\/gsi\/client"/,
  'external OAuth script loads lazily after explicit user opening');
 const csp=r.headers.get('Content-Security-Policy')||'';
 assert.match(csp,/script-src 'self' https:\/\/accounts\.google\.com https:\/\/apis\.google\.com;/);
 assert.match(csp,/frame-src https:\/\/accounts\.google\.com https:\/\/docs\.google\.com;/);
 assert.doesNotMatch(csp,/script-src[^;]*\*/);
 assert.equal(r.headers.get('Cross-Origin-Opener-Policy'),'same-origin-allow-popups');
 const js=await get('/drive-inline.js');
 assert.equal(js.status,200);
 const source=await js.text();
 assert.match(source,/panel\.addEventListener\('toggle'/);
 assert.match(source,/https:\/\/accounts\.google\.com\/gsi\/client/);
 assert.match(source,/verified\.src='\/drive-blob\.js'/);
 assert.doesNotMatch(source,/\/api\/qa\/documents|access_token|refresh_token|localStorage/);
 const login=await get('/login');
 assert.doesNotMatch(login.headers.get('Content-Security-Policy')||'',/accounts\.google\.com/);
});

test('R104 Google Picker key is checked server-side only for active AI Law sessions',async()=>{
 logged=false;
 const key='AIza'+'X'.repeat(35); // synthetic PUBLIC API key shape, not an account credential
 const withKey={...env,GOOGLE_PICKER_API_KEY:key};
 const denied=await get('/api/qa/drive/picker-config',withKey);
 assert.equal(denied.status,401);
 assert.doesNotMatch(await denied.text(),/AIza/,'no unauthorized API key exposure');
 logged=true;
 const unavailable=await get('/api/qa/drive/picker-config');
 assert.equal(unavailable.status,503,'no silent fake Picker when no key provisioned');
 assert.equal((await unavailable.json()).configured,false);
 const configured=await get('/api/qa/drive/picker-config',withKey);
 assert.equal(configured.status,200);
 const data=await configured.json();
 assert.equal(data.configured,true);
 assert.equal(data.api_key,key);
 assert.equal(configured.headers.get('Cache-Control'),'no-store');
 const landing=await get('/');
 assert.doesNotMatch(landing.headers.get('Content-Security-Policy')||'',/apis\.google\.com/);
 const login=await get('/login');
 assert.doesNotMatch(login.headers.get('Content-Security-Policy')||'',/docs\.google\.com/);
});

test('R100 download relay preserves exact verified bytes, file type, length and attachment disposition',async()=>{
 const content=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF\n');
 const fileId='77777777-7777-4777-8777-777777777777';
 const fake={QA_AUTH:{async fetch(request){
  assert.equal(new URL(request.url).pathname,'/api/qa/documents/'+fileId+'/download');
  return new Response(content,{status:200,headers:{
   'Content-Type':'application/pdf','Content-Length':String(content.length),
   'Content-Disposition':"attachment; filename*=UTF-8''qa_gpt.pdf",
   'Cache-Control':'no-store'
  }});
 }}};
 const result=await handleSite(new Request(ORIGIN+'/api/qa/documents/'+fileId+'/download'),fake);
 assert.equal(result.status,200);
 assert.equal(result.headers.get('Content-Length'),String(content.length));
 assert.equal(result.headers.get('Content-Type'),'application/pdf');
 assert.match(result.headers.get('Content-Disposition'),/filename\*/);
 assert.deepEqual(new Uint8Array(await result.arrayBuffer()),content);
});
