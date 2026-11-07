/* R47 AI Law official website shell: public brand pages + privately gated R0 workspace.
   Same-origin R44 QA sessions/MatterACL through service binding; NONPRODUCTION QA.
   No marketing copy claims that legal AI, Google Drive or production IAM is live.
 */
import { SITE_HTML } from './public_html.mjs';
import { LANDING_PRIVATE_HTML } from './landing_private_html.mjs';
import { LANDING_SUBSCRIPTION_HTML } from './landing_subscription_html.mjs';
import { LANDING_ABOUT_HTML } from './landing_about_html.mjs';
import { LANDING_SOLUTIONS_HTML } from './landing_solutions_html.mjs';
import { LANDING_FEATURES_HTML } from './landing_features_html.mjs';
import { LANDING_SECURITY_HTML } from './landing_security_html.mjs';
import { FOOTER_CONTACT_HTML } from './footer_contact_html.mjs';
import { SITE_CSS } from './public_css.mjs';
import { SITE_JS } from './public_js.mjs';
import { LOGIN_HTML } from './login_html.mjs';
import { LOGIN_JS } from './login_js.mjs';
import { WORKSPACE_HTML } from './workspace_html.mjs';
import { WORKSPACE_CSS } from './workspace_css.mjs';
import { WORKSPACE_JS } from './workspace_js.mjs';
import { WORKSPACE_SESSION } from './workspace_session.mjs';
import { WORKSPACE_MATTERS } from './workspace_matters.mjs';
import { WORKSPACE_DOCUMENTS } from './workspace_documents.mjs';
import { WORKSPACE_LEGAL } from './workspace_legal.mjs';
import { ACCOUNT_HTML } from './account_html.mjs';
import { ACCOUNT_CSS } from './account_css.mjs';
import { ACCOUNT_JS } from './account_js.mjs';
import { DRIVE_BLOB_HTML } from './drive_blob_html.mjs';
import { DRIVE_BLOB_JS } from './drive_blob_js.mjs';
import { DRIVE_INLINE_HTML } from './drive_inline_html.mjs';
import { DRIVE_INLINE_JS } from './drive_inline_js.mjs';

const AUTH_ORIGIN='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const API=new Set(['/api/qa/session','/api/qa/login','/api/qa/logout','/api/qa/matters','/api/qa/legal/run','/api/qa/workspaces','/api/qa/switch-workspace','/api/qa/change-password','/api/qa/profile','/api/qa/profile/avatar','/api/qa/drive/status','/api/qa/drive/connect','/api/qa/drive/disconnect']);
const privateAssets=new Map([
 ['/styles.css',[WORKSPACE_CSS,'text/css; charset=utf-8']],
 ['/app.js',[WORKSPACE_JS,'application/javascript; charset=utf-8']],
 ['/session.js',[WORKSPACE_SESSION,'application/javascript; charset=utf-8']],
 ['/matters.js',[WORKSPACE_MATTERS,'application/javascript; charset=utf-8']],
 ['/documents.js',[WORKSPACE_DOCUMENTS,'application/javascript; charset=utf-8']],
 ['/legal.js',[WORKSPACE_LEGAL,'application/javascript; charset=utf-8']],
 ['/account.css',[ACCOUNT_CSS,'text/css; charset=utf-8']],
 ['/account.js',[ACCOUNT_JS,'application/javascript; charset=utf-8']],
 ['/drive-inline.js',[DRIVE_INLINE_JS,'application/javascript; charset=utf-8']]
]);
const publicAssets=new Map([
 ['/site.css',[SITE_CSS,'text/css; charset=utf-8']],
 ['/site.js',[SITE_JS,'application/javascript; charset=utf-8']],
 ['/site-login.js',[LOGIN_JS,'application/javascript; charset=utf-8']]
]);
const svgIcon=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#26233c"/><path d="M13 48V17h8l11 17 11-17h8v31h-8V31L32 47 21 31v17z" fill="#f8e5d8"/><path d="M43 16h16m-8-6v16m-7-10-4 7h8l-4-7zm14 0-4 7h8l-4-7zm-7 12v3m-6 1h12" stroke="#d7e8dc" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const csp="default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://www.googleapis.com; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'";
const driveBlobCsp="default-src 'none'; script-src 'self' https://accounts.google.com; style-src 'unsafe-inline'; frame-src https://accounts.google.com; connect-src https://www.googleapis.com https://accounts.google.com; img-src 'self' data: https://accounts.google.com https://*.gstatic.com; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'";
// Same OAuth popup origin as the Owner-verified isolated R93 upload page,
// scoped to the authenticated /app page only; ordinary private assets and
// all public website routes keep their original restrictive CSP.
const directWorkspaceCsp=csp
 .replace("script-src 'self';","script-src 'self' https://accounts.google.com;")
 .replace("connect-src 'self' https://www.googleapis.com;","connect-src 'self' https://www.googleapis.com https://accounts.google.com; frame-src https://accounts.google.com;");
