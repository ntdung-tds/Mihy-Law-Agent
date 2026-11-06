/* Local synthetic Chromium harness. DO NOT expose this QA test server publicly. */
import http from 'node:http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'ai-law-r77-'));
const build=spawnSync(process.execPath,[resolve('tools/build_cf_site.mjs'),dir],{encoding:'utf8'});
if(build.status!==0)throw Error('Site build failed: '+build.stderr);
const {handleSite}=await import(pathToFileURL(join(dir,'site_worker.mjs')).href);
const base='https://ai-law-web-qa.iaict-platform.workers.dev';
const env={QA_AUTH:{async fetch(request){
 if(new URL(request.url).pathname==='/api/qa/session'){
  const ok=(request.headers.get('Cookie')||'').includes('al_qa_session=r77-synthetic');
  return Response.json(ok?{email:'synthetic@qa.invalid',role:'lawyer'}:{error:'denied'},
   {status:ok?200:401});
 }
 return Response.json({error:'not_tested'},{status:404});
}}};
const site=http.createServer(async(req,res)=>{
 try{
  if(req.url==='/test-login'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
     'Set-Cookie':'al_qa_session=r77-synthetic; Path=/; HttpOnly; SameSite=Strict'});
   res.end('<!doctype html><html><body>Local synthetic session established.</body></html>');return;
  }
  const target=new Request(base+req.url,{method:'GET',
   headers:{Cookie:req.headers.cookie||''}});
  const response=await handleSite(target,env);
  res.writeHead(response.status,Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('synthetic server error');}
});
site.listen(0,'127.0.0.1',()=>{
 // localhost is intentionally a different cookie site than 127.0.0.1.
 const sitePort=site.address().port;
 const other=http.createServer((req,res)=>{
  if(req.url==='/'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   res.end('<!doctype html><html><body>'+
    '<a id="direct" href="/direct">Approve without bridge</a>'+
    '<a id="bridge" href="/bridge">Approve with bridge</a></body></html>');
   return;
  }
  const suffix=req.url==='/bridge'?'/drive-return?drive=connected':'/app?drive=connected#documents';
  res.writeHead(302,{Location:'http://localhost:'+sitePort+suffix,'Cache-Control':'no-store'});
  res.end();
 });
 other.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({
  site_port:sitePort,external_port:other.address().port
 })));
});
