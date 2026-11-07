/* R72 isolated QA document transport. NEVER declares PDF/DOCX parsing or UC03 ready.
   Storage needs a customer-authorized Google Drive grant; no customer records in tests. */
import {mobileSession} from './mobile_auth.mjs';
import {GoogleDriveAdapter,DriveUploadFailure} from './google_drive.mjs';
import {tenantDriveAdapter} from './oauth_drive.mjs';
import {assignedDestination} from './qa_storage_destinations.mjs';
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const MAX_FILE=1500000,MAX_REQUEST=1800000;
const PDF='application/pdf',DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const result=(status,data)=>new Response(JSON.stringify(data),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'
}});
const forbidden=()=>result(404,{error:'Không tìm thấy hoặc không được phép truy cập.'});
const unavailable=()=>result(503,{code:'QA_STORAGE_UNAVAILABLE',error:'Lưu trữ QA đang gián đoạn. Vui lòng thử lại.'});
// R79: stable public failure codes, never provider token/response text or secrets.
const storageIssue=(code,detail)=>result(503,{
 code,error:{
  DRIVE_GRANT_UNAVAILABLE:'Không thể sử dụng quyền Google Drive hiện tại. Hãy kết nối lại Drive rồi thử lại.',
  DRIVE_UPLOAD_UNAVAILABLE:'Google Drive chưa hoàn tất tải tệp. Vui lòng kiểm tra mã lỗi bên dưới.',
  QA_RECEIPT_UNAVAILABLE:'Tệp chưa được ghi nhận trong AI Law QA. Vui lòng thử lại.'
 }[code]||'Lưu trữ QA đang gián đoạn.',
 ...(code==='DRIVE_UPLOAD_UNAVAILABLE'&&detail instanceof DriveUploadFailure?{
  stage:detail.stage,
  ...(detail.httpStatus?{provider_status:detail.httpStatus}:{}),
  ...(detail.reason?{provider_reason:detail.reason}:{})
 }:{})
});
const configured=env=>env?.AI_LAW_CF_MODE==='isolated-qa-only'&&env.DB&&UUID.test(env.INSTALLATION_ID||'');
const csrf=req=>{const u=new URL(req.url);return u.protocol==='https:'&&req.headers.get('Origin')===u.origin&&req.headers.get('Sec-Fetch-Site')!=='cross-site'};
const validName=name=>typeof name==='string'&&name.length>=5&&name.length<=120&&
 name===name.trim()&&name===name.normalize('NFC')&&!name.includes('..')&&!name.startsWith('.')&&/^[\p{L}\p{N}._ ()-]+$/u.test(name);
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
 "AND (f.storage_destination_id IS NULL OR f.storage_destination_id='root' OR EXISTS (SELECT 1 FROM qa_storage_assignments g",
 'JOIN qa_storage_destinations d ON d.installation_id=g.installation_id AND d.tenant_id=g.tenant_id',
 "AND d.destination_id=g.destination_id AND d.status='active'",
 'WHERE g.installation_id=f.installation_id AND g.tenant_id=f.tenant_id',
 'AND g.destination_id=f.storage_destination_id AND g.user_id=?))',
 'ORDER BY r.created_at DESC,r.file_id DESC LIMIT 50'
].join(' ');
export const READ_SQL=[
 'SELECT r.file_id,r.file_name,r.mime_type,r.byte_length,r.sha256,r.verification_status,',
 'f.matter_id,f.provider_object_id,f.provider,f.storage_destination_id FROM qa_document_receipts r JOIN qa_file_links f',
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
async function driveAdapter(env,p,opts){
 // Fixture injection is exclusively an internal server-side test option, never HTTP input.
 if(opts.driveFetch&&typeof env.GOOGLE_DRIVE_ACCESS_TOKEN==='string'&&env.GOOGLE_DRIVE_ROOT_ID)
  return new GoogleDriveAdapter({accessToken:env.GOOGLE_DRIVE_ACCESS_TOKEN,
   rootId:env.GOOGLE_DRIVE_ROOT_ID,fetcher:opts.driveFetch});
 return tenantDriveAdapter(env,p,opts);
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
 const rows=await env.DB.prepare(LIST_SQL).bind(env.INSTALLATION_ID,p.tenant_id,matter,p.user_id).all();
 return result(200,{documents:(rows.results||[]).map(x=>({
  id:x.file_id,name:x.file_name,mime_type:x.mime_type,bytes:x.byte_length,
  sha256:x.sha256,status:x.verification_status,created_at:x.created_at
 }))});
}
// R86 direct upload control plane: requests contain only a bounded JSON
// manifest. Google Drive, not this Worker, receives the PDF/DOCX bytes.
async function readManifest(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers.get('Content-Type')||''))throw Error('BAD_JSON');
 const reader=req.body?.getReader();if(!reader)throw Error('BAD_JSON');
 const chunks=[];let n=0;
 while(true){
  const {done,value}=await reader.read();if(done)break;
  n+=value.byteLength;if(n>4096){await reader.cancel().catch(()=>{});throw Error('TOO_LARGE');}
  chunks.push(value);
 }
 return JSON.parse(new TextDecoder().decode(await new Blob(chunks).arrayBuffer()));
}
async function startDirect(req,env,p,now,opts){
 if(!csrf(req))return result(403,{error:'CSRF_DENIED'});
 let v;
 try{v=await readManifest(req);}catch{return result(400,{error:'Yêu cầu khởi tạo tệp chưa hợp lệ.'});}
 if(!v||!['byte_length,file_name,matter_id,mime_type,sha256',
  'byte_length,destination_id,file_name,matter_id,mime_type,sha256'].includes(Object.keys(v).sort().join(',')))
  return result(400,{error:'Yêu cầu tệp không hợp lệ.'});
 const matter=v.matter_id,name=v.file_name,mime=v.mime_type,size=v.byte_length,sha=v.sha256;
 const destinationId=v.destination_id||null;
 // The Owner may explicitly choose My Drive root in the Save chooser. Never
 // interpret an omitted destination as root (fail closed on cancellation).
 const explicitRoot=destinationId==='root';
 // The old OAuth connection is tenant-owned. Do not present the administrator's
 // My Drive as an ordinary employee's personal My Drive.
 if(explicitRoot&&p.role_key!=='tenant_admin'&&p.kind!=='personal')
  return forbidden();
 // No implicit root destination in live QA: clients must choose a location.
 // Prior R72 synthetic fixtures inject fake Google credentials and an internal
 // fetcher; preserve their historical root-only contract without enabling it
 // for real HTTP callers (the public handle never passes driveFetch).
 const historicalSynthetic=typeof opts.driveFetch==='function'&&
  typeof env.GOOGLE_DRIVE_ACCESS_TOKEN==='string'&&!!env.GOOGLE_DRIVE_ROOT_ID;
 if((!destinationId&&!historicalSynthetic)||(destinationId&&!UUID.test(destinationId)&&!explicitRoot))
  return result(400,{error:'Hãy chọn thư mục lưu trữ được cấp quyền trước khi lưu tệp.'});
 if(!UUID.test(matter||''))return result(400,{error:'Hồ sơ QA không hợp lệ.'});
 // A mobile/browser download may append (1) or (2). These are safe filename
 // characters, unlike path separators and control characters.
 if(!validName(name))return result(400,{error:'Tên tệp không hợp lệ. Cho phép chữ, số, khoảng trắng, dấu chấm, gạch nối, gạch dưới và ngoặc đơn.'});
 if(!Number.isInteger(size)||size<22)
  return result(400,{error:'Kích thước tệp chưa hợp lệ.'});
 if(size>MAX_FILE)
  return result(413,{error:'Tệp vượt giới hạn 1,5 MB của QA.'});
 if(!((name.toLowerCase().endsWith('.pdf')&&mime===PDF)||
      (name.toLowerCase().endsWith('.docx')&&mime===DOCX)))
  return result(400,{error:'Chỉ chấp nhận PDF hoặc DOCX đúng loại tệp.'});
 if(!/^[a-f0-9]{64}$/.test(sha||''))
  return result(400,{error:'Mã kiểm tra SHA-256 không hợp lệ.'});
 if(!await permit(env,p,matter,'write',now))return forbidden();
 const pending=await env.DB.prepare('SELECT COUNT(*) AS n FROM qa_document_upload_tickets WHERE installation_id=? AND tenant_id=? AND user_id=? AND consumed_at IS NULL AND expires_at>?')
  .bind(env.INSTALLATION_ID,p.tenant_id,p.user_id,now).first();
 if(Number(pending?.n||0)>=3)return result(429,{error:'Đã có 3 lượt tải lên đang chờ. Vui lòng hoàn tất hoặc thử lại sau.'});
 const counts=await env.DB.prepare('SELECT COUNT(*) AS n FROM qa_file_links WHERE installation_id=? AND tenant_id=? AND matter_id=?')
  .bind(env.INSTALLATION_ID,p.tenant_id,matter).first();
 if(Number(counts?.n||0)>=20)return result(429,{error:'Hồ sơ QA đạt giới hạn tệp.'});
 let drive;try{drive=await driveAdapter(env,p,opts);}
 catch{return storageIssue('DRIVE_GRANT_UNAVAILABLE');}
 let selected=null;
 if(destinationId&&!explicitRoot){
  try{selected=await assignedDestination(env,p,destinationId);}
  catch{return storageIssue('QA_RECEIPT_UNAVAILABLE');}
  if(!selected)return forbidden();
  try{await drive.writableFolder(selected.folder_id);}
  catch{return result(409,{error:'Thư mục không còn thuộc kho lưu trữ đã cấp quyền.'});}
 }
 // R99: direct browser multipart upload. Google resumable-session PUT from
 // mobile browsers failed CORS; do not create a browser-inaccessible session.
 // The existing OAuth-backed tenant adapter proves the approved Drive root;
 // the browser receives only its folder ID and a short-lived ACL-bound ticket.
 let rootId=selected?.folder_id||drive.rootId;
 if(explicitRoot){
  try{rootId=await drive.accountRoot();}
  catch{return result(409,{error:'Tài khoản Google hiện tại không cho phép lưu tại My Drive.'});}
 }
 if(typeof rootId!=='string'||!/^[A-Za-z0-9_-]{10,200}$/.test(rootId))
  return storageIssue('DRIVE_GRANT_UNAVAILABLE');
 const ticket=crypto.randomUUID();
 try{
  if(destinationId){
   await env.DB.prepare('INSERT INTO qa_document_upload_tickets (installation_id,tenant_id,ticket_id,user_id,matter_id,file_name,mime_type,byte_length,sha256,created_at,expires_at,destination_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(env.INSTALLATION_ID,p.tenant_id,ticket,p.user_id,matter,name,mime,size,sha,now,now+600,destinationId).run();
  }else{
   await env.DB.prepare('INSERT INTO qa_document_upload_tickets (installation_id,tenant_id,ticket_id,user_id,matter_id,file_name,mime_type,byte_length,sha256,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(env.INSTALLATION_ID,p.tenant_id,ticket,p.user_id,matter,name,mime,size,sha,now,now+600).run();
  }
 }catch{return storageIssue('QA_RECEIPT_UNAVAILABLE');}
 // No resumable upload capability is created or returned in R99.
 // The short-lived ticket is written to D1 only after permission checks.
 // Sensitive capability for one Google-created file. Never log or persist the
 // Folder ID is bound to the server-verified tenant grant, while the
 // file bytes and browser-scoped Google access token never enter this Worker.
 return result(200,{ticket,drive_folder_id:rootId,expires_in:600});
}
async function finishDirect(req,env,p,now,opts){
 if(!csrf(req))return result(403,{error:'CSRF_DENIED'});
 let v;try{v=await readManifest(req);}catch{return result(400,{error:'Yêu cầu xác nhận chưa hợp lệ.'});}
 if(!v||Object.keys(v).sort().join(',')!=='file_id,ticket'||
    !UUID.test(v.ticket||'')||
    !/^[A-Za-z0-9_-]{10,200}$/.test(v.file_id||''))
  return forbidden();
 const row=await env.DB.prepare('SELECT ticket_id,user_id,matter_id,file_name,mime_type,byte_length,sha256,destination_id FROM qa_document_upload_tickets WHERE installation_id=? AND tenant_id=? AND ticket_id=? AND user_id=? AND expires_at>? AND consumed_at IS NULL LIMIT 1')
  .bind(env.INSTALLATION_ID,p.tenant_id,v.ticket,p.user_id,now).first();
 if(!row||!await permit(env,p,row.matter_id,'write',now))return forbidden();
 let drive;try{drive=await driveAdapter(env,p,opts);}
 catch{return storageIssue('DRIVE_GRANT_UNAVAILABLE');}
 let approvedParent=drive.rootId;
 if(row.destination_id==='root'){
  try{approvedParent=await drive.accountRoot();}catch{return forbidden();}
 }else if(row.destination_id){
  const selected=await assignedDestination(env,p,row.destination_id);
  if(!selected)return forbidden(); // assignment revoked since start
  try{await drive.writableFolder(selected.folder_id);}catch{return forbidden();}
  approvedParent=selected.folder_id;
 }
 try{await drive.verifyDirectUpload(v.file_id,{
  ticketId:v.ticket,name:row.file_name,mimeType:row.mime_type,size:row.byte_length,approvedParent
 });}catch{return result(409,{code:'DRIVE_VERIFY_DENIED',
  error:'Google Drive chưa xác minh được tệp đúng thư mục và phiên tải lên.'});}
 if(!await permit(env,p,row.matter_id,'write',now))return forbidden();
 try{
  const op=await env.DB.batch([
   env.DB.prepare('UPDATE qa_document_upload_tickets SET consumed_at=?,provider_object_id=? WHERE installation_id=? AND tenant_id=? AND ticket_id=? AND user_id=? AND consumed_at IS NULL AND expires_at>?')
    .bind(now,v.file_id,env.INSTALLATION_ID,p.tenant_id,v.ticket,p.user_id,now),
   env.DB.prepare("INSERT INTO qa_file_links(installation_id,tenant_id,file_id,matter_id,provider,provider_object_id,mime_type,storage_destination_id) SELECT installation_id,tenant_id,ticket_id,matter_id,'google_drive',provider_object_id,mime_type,destination_id FROM qa_document_upload_tickets WHERE installation_id=? AND tenant_id=? AND ticket_id=? AND user_id=? AND consumed_at=? AND provider_object_id=?")
    .bind(env.INSTALLATION_ID,p.tenant_id,v.ticket,p.user_id,now,v.file_id),
   env.DB.prepare("INSERT INTO qa_document_receipts(installation_id,tenant_id,file_id,file_name,mime_type,byte_length,sha256,verification_status,uploaded_by,created_at) SELECT installation_id,tenant_id,ticket_id,file_name,mime_type,byte_length,sha256,'unverified',user_id,? FROM qa_document_upload_tickets WHERE installation_id=? AND tenant_id=? AND ticket_id=? AND user_id=? AND consumed_at=? AND provider_object_id=?")
    .bind(now,env.INSTALLATION_ID,p.tenant_id,v.ticket,p.user_id,now,v.file_id)
  ]);
  if(op?.length!==3||op.some(x=>x.success===false)||
     op.some(x=>x.meta?.changes!==1))throw Error('Commit rejected');
  return result(201,{id:v.ticket,name:row.file_name,status:'unverified',
   note:'Tệp đã được Google Drive xác nhận; nội dung chưa dùng cho AI.'});
 }catch{return storageIssue('QA_RECEIPT_UNAVAILABLE');}
}
async function upload(req,env,p,now,opts){
 if(!csrf(req))return result(403,{error:'CSRF_DENIED'});
 // Do not call Google or refresh OAuth for an invalid local input.
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
  // Mobile browsers may omit File.type; signed bytes and extension are still
  // validated. An explicit contradictory MIME remains forbidden.
  if(!mime||(file.type&&file.type!=='application/octet-stream'&&file.type!==mime))
   throw Error('unsupported');
  bytes=new Uint8Array(await file.arrayBuffer());
  if(!magic(bytes,ext))throw Error('unsupported');
 }catch(e){return result(e.message==='too_large'?413:e.message==='unsupported'?415:400,
   {error:'Tệp PDF/DOCX QA hoặc biểu mẫu không hợp lệ.'});}
 if(!await permit(env,p,matter,'write',now))return forbidden();
 let counts;
 try{
  counts=await env.DB.prepare('SELECT COUNT(*) AS n FROM qa_file_links WHERE installation_id=? AND tenant_id=? AND matter_id=?')
   .bind(env.INSTALLATION_ID,p.tenant_id,matter).first();
 }catch{return storageIssue('QA_RECEIPT_UNAVAILABLE');}
 if(Number(counts?.n||0)>=20)return result(429,{error:'Hồ sơ QA đạt giới hạn tệp.'});
 let drive;
 try{drive=await driveAdapter(env,p,opts);}
 catch{return storageIssue('DRIVE_GRANT_UNAVAILABLE');}
 const digest=await sha256(bytes);
 let remoteId=null;
 try{
  remoteId=await drive.upload({name,mimeType:mime,bytes});
 }catch(e){return storageIssue('DRIVE_UPLOAD_UNAVAILABLE',e);}
 try{
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
 }catch(e){
  if(remoteId)try{await drive.remove(remoteId);}catch{/* operator must reconcile orphan */}
  if(e?.message==='permission changed')return forbidden();
  return storageIssue('QA_RECEIPT_UNAVAILABLE');
 }
}
async function download(env,p,id,now,opts){
 if(!UUID.test(id||''))return forbidden();
 const r=await env.DB.prepare(READ_SQL).bind(env.INSTALLATION_ID,p.tenant_id,id).first();
 if(!r||r.provider!=='google_drive'||!await permit(env,p,r.matter_id,'read',now))return forbidden();
 const drive=await driveAdapter(env,p,opts);
 let approvedParent=drive.rootId;
 if(r.storage_destination_id==='root'){
  try{approvedParent=await drive.accountRoot();}catch{return forbidden();}
 }else if(r.storage_destination_id){
  const selected=await assignedDestination(env,p,r.storage_destination_id);
  if(!selected)return forbidden();
  try{await drive.writableFolder(selected.folder_id);}catch{return forbidden();}
  approvedParent=selected.folder_id;
 }
 const response=await drive.download(r.provider_object_id,approvedParent);
 if(Number(response.headers.get('Content-Length')||0)>MAX_FILE)throw Error('Too large');
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length!==Number(r.byte_length)||bytes.length>MAX_FILE||await sha256(bytes)!==r.sha256)
  throw Error('Integrity mismatch');
 if(!await permit(env,p,r.matter_id,'read',now))return forbidden();
 return new Response(bytes,{headers:{
  'Content-Type':r.mime_type,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(r.file_name),
  'Content-Length':String(bytes.length),
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'
 }});
}
export async function documentsApi(req,env,opts={}){
 if(!configured(env))return unavailable();
 const url=new URL(req.url),match=/^\/api\/qa\/documents\/([0-9a-f-]{36})\/download$/.exec(url.pathname);
 const directStart=url.pathname==='/api/qa/documents/upload/start';
 const directFinish=url.pathname==='/api/qa/documents/upload/finish';
 if(url.pathname!=='/api/qa/documents'&&!match&&!directStart&&!directFinish)return forbidden();
 if((directStart||directFinish)&&req.method!=='POST')return result(405,{error:'Method not allowed'});
 if(match&&req.method!=='GET'||!match&&!directStart&&!directFinish&&!['GET','POST'].includes(req.method))
  return result(405,{error:'Method not allowed'});
 const now=opts.now??Math.floor(Date.now()/1000);
 try{
  const p=await mobileSession(req,env,now);
  if(!p||!UUID.test(p.user_id)||!UUID.test(p.tenant_id))return result(401,{error:'Phiên không hợp lệ.'});
  if(!['lawyer','tenant_admin'].includes(p.role_key))return forbidden();
  if(match)return await download(env,p,match[1],now,opts);
  if(directStart)return await startDirect(req,env,p,now,opts);
  if(directFinish)return await finishDirect(req,env,p,now,opts);
  if(req.method==='GET')return await list(req,env,p,now);
  // Retire the original body-proxy in live QA. Only pre-existing isolated
  // synthetic contract tests can explicitly opt in; never let normal clients
  // bypass the browser→Google direct file plane.
  if(env.ALLOW_LEGACY_DOCUMENT_PROXY!=='synthetic-tests-only')
   return result(410,{code:'DIRECT_GOOGLE_UPLOAD_REQUIRED',
    error:'Luồng tải qua máy chủ đã đóng. Vui lòng tải trực tiếp lên Google Drive từ giao diện mới.'});
  return await upload(req,env,p,now,opts);
 }catch{return unavailable();}
}
