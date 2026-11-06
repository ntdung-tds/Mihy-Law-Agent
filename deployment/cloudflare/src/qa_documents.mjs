/* R72 isolated QA document transport. NEVER declares PDF/DOCX parsing or UC03 ready.
   Storage needs a customer-authorized Google Drive grant; no customer records in tests. */
import {mobileSession} from './mobile_auth.mjs';
import {GoogleDriveAdapter} from './google_drive.mjs';
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const MAX_FILE=1500000,MAX_REQUEST=1800000;
const PDF='application/pdf',DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const result=(status,data)=>new Response(JSON.stringify(data),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'
}});
const forbidden=()=>result(404,{error:'Không tìm thấy hoặc không được phép truy cập.'});
const unavailable=()=>result(503,{error:'Lưu trữ QA chưa sẵn sàng.'});
const configured=env=>env?.AI_LAW_CF_MODE==='isolated-qa-only'&&env.DB&&UUID.test(env.INSTALLATION_ID||'');
const csrf=req=>{const u=new URL(req.url);return u.protocol==='https:'&&req.headers.get('Origin')===u.origin&&req.headers.get('Sec-Fetch-Site')!=='cross-site'};
const validName=name=>typeof name==='string'&&name.length>=5&&name.length<=120&&
 name===name.trim()&&name===name.normalize('NFC')&&!name.includes('..')&&!name.startsWith('.')&&/^[\p{L}\p{N}._ -]+$/u.test(name);
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const sha256=async bytes=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
function magic(bytes,extension){
 if(extension==='pdf')return new TextDecoder().decode(bytes.slice(0,5))==='%PDF-'&&
  new TextDecoder().decode(bytes.slice(-1024)).includes('%%EOF');
 if(extension==='docx'){
  if(bytes[0]!==80||bytes[1]!==75||bytes[2]!==3||bytes[3]!==4)return false;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)
   if(bytes[i]===80&&bytes[i+1]===75&&bytes[i+2]===5&&bytes[i+3]===6)return true;
 }
 return false;
}
export const DOCUMENT_ACL_SQL=[
 'SELECT 1 AS ok FROM qa_matters m JOIN qa_matter_catalog c',
 'ON c.installation_id=m.installation_id AND c.tenant_id=m.tenant_id AND c.matter_id=m.matter_id',
 'WHERE m.installation_id=? AND m.tenant_id=? AND m.matter_id=?',
 'AND EXISTS(SELECT 1 FROM qa_matter_acl a WHERE a.installation_id=m.installation_id',
 'AND a.tenant_id=m.tenant_id AND a.matter_id=m.matter_id AND a.user_id=?',
 "AND a.permission=? AND a.effect='allow' AND a.acl_version=m.acl_version",
 'AND a.valid_from<=? AND (a.valid_to IS NULL OR a.valid_to>?))',
 'AND NOT EXISTS(SELECT 1 FROM qa_matter_acl d WHERE d.installation_id=m.installation_id',
 'AND d.tenant_id=m.tenant_id AND d.matter_id=m.matter_id AND d.user_id=?',
 "AND d.permission=? AND d.effect='deny' AND d.acl_version=m.acl_version",
 'AND d.valid_from<=? AND (d.valid_to IS NULL OR d.valid_to>?)) LIMIT 1'
].join(' ');
export const LIST_SQL=[
 'SELECT r.file_id,r.file_name,r.mime_type,r.byte_length,r.sha256,r.created_at,r.verification_status',
 'FROM qa_document_receipts r JOIN qa_file_links f',
 'ON f.installation_id=r.installation_id AND f.tenant_id=r.tenant_id AND f.file_id=r.file_id',
 'WHERE r.installation_id=? AND r.tenant_id=? AND f.matter_id=?',
 'ORDER BY r.created_at DESC,r.file_id DESC LIMIT 50'
].join(' ');
export const READ_SQL=[
 'SELECT r.file_id,r.file_name,r.mime_type,r.byte_length,r.sha256,r.verification_status,',
 'f.matter_id,f.provider_object_id,f.provider FROM qa_document_receipts r JOIN qa_file_links f',
 'ON f.installation_id=r.installation_id AND f.tenant_id=r.tenant_id AND f.file_id=r.file_id',
 'WHERE r.installation_id=? AND r.tenant_id=? AND r.file_id=? LIMIT 1'
].join(' ');
async function permit(env,p,matter,permission,now){
 if(!UUID.test(matter||''))return false;
 const row=await env.DB.prepare(DOCUMENT_ACL_SQL).bind(
  env.INSTALLATION_ID,p.tenant_id,matter,p.user_id,permission,now,now,
  p.user_id,permission,now,now).first();
 return !!row;
}
function driveAdapter(env,opts){
 if(typeof env.GOOGLE_DRIVE_ACCESS_TOKEN!=='string'||!env.GOOGLE_DRIVE_ROOT_ID)throw Error('No OAuth grant');
 return new GoogleDriveAdapter({accessToken:env.GOOGLE_DRIVE_ACCESS_TOKEN,
  rootId:env.GOOGLE_DRIVE_ROOT_ID,fetcher:opts.driveFetch??fetch});
}
async function readForm(req){
 const type=req.headers.get('Content-Type')||'';
 if(!/^multipart\/form-data;\s*boundary=[A-Za-z0-9'()+_,./:=?-]{1,150}$/i.test(type))throw Error('bad_form');
 const reader=req.body?.getReader();if(!reader)throw Error('bad_form');
 const chunks=[];let count=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;
   count+=value.byteLength;if(count>MAX_REQUEST)throw Error('too_large');
   chunks.push(value);
  }
 }catch(e){await reader.cancel().catch(()=>{});throw e;}
 return new Response(new Blob(chunks),{headers:{'Content-Type':type}}).formData();
}
async function list(req,env,p,now){
 const matter=new URL(req.url).searchParams.get('matter_id');
 if(!await permit(env,p,matter,'read',now))return forbidden();
 const rows=await env.DB.prepare(LIST_SQL).bind(env.INSTALLATION_ID,p.tenant_id,matter).all();
 return result(200,{documents:(rows.results||[]).map(x=>({
  id:x.file_id,name:x.file_name,mime_type:x.mime_type,bytes:x.byte_length,
  sha256:x.sha256,status:x.verification_status,created_at:x.created_at
 }))});
}
async function upload(req,env,p,now,opts){
 if(!csrf(req))return result(403,{error:'CSRF_DENIED'});
 let drive;try{drive=driveAdapter(env,opts);}catch{return unavailable();}
 let file,matter,name,mime,bytes;
 try{
  if(Number(req.headers.get('Content-Length')||0)>MAX_REQUEST)throw Error('too_large');
  const form=await readForm(req);
  if([...form.keys()].sort().join(',')!=='file,matter_id')throw Error('bad_form');
  file=form.get('file');matter=form.get('matter_id');
  if(!(file instanceof File)||!UUID.test(matter||''))throw Error('bad_form');
  name=file.name;
  if(!validName(name)||file.size<22||file.size>MAX_FILE)throw Error('too_large');
  const ext=name.slice(name.lastIndexOf('.')+1).toLowerCase();
  mime=ext==='pdf'?PDF:ext==='docx'?DOCX:null;
  if(!mime||file.type!==mime)throw Error('unsupported');
  bytes=new Uint8Array(await file.arrayBuffer());
  if(!magic(bytes,ext))throw Error('unsupported');
 }catch(e){return result(e.message==='too_large'?413:e.message==='unsupported'?415:400,
   {error:'Tệp PDF/DOCX QA hoặc biểu mẫu không hợp lệ.'});}
 if(!await permit(env,p,matter,'write',now))return forbidden();
 const counts=await env.DB.prepare('SELECT COUNT(*) AS n FROM qa_file_links WHERE installation_id=? AND tenant_id=? AND matter_id=?')
   .bind(env.INSTALLATION_ID,p.tenant_id,matter).first();
 if(Number(counts?.n||0)>=20)return result(429,{error:'Hồ sơ QA đạt giới hạn tệp.'});
 const digest=await sha256(bytes);
 let remoteId=null;
 try{
  remoteId=await drive.upload({name,mimeType:mime,bytes});
  if(!await permit(env,p,matter,'write',now))throw Error('permission changed');
  const id=crypto.randomUUID();
  const actions=await env.DB.batch([
   env.DB.prepare('INSERT INTO qa_file_links(installation_id,tenant_id,file_id,matter_id,provider,provider_object_id,mime_type) VALUES(?,?,?,?,'+"'google_drive'"+',?,?)')
    .bind(env.INSTALLATION_ID,p.tenant_id,id,matter,remoteId,mime),
   env.DB.prepare('INSERT INTO qa_document_receipts(installation_id,tenant_id,file_id,file_name,mime_type,byte_length,sha256,verification_status,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,'+"'unverified'"+',?,?)')
    .bind(env.INSTALLATION_ID,p.tenant_id,id,name,mime,bytes.length,digest,p.user_id,now)
  ]);
  if(actions?.length!==2||actions.some(a=>a.success===false))throw Error('Commit failed');
  return result(201,{id,name,sha256:digest,status:'unverified',note:'Lưu trữ cách ly; chưa dùng cho AI.'});
 }catch{
  if(remoteId)try{await drive.remove(remoteId);}catch{/* operator must reconcile orphan */}
  return unavailable();
 }
}
async function download(env,p,id,now,opts){
 if(!UUID.test(id||''))return forbidden();
 const r=await env.DB.prepare(READ_SQL).bind(env.INSTALLATION_ID,p.tenant_id,id).first();
 if(!r||r.provider!=='google_drive'||!await permit(env,p,r.matter_id,'read',now))return forbidden();
 const drive=driveAdapter(env,opts),response=await drive.download(r.provider_object_id);
 if(Number(response.headers.get('Content-Length')||0)>MAX_FILE)throw Error('Too large');
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length!==Number(r.byte_length)||bytes.length>MAX_FILE||await sha256(bytes)!==r.sha256)
  throw Error('Integrity mismatch');
 if(!await permit(env,p,r.matter_id,'read',now))return forbidden();
 return new Response(bytes,{headers:{
  'Content-Type':r.mime_type,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(r.file_name),
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'
 }});
}
export async function documentsApi(req,env,opts={}){
 if(!configured(env))return unavailable();
 const url=new URL(req.url),match=/^\/api\/qa\/documents\/([0-9a-f-]{36})\/download$/.exec(url.pathname);
 if(url.pathname!=='/api/qa/documents'&&!match)return forbidden();
 if(match&&req.method!=='GET'||!match&&!['GET','POST'].includes(req.method))
  return result(405,{error:'Method not allowed'});
 const now=opts.now??Math.floor(Date.now()/1000);
 try{
  const p=await mobileSession(req,env,now);
  if(!p||!UUID.test(p.user_id)||!UUID.test(p.tenant_id))return result(401,{error:'Phiên không hợp lệ.'});
  if(!['lawyer','tenant_admin'].includes(p.role_key))return forbidden();
  if(match)return await download(env,p,match[1],now,opts);
  return req.method==='GET'?await list(req,env,p,now):await upload(req,env,p,now,opts);
 }catch{return unavailable();}
}
