/* R45 Cloudflare R0 preview QA login gateway; uses a private Worker Service Binding.
   No D1/secret in the preview; session verification happens in the R44 QA backend.
   Synthetic UI is unavailable to unauthenticated clients. NOT PRODUCTION. */
import { MOBILE_HTML, MOBILE_CSS } from './mobile_assets.mjs';
import { PREVIEW_HTML } from './preview_html.mjs';
import { PREVIEW_CSS } from './preview_css.mjs';
import { PREVIEW_JS } from './preview_app.mjs';
import { PREVIEW_SESSION_JS } from './preview_session.mjs';
import { PREVIEW_LOGIN_JS } from './preview_login.mjs';
import { PREVIEW_MATTERS_JS } from './preview_matters.mjs';
const AUTH='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const API=new Set(['/api/qa/session','/api/qa/login','/api/qa/logout','/api/qa/matters']);
const privatePaths=new Set(['/','/index.html','/styles.css','/app.js','/session.js','/matters.js']);
const headerMap=(type)=>({
 'Content-Type':type,'Cache-Control':'no-store','Vary':'Cookie',
 'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
 'Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
});
const respond=(text,type='text/html; charset=utf-8',status=200)=>new Response(text,{status,headers:headerMap(type)});
const unavailable=()=>respond('QA login backend unavailable','text/plain; charset=utf-8',503);
const missing=()=>respond('Not found','text/plain; charset=utf-8',404);
async function relay(req,env,path){
 if(!env || !env.QA_AUTH || typeof env.QA_AUTH.fetch!=='function') throw Error('Service binding missing');
 const method=req.method, from=new URL(req.url);
 if(method!=='GET' && method!=='POST')return respond('Method not allowed','text/plain; charset=utf-8',405);
 if(method==='POST' && (req.headers.get('Origin')!==from.origin || req.headers.get('Sec-Fetch-Site')==='cross-site'))
   return respond('Invalid origin','text/plain; charset=utf-8',403);
 const url=new URL(path,AUTH);
 const h=new Headers();
 const cookie=req.headers.get('Cookie');if(cookie)h.set('Cookie',cookie);
 const type=req.headers.get('Content-Type');if(type)h.set('Content-Type',type);
 if(method==='POST'){h.set('Origin',url.origin);h.set('Sec-Fetch-Site','same-origin');}
 const proxied=new Request(url.href,{method,headers:h,body:method==='POST'?req.body:undefined,duplex:'half',redirect:'manual'});
 const result=await env.QA_AUTH.fetch(proxied);
 const outgoing=new Headers(headerMap('application/json; charset=utf-8'));
 for(const name of ['Content-Type','Set-Cookie','Cache-Control','Cross-Origin-Resource-Policy']){
   const value=result.headers.get(name);if(value)outgoing.set(name,value);
 }
 return new Response(result.body,{status:result.status,headers:outgoing});
}
async function authorized(req,env){
 const r=await relay(req,env,'/api/qa/session');
 if(r.status===200)return true;
 if(r.status===401)return false;
 return null;
}
const login=MOBILE_HTML.replace('/mobile.js','/preview-login.js');
export async function handlePreview(req,env){
 const path=new URL(req.url).pathname;
 if(req.method==='GET' && path==='/mobile.css')return respond(MOBILE_CSS,'text/css; charset=utf-8');
 if(req.method==='GET' && path==='/preview-login.js')return respond(PREVIEW_LOGIN_JS,'application/javascript; charset=utf-8');
 if(req.method==='GET' && path==='/health')return respond(JSON.stringify({status:'qa_only',site:'r0_preview'}),'application/json; charset=utf-8');
 if(API.has(path)){
   if((path==='/api/qa/session' && req.method!=='GET') ||
       (path==='/api/qa/matters' && !['GET','POST'].includes(req.method)) ||
       (path!=='/api/qa/session' && path!=='/api/qa/matters' && req.method!=='POST'))return missing();
   try{return await relay(req,env,path)}catch{return unavailable()}
 }
 if(req.method!=='GET'||!privatePaths.has(path))return missing();
 let ok;try{ok=await authorized(req,env)}catch{return unavailable()}
 if(ok===null)return unavailable();
 if(!ok){
   if(path==='/'||path==='/index.html')return respond(login);
   return respond('Unauthorized','text/plain; charset=utf-8',401);
 }
 if(path==='/'||path==='/index.html')return respond(PREVIEW_HTML);
 if(path==='/styles.css')return respond(PREVIEW_CSS,'text/css; charset=utf-8');
 if(path==='/app.js')return respond(PREVIEW_JS,'application/javascript; charset=utf-8');
 if(path==='/matters.js')return respond(PREVIEW_MATTERS_JS,'application/javascript; charset=utf-8');
 return respond(PREVIEW_SESSION_JS,'application/javascript; charset=utf-8');
}
export default {fetch:handlePreview};
