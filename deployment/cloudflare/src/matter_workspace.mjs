/** R46 first genuine application workflow: tenant/MatterACL scoped matter register.
 * Only synthetic QA metadata on isolated Cloudflare Free D1.
 * No real client files, legal text, OAuth, AI or production IAM.
 */
import {mobileSession} from './mobile_auth.mjs';
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const MAX_BODY=1024;
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'
}});
const unavailable=()=>json(503,{error:'Dịch vụ hồ sơ QA chưa sẵn sàng.'});
const denied=()=>json(401,{error:'Phiên đăng nhập không còn hiệu lực.'});
const bad=()=>json(400,{error:'Thông tin hồ sơ không hợp lệ.'});
function originOkay(req){
 const url=new URL(req.url);
 return url.protocol==='https:' && req.headers.get('Origin')===url.origin &&
        req.headers.get('Sec-Fetch-Site')!=='cross-site';
}
function configured(env){
 return env?.AI_LAW_CF_MODE==='isolated-qa-only' && !!env.DB &&
        UUID.test(env.INSTALLATION_ID||'');
}
export const MATTER_LIST_SQL=`
SELECT c.matter_id,c.title,c.created_at
FROM qa_matter_catalog c JOIN qa_matters m
 ON m.installation_id=c.installation_id AND m.tenant_id=c.tenant_id AND m.matter_id=c.matter_id
WHERE c.installation_id=? AND c.tenant_id=?
 AND EXISTS(
  SELECT 1 FROM qa_matter_acl a
  WHERE a.installation_id=c.installation_id AND a.tenant_id=c.tenant_id
   AND a.matter_id=c.matter_id AND a.user_id=? AND a.permission='read'
   AND a.effect='allow' AND a.acl_version=m.acl_version
   AND a.valid_from<=? AND (a.valid_to IS NULL OR a.valid_to>?))
 AND NOT EXISTS(
  SELECT 1 FROM qa_matter_acl d
  WHERE d.installation_id=c.installation_id AND d.tenant_id=c.tenant_id
   AND d.matter_id=c.matter_id AND d.user_id=? AND d.permission='read'
   AND d.effect='deny' AND d.acl_version=m.acl_version
   AND d.valid_from<=? AND (d.valid_to IS NULL OR d.valid_to>?))
ORDER BY c.created_at DESC,c.matter_id DESC LIMIT 50
`;
async function list(env,identity,now){
 const r=await env.DB.prepare(MATTER_LIST_SQL).bind(
   env.INSTALLATION_ID,identity.tenant_id,
   identity.user_id,now,now,identity.user_id,now,now).all();
 return json(200,{matters:(r.results||[]).map(x=>({
   id:x.matter_id,title:x.title,created_at:x.created_at
 }))});
}
async function create(req,env,identity,now){
 if(!originOkay(req) || !req.headers.get('Content-Type')?.startsWith('application/json'))return bad();
 if(Number(req.headers.get('Content-Length')||0)>MAX_BODY)return bad();
 let data;
 try{
  const raw=await req.text();if(raw.length>MAX_BODY)return bad();data=JSON.parse(raw);
 }catch{return bad();}
 if(!data||typeof data.title!=='string')return bad();
 const title=data.title.trim().normalize('NFC');
 if(title.length<3||title.length>100||/[\u0000-\u001f\u007f<>]/u.test(title))return bad();
 // No bulk importing or real case content in this QA-only module.
 const limits=await env.DB.prepare(`SELECT COUNT(*) AS n FROM qa_matter_catalog
  WHERE installation_id=? AND tenant_id=?`).bind(env.INSTALLATION_ID,identity.tenant_id).first();
 if(Number(limits?.n||0)>=50)return json(429,{error:'Không gian QA đã đạt giới hạn hồ sơ.'});
 const id=crypto.randomUUID(),eid=crypto.randomUUID();
 const sql=[
  env.DB.prepare('INSERT INTO qa_matters(installation_id,tenant_id,matter_id,acl_version) VALUES(?,?,?,1)')
    .bind(env.INSTALLATION_ID,identity.tenant_id,id),
  env.DB.prepare(`INSERT INTO qa_matter_acl(
   installation_id,tenant_id,matter_id,user_id,permission,effect,acl_version,valid_from,valid_to)
   VALUES(?,?,?,?,?,?,1,?,NULL)`).bind(env.INSTALLATION_ID,identity.tenant_id,id,identity.user_id,'read','allow',now),
  env.DB.prepare(`INSERT INTO qa_matter_acl(
   installation_id,tenant_id,matter_id,user_id,permission,effect,acl_version,valid_from,valid_to)
   VALUES(?,?,?,?,?,?,1,?,NULL)`).bind(env.INSTALLATION_ID,identity.tenant_id,id,identity.user_id,'write','allow',now),
  env.DB.prepare(`INSERT INTO qa_matter_catalog(
   installation_id,tenant_id,matter_id,title,created_by,created_at)
   VALUES(?,?,?,?,?,?)`).bind(env.INSTALLATION_ID,identity.tenant_id,id,title,identity.user_id,now),
  env.DB.prepare(`INSERT INTO qa_matter_events(
   installation_id,tenant_id,event_id,matter_id,actor_id,action,created_at)
   VALUES(?,?,?,?,?,?,?)`).bind(env.INSTALLATION_ID,identity.tenant_id,eid,id,identity.user_id,'created',now)
 ];
 await env.DB.batch(sql);
 return json(201,{id,title,created_at:now});
}
export async function matterApi(request,env,options={}){
 if(!configured(env))return unavailable();
 if(!['GET','POST'].includes(request.method))return json(405,{error:'Phương thức không được hỗ trợ.'});
 try{
  const now=options.now??Math.floor(Date.now()/1000);
  const identity=await mobileSession(request,env,now);
  if(!identity||!UUID.test(identity.user_id)||!UUID.test(identity.tenant_id))return denied();
  if(!['lawyer','tenant_admin'].includes(identity.role_key))return json(403,{error:'Không có quyền.'});
  if(request.method==='GET')return await list(env,identity,now);
  return await create(request,env,identity,now);
 }catch{return unavailable();}
}