function directWorkspaceHeaders(type){
 const h=headers(type); h['Content-Security-Policy']=directWorkspaceCsp;
 h['Cross-Origin-Opener-Policy']='same-origin-allow-popups';
 h['Referrer-Policy']='no-referrer';
 return h;
}
function blobHeaders(type){
 const h=headers(type);
 h['Content-Security-Policy']=driveBlobCsp;
 h['Referrer-Policy']='no-referrer';
 h['Cross-Origin-Opener-Policy']='same-origin-allow-popups';
 return h;
}
function headers(type,{publicPage=false}={}){
 return {
  'Content-Type':type,'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Cross-Origin-Resource-Policy':'same-origin',
  'Content-Security-Policy':csp,
  'Vary':'Cookie',
  ...(publicPage?{}:{'X-Robots-Tag':'noindex,nofollow,noarchive'})
 };
}
const respond=(body,type='text/html; charset=utf-8',status=200,options={})=>
  new Response(body,{status,headers:headers(type,options)});
const redirect=(to,status=302)=>new Response(null,{status,headers:{
  'Location':to,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex,nofollow'
}});
const unavailable=()=>respond('Không thể xác minh phiên làm việc. Vui lòng thử lại.','text/plain; charset=utf-8',503);
const missing=()=>respond('Không tìm thấy trang.','text/plain; charset=utf-8',404);
async function relay(request,env,path){
 if(!env||!env.QA_AUTH||typeof env.QA_AUTH.fetch!=='function')throw Error('QA service binding not configured');
 if(!['GET','POST','PATCH'].includes(request.method))return respond('Method not allowed','text/plain; charset=utf-8',405);
 const inbound=new URL(request.url);
 if(request.method!=='GET' && (request.headers.get('Origin')!==inbound.origin ||
   request.headers.get('Sec-Fetch-Site')==='cross-site'))
   return respond(JSON.stringify({error:'Không hợp lệ: nguồn truy cập không được phép.'}),'application/json; charset=utf-8',403);
 const target=new URL(path,AUTH_ORIGIN);
 const h=new Headers();
 const cookie=request.headers.get('Cookie');
 if(cookie)h.set('Cookie',cookie);
 const type=request.headers.get('Content-Type');
 if(type)h.set('Content-Type',type);
 if(request.method!=='GET'){h.set('Origin',target.origin);h.set('Sec-Fetch-Site','same-origin');}
 const upstream=await env.QA_AUTH.fetch(new Request(target,{
  method:request.method,headers:h,
  body:request.method!=='GET'?request.body:undefined,duplex:'half',redirect:'manual'
 }));
 const out=new Headers(headers('application/json; charset=utf-8'));
 for(const field of ['Content-Type','Set-Cookie','Cache-Control','Cross-Origin-Resource-Policy','Content-Disposition','Content-Length']){
   const value=upstream.headers.get(field);
   if(value)out.set(field,value);
 }
 return new Response(upstream.body,{status:upstream.status,headers:out});
}
async function authenticated(req,env){
 const r=await relay(req,env,'/api/qa/session');
 if(r.status===200)return true;
 if(r.status===401)return false;
 return null;
}
const app=WORKSPACE_HTML
 .replace('<title>Mihy Law AI Agent · Workspace Preview R0</title>','<title>Mihy Law AI Agent · Không gian làm việc</title>')
 .replace('<meta name="description" content="Mihy Law AI Agent — R0 mobile-first user interface preview, synthetic demonstration data only." />','<meta name="description" content="Không gian làm việc Mihy Law AI Agent dành cho tài khoản đã được xác thực." /><meta name="robots" content="noindex,nofollow" />')
 .replace('R0 Preview</span>','MIHY LAW AI AGENT · QA</span>')
 .replace('<div class="document-panel" hidden>',DRIVE_INLINE_HTML+'<div class="document-panel" hidden>')
 .replace('</head>','<script src="/drive-inline.js" defer></script></head>');
