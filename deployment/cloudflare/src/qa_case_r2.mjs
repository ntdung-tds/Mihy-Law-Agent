/**
 * R116: isolated standalone QA case details + temporary PRIVATE R2 case files.
 * No real client data permitted in QA; no public R2 URL, OAuth, or provider upload.
 * All actions require a current session and active deny-overrides MatterACL.
 */
import {mobileSession} from './mobile_auth.mjs';

const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const MIMES=Object.freeze({pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
const MAX_FILE=10*1024*1024,MAX_DETAILS=5500;
const json=(status,value)=>new Response(JSON.stringify(value),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'
}});
const error=(status,message)=>json(status,{error:message});
const unavailable=()=>error(503,'Lưu hồ sơ hoặc R2 QA chưa sẵn sàng.');
const forbidden=()=>error(404,'Không tìm thấy hồ sơ hoặc không có quyền truy cập.');
const configured=e=>e?.AI_LAW_CF_MODE==='isolated-qa-only'&&e.DB&&e.CASE_FILES_R2&&UUID.test(e.INSTALLATION_ID||'');
const origin=req=>{const u=new URL(req.url);return u.protocol==='https:'&&req.headers.get('Origin')===u.origin&&req.headers.get('Sec-Fetch-Site')!=='cross-site';};
const goodText=(s,max)=>typeof s==='string'&&s.length<=max&&!/[\u0000-\u001f\u007f<>]/u.test(s)&&s===s.normalize('NFC');
const safeName=s=>goodText(s,120)&&s.length>=5&&s===s.trim()&&!s.includes('..')&&!s.startsWith('.')&&/^[\p{L}\p{N}._ ()-]+$/u.test(s);
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const digest=async b=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',b)));

export const CASE_ACL_SQL=[
 'SELECT 1 AS allowed FROM qa_matters m JOIN qa_matter_catalog c',
 'ON c.installation_id=m.installation_id AND c.tenant_id=m.tenant_id AND c.matter_id=m.matter_id',
 'WHERE m.installation_id=? AND m.tenant_id=? AND m.matter_id=?',
 'AND EXISTS(SELECT 1 FROM qa_matter_acl a WHERE a.installation_id=m.installation_id AND a.tenant_id=m.tenant_id',
 "AND a.matter_id=m.matter_id AND a.user_id=? AND a.permission=? AND a.effect='allow'",
 'AND a.acl_version=m.acl_version AND a.valid_from<=? AND (a.valid_to IS NULL OR a.valid_to>?))',
 'AND NOT EXISTS(SELECT 1 FROM qa_matter_acl d WHERE d.installation_id=m.installation_id AND d.tenant_id=m.tenant_id',
 "AND d.matter_id=m.matter_id AND d.user_id=? AND d.permission=? AND d.effect='deny'",
 'AND d.acl_version=m.acl_version AND d.valid_from<=? AND (d.valid_to IS NULL OR d.valid_to>?)) LIMIT 1'
].join(' ');
export async function permitted(env,principal,matter,permission,now){
 const found=await env.DB.prepare(CASE_ACL_SQL).bind(
  env.INSTALLATION_ID,principal.tenant_id,matter,principal.user_id,permission,now,now,
  principal.user_id,permission,now,now).first();
 return !!found;
}
const ACL_FRAGMENT=[
 'EXISTS(SELECT 1 FROM qa_matter_acl a WHERE a.installation_id=m.installation_id',
 'AND a.tenant_id=m.tenant_id AND a.matter_id=m.matter_id AND a.user_id=?',
 "AND a.permission='write' AND a.effect='allow' AND a.acl_version=m.acl_version",
 'AND a.valid_from<=? AND (a.valid_to IS NULL OR a.valid_to>?))',
 'AND NOT EXISTS(SELECT 1 FROM qa_matter_acl d WHERE d.installation_id=m.installation_id',
 'AND d.tenant_id=m.tenant_id AND d.matter_id=m.matter_id AND d.user_id=?',
 "AND d.permission='write' AND d.effect='deny' AND d.acl_version=m.acl_version",
 'AND d.valid_from<=? AND (d.valid_to IS NULL OR d.valid_to>?))'
].join(' ');
const aclParams=(p,now)=>[p.user_id,now,now,p.user_id,now,now];
const fields=['reference','category','status','priority','assignee_user_id','client_label','counterparty_label','summary','deadline'];
const statuses=new Set(['open','in_progress','on_hold','closed']);
const priorities=new Set(['low','normal','high']);
const EMPTY=Object.freeze({reference:'',category:'',status:'open',priority:'normal',
 client_label:'',counterparty_label:'',summary:'',deadline:'',version:0});
