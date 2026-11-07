/* R103 — QA-only customer-chosen storage folder registry.
 * No OAuth secrets in HTTP; explicit per-tenant, per-user grants; no default destination.
 * Google child folders are created under the already-approved tenant root.
 * A provider-neutral UI is planned, but OneDrive is never advertised as connected.
 */
import {mobileSession} from './mobile_auth.mjs';
import {tenantDriveAdapter,PERSONAL_OWNER_SQL} from './oauth_drive.mjs';
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const ID=/^[A-Za-z0-9_-]{10,200}$/;
const respond=(status,data)=>new Response(JSON.stringify(data),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const denied=()=>respond(404,{error:'Không tìm thấy hoặc không được cấp quyền lưu trữ.'});
const csrf=req=>{const u=new URL(req.url);return u.protocol==='https:'&&
 req.headers.get('Origin')===u.origin&&req.headers.get('Sec-Fetch-Site')!=='cross-site'};
const validName=s=>typeof s==='string'&&s===s.trim()&&s===s.normalize('NFC')&&
 s.length>=3&&s.length<=80&&!s.includes('..')&&/^[\p{L}\p{N} _().-]+$/u.test(s);
const configured=env=>env?.AI_LAW_CF_MODE==='isolated-qa-only'&&env.DB&&UUID.test(env.INSTALLATION_ID||'');
const ASSIGNED_SQL=[
 'SELECT d.destination_id,d.folder_id,d.label,d.provider,d.owner_kind',
 'FROM qa_storage_destinations d JOIN qa_storage_assignments g',
 'ON g.installation_id=d.installation_id AND g.tenant_id=d.tenant_id AND g.destination_id=d.destination_id',
 'JOIN qa_memberships m ON m.installation_id=g.installation_id AND m.tenant_id=g.tenant_id AND m.user_id=g.user_id',
 'JOIN qa_principals p ON p.installation_id=m.installation_id AND p.user_id=m.user_id',
 "WHERE d.installation_id=? AND d.tenant_id=? AND d.destination_id=? AND d.status='active'",
 "AND d.provider='google_drive' AND g.user_id=? AND m.status='active' AND p.status='active' LIMIT 1"
].join(' ');
export {ASSIGNED_SQL};
export async function assignedDestination(env,p,destinationId){
 if(!UUID.test(destinationId||'')||!UUID.test(p?.tenant_id||'')||!UUID.test(p?.user_id||''))return null;
 const d=await env.DB.prepare(ASSIGNED_SQL)
  .bind(env.INSTALLATION_ID,p.tenant_id,destinationId,p.user_id).first();
 return d&&ID.test(d.folder_id||'')?d:null;
}
async function canManage(env,p){
 if(p?.role_key==='tenant_admin')return true;
 if(p?.role_key!=='lawyer'||p?.kind!=='personal')return false;
 return !!await env.DB.prepare(PERSONAL_OWNER_SQL)
  .bind(env.INSTALLATION_ID,p.tenant_id,p.user_id).first();
}
async function readJSON(req){
 const size=Number(req.headers.get('Content-Length')||0);
 if(size>1024||!/^application\/json(?:;|$)/i.test(req.headers.get('Content-Type')||''))throw Error('Invalid payload');
 const b=await req.arrayBuffer();
 if(b.byteLength>1024||b.byteLength===0)throw Error('Invalid payload');
 return JSON.parse(new TextDecoder().decode(b));
}
async function list(env,p,canAdmin,all){
 const args=[env.INSTALLATION_ID,p.tenant_id];
 const q=all&&canAdmin?
  `SELECT d.destination_id,d.label,d.provider,d.owner_kind,d.created_by,
      EXISTS(SELECT 1 FROM qa_storage_assignments g WHERE g.installation_id=d.installation_id
        AND g.tenant_id=d.tenant_id AND g.destination_id=d.destination_id AND g.user_id=?) AS assigned
    FROM qa_storage_destinations d WHERE d.installation_id=? AND d.tenant_id=? AND d.status='active'
    ORDER BY d.created_at DESC LIMIT 50`:
  `SELECT d.destination_id,d.label,d.provider,d.owner_kind,d.created_by,1 AS assigned
    FROM qa_storage_destinations d JOIN qa_storage_assignments g
     ON g.installation_id=d.installation_id AND g.tenant_id=d.tenant_id AND g.destination_id=d.destination_id
    WHERE d.installation_id=? AND d.tenant_id=? AND d.status='active' AND g.user_id=?
    ORDER BY d.created_at DESC LIMIT 50`;
 const bound=all&&canAdmin?[p.user_id,...args]:[...args,p.user_id];
 const res=await env.DB.prepare(q).bind(...bound).all();
 return respond(200,{destinations:(res.results||[]).map(d=>({
  id:d.destination_id,label:d.label,provider:d.provider,kind:d.owner_kind,
  assigned:Boolean(d.assigned),can_assign:canAdmin
 })),can_manage:canAdmin,providers:{google_drive:true,onedrive:false}});
}
async function members(env,p){
 const r=await env.DB.prepare(`SELECT m.user_id,m.role_key,MIN(v.email) AS email
   FROM qa_memberships m JOIN qa_principals p ON p.installation_id=m.installation_id
      AND p.user_id=m.user_id AND p.status='active'
   LEFT JOIN qa_login_verifiers v ON v.installation_id=m.installation_id
      AND v.user_id=m.user_id AND v.status='active'
   WHERE m.installation_id=? AND m.tenant_id=? AND m.status='active'
   GROUP BY m.user_id,m.role_key ORDER BY email LIMIT 100`)
  .bind(env.INSTALLATION_ID,p.tenant_id).all();
 return respond(200,{members:(r.results||[]).map(x=>({id:x.user_id,
  label:x.email||x.user_id,role:x.role_key}))});
}
async function create(req,env,p,now,opts){
 const data=await readJSON(req);
 if(!data||Object.keys(data).sort().join(',')!=='name'||!validName(data.name))
  return respond(400,{error:'Tên thư mục từ 3–80 ký tự, không có đường dẫn.'});
 const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM qa_storage_destinations WHERE installation_id=? AND tenant_id=? AND status='active'")
  .bind(env.INSTALLATION_ID,p.tenant_id).first();
 if(Number(count?.n||0)>=50)return respond(429,{error:'Đã đạt giới hạn 50 vị trí lưu trữ QA.'});
 let drive,folder;
 try{
  drive=opts.storageDrive??await tenantDriveAdapter(env,p,opts);
  folder=await drive.createChildFolder(data.name);
 }catch{return respond(503,{error:'Không tạo được thư mục Google Drive. Hãy kiểm tra kết nối và quyền.'});}
 const destinationId=crypto.randomUUID();
 try{
  const actions=await env.DB.batch([
   env.DB.prepare("INSERT INTO qa_storage_destinations (installation_id,tenant_id,destination_id,provider,folder_id,label,owner_kind,status,created_by,created_at) VALUES(?,?,?,'google_drive',?,?,?,'active',?,?)")
    .bind(env.INSTALLATION_ID,p.tenant_id,destinationId,folder.id,data.name,
      p.kind==='personal'?'personal':'organization',p.user_id,now),
   env.DB.prepare('INSERT INTO qa_storage_assignments (installation_id,tenant_id,destination_id,user_id,granted_by,granted_at) VALUES(?,?,?,?,?,?)')
    .bind(env.INSTALLATION_ID,p.tenant_id,destinationId,p.user_id,p.user_id,now)
  ]);
  if(actions?.length!==2||actions.some(x=>x.success===false||x.meta?.changes!==1))
   throw Error('Database rejected');
 }catch{
  try{await drive.removeChildFolder(folder.id);}catch{/* Reconcile orphan; never auto retry creation */ }
  return respond(503,{error:'Google đã tạo thư mục nhưng AI Law chưa ghi nhận. Không thử lại ngay để tránh thư mục trùng.'});
 }
 return respond(201,{destination:{id:destinationId,label:data.name,provider:'google_drive',
  kind:p.kind==='personal'?'personal':'organization',assigned:true}});
}
async function assign(req,env,p,now){
 if(p.role_key!=='tenant_admin')return denied();
 const data=await readJSON(req);
 if(!data||Object.keys(data).sort().join(',')!=='destination_id,enabled,user_id'||
    !UUID.test(data.destination_id||'')||!UUID.test(data.user_id||'')||
    typeof data.enabled!=='boolean')return respond(400,{error:'Phân quyền thư mục không hợp lệ.'});
 const d=await env.DB.prepare("SELECT destination_id FROM qa_storage_destinations WHERE installation_id=? AND tenant_id=? AND destination_id=? AND status='active' AND owner_kind='organization'")
  .bind(env.INSTALLATION_ID,p.tenant_id,data.destination_id).first();
 const m=await env.DB.prepare(`SELECT 1 AS ok FROM qa_memberships m JOIN qa_principals p
 ON p.installation_id=m.installation_id AND p.user_id=m.user_id AND p.status='active'
 WHERE m.installation_id=? AND m.tenant_id=? AND m.user_id=? AND m.status='active' LIMIT 1`)
  .bind(env.INSTALLATION_ID,p.tenant_id,data.user_id).first();
 if(!d||!m)return denied();
 if(data.enabled){
  await env.DB.prepare("INSERT INTO qa_storage_assignments (installation_id,tenant_id,destination_id,user_id,granted_by,granted_at) VALUES(?,?,?,?,?,?) ON CONFLICT(installation_id,tenant_id,destination_id,user_id) DO UPDATE SET granted_by=excluded.granted_by,granted_at=excluded.granted_at")
   .bind(env.INSTALLATION_ID,p.tenant_id,data.destination_id,data.user_id,p.user_id,now).run();
 }else{
  await env.DB.prepare('DELETE FROM qa_storage_assignments WHERE installation_id=? AND tenant_id=? AND destination_id=? AND user_id=?')
   .bind(env.INSTALLATION_ID,p.tenant_id,data.destination_id,data.user_id).run();
 }
 return respond(200,{updated:true,enabled:data.enabled});
}
// A user-selected existing folder needs no AI Law admin grant wizard.
// The connected provider verifies the folder's real write capability.
async function selectExisting(req,env,p,now,opts){
 const v=await readJSON(req);
 if(!v||Object.keys(v).sort().join(',')!=='folder_id'||!ID.test(v.folder_id||''))
  return respond(400,{error:'Vị trí được chọn từ Drive chưa hợp lệ.'});
 let info;
 try{
  const drive=opts.storageDrive??await tenantDriveAdapter(env,p,opts);
  info=await drive.writableFolder(v.folder_id);
 }catch{return denied();}
 if(typeof info.name!=='string'||info.name.length<1)return denied();
 let row=await env.DB.prepare('SELECT destination_id FROM qa_storage_destinations WHERE installation_id=? AND tenant_id=? AND folder_id=? AND status=\'active\' LIMIT 1')
  .bind(env.INSTALLATION_ID,p.tenant_id,v.folder_id).first();
 let id=row?.destination_id;
 if(!id){
  const cnt=await env.DB.prepare("SELECT COUNT(*) AS n FROM qa_storage_destinations WHERE installation_id=? AND tenant_id=? AND status='active'")
   .bind(env.INSTALLATION_ID,p.tenant_id).first();
  if(Number(cnt?.n||0)>=50)return respond(429,{error:'Đã đạt giới hạn vị trí lưu trữ QA.'});
  id=crypto.randomUUID();
  const safeLabel=info.name.normalize('NFC').slice(0,80);
  if(safeLabel.length<3) return respond(400,{error:'Tên thư mục Drive chưa được hỗ trợ.'});
  await env.DB.prepare("INSERT INTO qa_storage_destinations (installation_id,tenant_id,destination_id,provider,folder_id,label,owner_kind,status,created_by,created_at) VALUES(?,?,?,'google_drive',?,?,?,'active',?,?) ON CONFLICT(installation_id,tenant_id,folder_id) DO NOTHING")
   .bind(env.INSTALLATION_ID,p.tenant_id,id,v.folder_id,safeLabel,
    p.kind==='personal'?'personal':'organization',p.user_id,now).run();
  // An interrupted concurrent selection may have inserted the same folder.
  row=await env.DB.prepare('SELECT destination_id FROM qa_storage_destinations WHERE installation_id=? AND tenant_id=? AND folder_id=? AND status=\'active\' LIMIT 1')
   .bind(env.INSTALLATION_ID,p.tenant_id,v.folder_id).first();
  if(!row)return respond(503,{error:'Không ghi nhận được thư mục Drive đã chọn.'});
  id=row.destination_id;
 }
 await env.DB.prepare('INSERT INTO qa_storage_assignments (installation_id,tenant_id,destination_id,user_id,granted_by,granted_at) VALUES(?,?,?,?,?,?) ON CONFLICT(installation_id,tenant_id,destination_id,user_id) DO NOTHING')
  .bind(env.INSTALLATION_ID,p.tenant_id,id,p.user_id,p.user_id,now).run();
 return respond(200,{destination:{id,label:info.name,provider:'google_drive'}});
}
export async function storageDestinationApi(req,env,opts={}){
 if(!configured(env))return respond(503,{error:'Lưu trữ QA chưa được cấu hình.'});
 const path=new URL(req.url).pathname;
 if(!['/api/qa/storage/destinations','/api/qa/storage/members','/api/qa/storage/assignments','/api/qa/storage/select'].includes(path))
  return denied();
 if(req.method!=='GET'&&req.method!=='POST')return respond(405,{error:'Method not allowed'});
 if(req.method==='POST'&&!csrf(req))return respond(403,{error:'CSRF_DENIED'});
 const now=opts.now??Math.floor(Date.now()/1000);
 try{
  const p=await mobileSession(req,env,now);
  if(!p||!UUID.test(p.user_id||'')||!UUID.test(p.tenant_id||''))return respond(401,{error:'Phiên không hợp lệ.'});
  const manage=await canManage(env,p);
  if(path==='/api/qa/storage/destinations'&&req.method==='GET')
   return await list(env,p,manage,new URL(req.url).searchParams.get('manage')==='1');
  if(path==='/api/qa/storage/members'&&req.method==='GET')
   return manage&&p.role_key==='tenant_admin'?members(env,p):denied();
  if(path==='/api/qa/storage/destinations'&&req.method==='POST')
   return manage?create(req,env,p,now,opts):denied();
  if(path==='/api/qa/storage/assignments'&&req.method==='POST')
   return manage?assign(req,env,p,now):denied();
  if(path==='/api/qa/storage/select'&&req.method==='POST')
   return selectExisting(req,env,p,now,opts);
  return respond(405,{error:'Method not allowed'});
 }catch{return respond(503,{error:'Không thể xác minh vị trí lưu trữ. Vui lòng thử lại.'});}
}