export async function handleSite(req,env){
 const url=new URL(req.url),path=url.pathname;
 const isDocumentApi=path==='/api/qa/documents'||
  ['/api/qa/documents/upload/start','/api/qa/documents/upload/finish'].includes(path)||
  /^\/api\/qa\/documents\/[0-9a-f-]{36}\/download$/.test(path);
 if(req.method!=='GET' && !API.has(path) && !isDocumentApi)return missing();
 // R90 isolated QA-only page. Cloudflare serves static bytes ONLY; the browser
 // obtains a short-lived Google token itself and POSTs a Blob directly to Google.
 // No QA_AUTH, /api/qa/drive, D1, session or Worker upload is involved.
 if(req.method==='GET'&&path==='/drive-blob')
  return new Response(DRIVE_BLOB_HTML,{status:200,headers:blobHeaders('text/html; charset=utf-8')});
 if(req.method==='GET'&&path==='/drive-blob.js')
  return new Response(DRIVE_BLOB_JS,{status:200,headers:blobHeaders('application/javascript; charset=utf-8')});
 const PUBLIC_PAGES=[['/gioi-thieu',LANDING_ABOUT_HTML],['/giai-phap',LANDING_SOLUTIONS_HTML],['/chuc-nang',LANDING_FEATURES_HTML],['/an-toan-du-lieu',LANDING_SECURITY_HTML],['/trien-khai-rieng',LANDING_PRIVATE_HTML],['/dich-vu-theo-goi',LANDING_SUBSCRIPTION_HTML]];
 const page=(path==='/'||path==='/index.html')?SITE_HTML:PUBLIC_PAGES.find(([route])=>route===path)?.[1];
 if(req.method==='GET' && page)return respond(page.replace('</footer>',FOOTER_CONTACT_HTML+'</footer>'),'text/html; charset=utf-8',200,{publicPage:true});
 // Public, first-party landing for cross-site Google OAuth redirects.
 // The site's Strict session cookie may be withheld during a redirect chain
 // from accounts.google.com, so DO NOT authenticate or 302 straight to /app.
 // The browser loads this harmless HTML first, then navigates same-origin.
 if(req.method==='GET'&&path==='/drive-return'){
  const result=url.searchParams.get('drive');
  if(!['connected','failed'].includes(result))return missing();
  const issue=url.searchParams.get('issue');
  const allowed=new Set(['consent','session','provider','drive','save']);
  const next='/app?drive='+result+
   (result==='failed'&&allowed.has(issue)?'&issue='+issue:'')+'#documents';
  const label=result==='connected'?'Đang trở lại AI Law sau khi cấp quyền Google…':
   'Đang trở lại AI Law để kiểm tra kết nối…';
  const html='<!doctype html><html lang="vi"><head><meta charset="utf-8">'+
   '<meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<meta name="robots" content="noindex,nofollow,noarchive">'+
   '<meta http-equiv="refresh" content="0;url='+next+'">'+
   '<title>Trở lại AI Law</title></head><body>'+
   '<main><p>'+label+'</p><p><a href="'+next+
   '">Tiếp tục đến tài liệu AI Law</a></p></main></body></html>';
  const h=headers('text/html; charset=utf-8');
  h['Referrer-Policy']='no-referrer';
  return new Response(html,{status:200,headers:h});
 }
 if(req.method==='GET'&&path==='/login')return respond(LOGIN_HTML);
 if(req.method==='GET'&&path==='/favicon.svg')return respond(svgIcon,'image/svg+xml; charset=utf-8',200,{publicPage:true});
 if(req.method==='GET'&&path==='/robots.txt')return respond('User-agent: *\nDisallow: /app\nDisallow: /account\nDisallow: /login\nDisallow: /drive-return\nDisallow: /drive-blob\nDisallow: /api/\n','text/plain; charset=utf-8',200,{publicPage:true});
 if(req.method==='GET'&&path==='/health')return respond(JSON.stringify({
  status:'online',environment:'qa_nonproduction',workspace_auth_binding:typeof env?.QA_AUTH?.fetch==='function'
 }), 'application/json; charset=utf-8',200,{publicPage:true});
 if(req.method==='GET'&&publicAssets.has(path)){
  const [body,type]=publicAssets.get(path);
  return respond(body,type,200,{publicPage:true});
 }
 const isMatterRename=/^\/api\/qa\/matters\/[0-9a-f-]{36}$/.test(path);
 if(API.has(path)||isDocumentApi||isMatterRename){
  if(isMatterRename&&req.method!=='PATCH')return missing();
  if(isDocumentApi&&(
      (path==='/api/qa/documents'&&!['GET','POST'].includes(req.method))||
      (path!=='/api/qa/documents'&&path.startsWith('/api/qa/documents/upload/')&&req.method!=='POST')||
      (path!== '/api/qa/documents'&&!path.startsWith('/api/qa/documents/upload/')&&req.method!=='GET')))
     return missing();
  if((['/api/qa/session','/api/qa/workspaces','/api/qa/drive/status'].includes(path)&&req.method!=='GET') ||
    (path==='/api/qa/profile'&&!['GET','POST'].includes(req.method)) ||
    (path==='/api/qa/matters'&&!['GET','POST'].includes(req.method)) ||
    (['/api/qa/legal/run','/api/qa/login','/api/qa/logout','/api/qa/switch-workspace','/api/qa/change-password','/api/qa/profile/avatar','/api/qa/drive/connect','/api/qa/drive/disconnect'].includes(path)&&req.method!=='POST'))return missing();
  try{return await relay(req,env,path+(isDocumentApi?url.search:''));}catch{return unavailable();}
 }
 if(req.method==='GET'&&path==='/app/')return redirect('/app'+url.search,308);
 if(req.method==='GET'&&path==='/account/')return redirect('/account',308);
 if(req.method!=='GET'||(path!=='/app'&&path!=='/account'&&!privateAssets.has(path)))return missing();
 let yes;try{yes=await authenticated(req,env);}catch{return unavailable();}
 if(yes===null)return unavailable();
 if(!yes){
  if(path==='/app'||path==='/account')return redirect('/login');
  return respond('Unauthorized','text/plain; charset=utf-8',401);
 }
 if(path==='/app')return new Response(app,{status:200,
  headers:directWorkspaceHeaders('text/html; charset=utf-8')});
 if(path==='/account')return respond(ACCOUNT_HTML);
 const [body,type]=privateAssets.get(path);
 return respond(body,type);
}
export default {fetch:handleSite};