const allowedBody=(v)=>{
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 if(Object.keys(v).sort().join(',')!==[...fields,'expected_version'].sort().join(','))return false;
 if(!Number.isInteger(v.expected_version)||v.expected_version<0||v.expected_version>100000)return false;
 if(!goodText(v.reference,60)||!goodText(v.category,80)||!goodText(v.client_label,160)||
    !goodText(v.counterparty_label,160)||!goodText(v.summary,1600))return false;
 if(!statuses.has(v.status)||!priorities.has(v.priority)||!UUID.test(v.assignee_user_id||''))return false;
 if(typeof v.deadline!=='string'||(v.deadline&&
   (!/^\d{4}-\d{2}-\d{2}$/.test(v.deadline)||Number.isNaN(Date.parse(v.deadline+'T00:00:00Z'))||
    new Date(v.deadline+'T00:00:00Z').toISOString().slice(0,10)!==v.deadline)))return false;
 return true;
};
const DETAILS_SQL=[
 'SELECT c.title,c.created_at,c.version AS title_version,',
 'd.reference,d.category,d.status,d.priority,d.assignee_user_id,',
 'd.client_label,d.counterparty_label,d.summary,d.deadline,d.version,d.updated_at',
 'FROM qa_matter_catalog c LEFT JOIN qa_case_details d',
 'ON d.installation_id=c.installation_id AND d.tenant_id=c.tenant_id AND d.matter_id=c.matter_id',
 'WHERE c.installation_id=? AND c.tenant_id=? AND c.matter_id=? LIMIT 1'
].join(' ');
const MEMBER_SQL=[
 'SELECT m.user_id,COALESCE(NULLIF(p.display_name, \'\'),substr(m.user_id,1,8)) AS label',
 'FROM qa_memberships m LEFT JOIN qa_account_profiles p',
 'ON p.installation_id=m.installation_id AND p.user_id=m.user_id',
 "WHERE m.installation_id=? AND m.tenant_id=? AND m.status='active'",
 'ORDER BY label LIMIT 50'
].join(' ');
const INSERT_SQL=[
 'INSERT INTO qa_case_details(installation_id,tenant_id,matter_id,reference,category,status,priority,',
 'assignee_user_id,client_label,counterparty_label,summary,deadline,version,updated_by,updated_at)',
 'SELECT ?,?,?,?,?,?,?,?,?,?,?,?,1,?,? FROM qa_matters m',
 'WHERE m.installation_id=? AND m.tenant_id=? AND m.matter_id=?',
 'AND NOT EXISTS(SELECT 1 FROM qa_case_details d WHERE d.installation_id=m.installation_id',
 'AND d.tenant_id=m.tenant_id AND d.matter_id=m.matter_id)',
 'AND',ACL_FRAGMENT
].join(' ');
const UPDATE_SQL=[
 'UPDATE qa_case_details SET reference=?,category=?,status=?,priority=?,assignee_user_id=?,',
 'client_label=?,counterparty_label=?,summary=?,deadline=?,version=version+1,updated_by=?,updated_at=?',
 'WHERE installation_id=? AND tenant_id=? AND matter_id=? AND version=?',
 'AND EXISTS(SELECT 1 FROM qa_matters m WHERE m.installation_id=qa_case_details.installation_id',
 'AND m.tenant_id=qa_case_details.tenant_id AND m.matter_id=qa_case_details.matter_id',
 'AND',ACL_FRAGMENT,')'
].join(' ');
async function details(req,env,p,matter,now){
 if(!await permitted(env,p,matter,req.method==='PATCH'?'write':'read',now))return forbidden();
 if(req.method==='GET'){
  const row=await env.DB.prepare(DETAILS_SQL).bind(env.INSTALLATION_ID,p.tenant_id,matter).first();
  if(!row)return forbidden();
  const members=await env.DB.prepare(MEMBER_SQL).bind(env.INSTALLATION_ID,p.tenant_id).all();
  const list=(members.results||[]).filter(x=>UUID.test(x.user_id)).map(x=>({id:x.user_id,label:x.label}));
  return json(200,{case:{...EMPTY,...row,version:Number(row.version||0),
    assignee_user_id:row.assignee_user_id||p.user_id},
   members:list,can_write:await permitted(env,p,matter,'write',now)});
 }
 if(!origin(req)||!req.headers.get('Content-Type')?.startsWith('application/json'))return error(403,'Yêu cầu không hợp lệ.');
 if(Number(req.headers.get('Content-Length')||0)>MAX_DETAILS)return error(413,'Thông tin hồ sơ quá dài.');
 let v;try{const raw=await req.text();if(raw.length>MAX_DETAILS)return error(413,'Thông tin hồ sơ quá dài.');v=JSON.parse(raw);}catch{return error(400,'Dữ liệu hồ sơ không hợp lệ.');}
 if(!allowedBody(v))return error(400,'Thông tin hồ sơ không hợp lệ.');
 const member=await env.DB.prepare(
  "SELECT 1 AS ok FROM qa_memberships WHERE installation_id=? AND tenant_id=? AND user_id=? AND status='active' LIMIT 1"
 ).bind(env.INSTALLATION_ID,p.tenant_id,v.assignee_user_id).first();
 if(!member)return error(400,'Người phụ trách không thuộc không gian làm việc.');
 const existing=await env.DB.prepare(
  'SELECT version FROM qa_case_details WHERE installation_id=? AND tenant_id=? AND matter_id=?'
 ).bind(env.INSTALLATION_ID,p.tenant_id,matter).first();
 const version=Number(existing?.version||0);
 if(version!==v.expected_version)return error(409,'Thông tin đã thay đổi. Hãy tải lại hồ sơ.');
 const inputs=fields.map(k=>v[k]);
 let command;
 if(version===0)command=env.DB.prepare(INSERT_SQL).bind(
  env.INSTALLATION_ID,p.tenant_id,matter,...inputs,p.user_id,now,
  env.INSTALLATION_ID,p.tenant_id,matter,...aclParams(p,now)
 );
 else command=env.DB.prepare(UPDATE_SQL).bind(
  ...inputs,p.user_id,now,env.INSTALLATION_ID,p.tenant_id,matter,version,...aclParams(p,now)
 );
 const result=await command.run();
 if(result.meta?.changes!==1)return error(409,'Quyền hoặc phiên bản hồ sơ đã thay đổi.');
 return json(200,{id:matter,version:version+1,saved:true});
}
const FILE_LIST_SQL=[
 'SELECT file_id,file_name,mime_type,byte_length,sha256,uploaded_at',
 'FROM qa_case_files_r2 WHERE installation_id=? AND tenant_id=? AND matter_id=?',
 'ORDER BY uploaded_at DESC,file_id DESC LIMIT 50'
].join(' ');
const FILE_GET_SQL=[
 'SELECT file_id,file_name,mime_type,byte_length,sha256,object_key',
 'FROM qa_case_files_r2 WHERE installation_id=? AND tenant_id=? AND matter_id=? AND file_id=? LIMIT 1'
].join(' ');
const FILE_INSERT_SQL=[
 'INSERT INTO qa_case_files_r2(installation_id,tenant_id,matter_id,file_id,file_name,mime_type,',
 'byte_length,sha256,object_key,uploaded_by,uploaded_at)',
 'SELECT ?,?,?,?,?,?,?,?,?,?,? FROM qa_matters m',
 'WHERE m.installation_id=? AND m.tenant_id=? AND m.matter_id=?',
 'AND',ACL_FRAGMENT
].join(' ');
function validMagic(bytes,extension){
 if(extension==='pdf'){
  if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')return false;
  return new TextDecoder().decode(bytes.slice(-1024)).includes('%%EOF');
 }
 if(extension==='docx'){
  if(bytes.length<22||bytes[0]!==80||bytes[1]!==75||bytes[2]!==3||bytes[3]!==4)return false;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)
   if(bytes[i]===80&&bytes[i+1]===75&&bytes[i+2]===5&&bytes[i+3]===6)return true;
 }
 return false;
}
async function bounded(req,max){
 const reader=req.body?.getReader();if(!reader)throw Error('NO_BODY');
 let n=0;const pieces=[];
 try{
  for(;;){const {value,done}=await reader.read();if(done)break;n+=value.byteLength;
   if(n>max){await reader.cancel().catch(()=>{});throw Error('LARGE');}pieces.push(value);}
 }finally{reader.releaseLock();}
 const out=new Uint8Array(n);let at=0;
 for(const v of pieces){out.set(v,at);at+=v.byteLength;}
 return out;
}
async function files(req,env,p,matter,now,id){
 const isPost=req.method==='POST',permission=isPost?'write':'read';
 if(!await permitted(env,p,matter,permission,now))return forbidden();
 if(req.method==='GET'&&!id){
  const items=await env.DB.prepare(FILE_LIST_SQL).bind(env.INSTALLATION_ID,p.tenant_id,matter).all();
  return json(200,{files:(items.results||[]).map(x=>({id:x.file_id,name:x.file_name,
    mime_type:x.mime_type,bytes:x.byte_length,sha256:x.sha256,created_at:x.uploaded_at}))});
 }
 if(req.method==='GET'&&id){
  const file=await env.DB.prepare(FILE_GET_SQL).bind(env.INSTALLATION_ID,p.tenant_id,matter,id).first();
  if(!file)return forbidden();
  const object=await env.CASE_FILES_R2.get(file.object_key);
  if(!object)return unavailable();
  const bytes=new Uint8Array(await object.arrayBuffer());
  if(bytes.length!==file.byte_length||await digest(bytes)!==file.sha256)return unavailable();
  const quoted=encodeURIComponent(file.file_name).replace(/[()']/g,c=>'%'+c.charCodeAt(0).toString(16));
  return new Response(bytes,{status:200,headers:{
   'Content-Type':file.mime_type,'Content-Length':String(bytes.length),
   'Content-Disposition':"attachment; filename*=UTF-8''"+quoted,
   'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
   'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'
  }});
 }
 if(req.method!=='POST'||id)return error(405,'Phương thức không được hỗ trợ.');
 if(!origin(req))return error(403,'Từ chối yêu cầu không hợp lệ.');
 const contentType=(req.headers.get('Content-Type')||'').split(';')[0];
 if(!Object.values(MIMES).includes(contentType))return error(415,'Chỉ hỗ trợ PDF/DOCX.');
 let fileName;try{fileName=decodeURIComponent(req.headers.get('X-File-Name')||'');}catch{return error(400,'Tên tệp không hợp lệ.');}
 if(!safeName(fileName))return error(400,'Tên tệp không hợp lệ.');
 const extension=fileName.split('.').pop().toLowerCase();
 if(MIMES[extension]!==contentType)return error(415,'Định dạng tệp không khớp tên tệp.');
 if(Number(req.headers.get('Content-Length')||0)>MAX_FILE)return error(413,'Tệp vượt 10 MB.');
 const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM qa_case_files_r2 WHERE installation_id=? AND tenant_id=? AND matter_id=?')
  .bind(env.INSTALLATION_ID,p.tenant_id,matter).first();
 if(Number(count?.n||0)>=50)return error(429,'Hồ sơ đã đạt giới hạn 50 tệp.');
 let bytes;try{bytes=await bounded(req,MAX_FILE);}catch{return error(413,'Tệp vượt 10 MB hoặc kết nối bị gián đoạn.');}
 if(bytes.length<22||!validMagic(bytes,extension))return error(400,'Tệp không có cấu trúc PDF/DOCX hợp lệ.');
 const idNew=crypto.randomUUID(),sha=await digest(bytes),key=
  ['qa-cases',env.INSTALLATION_ID,p.tenant_id,matter,idNew].join('/');
 // No public R2 domain; this bucket can be accessed only by this Worker binding.
 try{await env.CASE_FILES_R2.put(key,bytes,{httpMetadata:{contentType:contentType}});}
 catch{return unavailable();}
 try{
  const receipt=await env.DB.prepare(FILE_INSERT_SQL).bind(
   env.INSTALLATION_ID,p.tenant_id,matter,idNew,fileName,contentType,bytes.length,
   sha,key,p.user_id,now,env.INSTALLATION_ID,p.tenant_id,matter,...aclParams(p,now)
  ).run();
  if(receipt.meta?.changes!==1){
   await env.CASE_FILES_R2.delete(key).catch(()=>{});
   return forbidden();
  }
 }catch{
  await env.CASE_FILES_R2.delete(key).catch(()=>{});
  return unavailable();
 }
 return json(201,{id:idNew,name:fileName,mime_type:contentType,bytes:bytes.length,sha256:sha,created_at:now});
}
async function events(env,p,matter,now){
 if(!await permitted(env,p,matter,'read',now))return forbidden();
 const rows=await env.DB.prepare(
  'SELECT action,file_id,actor_id,occurred_at FROM qa_case_events WHERE installation_id=? AND tenant_id=? AND matter_id=? ORDER BY occurred_at DESC,event_id DESC LIMIT 50'
 ).bind(env.INSTALLATION_ID,p.tenant_id,matter).all();
 return json(200,{events:(rows.results||[]).map(x=>({action:x.action,file_id:x.file_id,actor_id:x.actor_id,created_at:x.occurred_at}))});
}
export async function caseR2Api(req,env,opts={}){
 if(!configured(env))return unavailable();
 const route=new URL(req.url).pathname;
 const m=/^\/api\/qa\/cases\/([0-9a-f-]{36})(?:\/(files|events)(?:\/([0-9a-f-]{36})\/download)?)?$/.exec(route);
 if(!m||!UUID.test(m[1])||(m[3]&&!UUID.test(m[3])))return error(404,'Không tìm thấy.');
 if(m[2]==='events'&&(m[3]||req.method!=='GET'))return error(405,'Phương thức không được hỗ trợ.');
 if(m[2]==='files'&&!['GET','POST'].includes(req.method))return error(405,'Phương thức không được hỗ trợ.');
 if(!m[2]&&!['GET','PATCH'].includes(req.method))return error(405,'Phương thức không được hỗ trợ.');
 if(m[3]&&req.method!=='GET')return error(405,'Phương thức không được hỗ trợ.');
 try{
  const now=opts.now??Math.floor(Date.now()/1000);
  const principal=await mobileSession(req,env,now);
  if(!principal||!UUID.test(principal.user_id)||!UUID.test(principal.tenant_id))
   return error(401,'Phiên đăng nhập không còn hiệu lực.');
  if(!['lawyer','tenant_admin'].includes(principal.role_key))return error(403,'Không có quyền.');
  if(m[2]==='files')return files(req,env,principal,m[1],now,m[3]);
  if(m[2]==='events')return events(env,principal,m[1],now);
  return details(req,env,principal,m[1],now);
 }catch{return unavailable();}
}
