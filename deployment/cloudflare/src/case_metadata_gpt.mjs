// R292: case metadata only, no R2 or OAuth. QA synthetic data only.
import {mobileSession} from './mobile_auth.mjs';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const HEAD={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:HEAD});
const bad=()=>json(400,{error:'Thông tin hồ sơ không hợp lệ.'});
const denied=()=>json(404,{error:'Không tìm thấy hồ sơ hoặc không có quyền truy cập.'});
export const DETAIL_FIELDS=Object.freeze(['reference','category','status','priority','client_label','counterparty_label','summary','deadline']);
const DEFAULTS=Object.freeze({reference:'',category:'',status:'open',priority:'normal',client_label:'',counterparty_label:'',summary:'',deadline:''});
const limits={reference:60,category:80,client_label:160,counterparty_label:160,summary:1600};
const clean=(s,max)=>typeof s==='string'&&s.length<=max&&s===s.normalize('NFC')&&!/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069<>]/u.test(s);
const validDate=s=>{if(s==='')return true;if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||s.startsWith('0000'))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;};
export function validCaseDetails(v){
 if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).sort().join(',')!==DETAIL_FIELDS.slice().sort().join(','))return false;
 if(Object.entries(limits).some(([k,max])=>k==='summary'?(typeof v[k]!=='string'||v[k].length>max||!clean(v[k].replace(/[\n\t]/g,' '),max)):!clean(v[k],max)))return false;
 return ['open','in_progress','on_hold','closed'].includes(v.status)&&['low','normal','high'].includes(v.priority)&&validDate(v.deadline);
}
export const CASE_INSERT_SQL="INSERT INTO qa_case_details(installation_id,tenant_id,matter_id,reference,category,status,priority,client_label,counterparty_label,summary,deadline,assignee_user_id,version,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)";
export function caseInsertStatement(env,p,matter,details,now){return env.DB.prepare(CASE_INSERT_SQL).bind(env.INSTALLATION_ID,p.tenant_id,matter,...DETAIL_FIELDS.map(k=>details[k]),p.user_id,p.user_id,now);}
function acl(permission){
 return `EXISTS(SELECT 1 FROM qa_matter_acl a WHERE a.installation_id=m.installation_id AND a.tenant_id=m.tenant_id AND a.matter_id=m.matter_id AND a.user_id=? AND a.permission='${permission}' AND a.effect='allow' AND a.acl_version=m.acl_version AND a.valid_from<=? AND (a.valid_to IS NULL OR a.valid_to>?))
 AND NOT EXISTS(SELECT 1 FROM qa_matter_acl d WHERE d.installation_id=m.installation_id AND d.tenant_id=m.tenant_id AND d.matter_id=m.matter_id AND d.user_id=? AND d.permission='${permission}' AND d.effect='deny' AND d.acl_version=m.acl_version AND d.valid_from<=? AND (d.valid_to IS NULL OR d.valid_to>?))`;
}
// Repeat the current session/membership + both ACL checks in the actual write, not only preflight.
export function matterAccess(env,p,matter,now,write=false){
 const check=`FROM qa_matters m JOIN qa_matter_catalog c ON c.installation_id=m.installation_id AND c.tenant_id=m.tenant_id AND c.matter_id=m.matter_id
 WHERE m.installation_id=? AND m.tenant_id=?${matter===null?'':' AND m.matter_id=?'}
 AND NOT EXISTS(SELECT 1 FROM qa_matter_hides h WHERE h.installation_id=m.installation_id AND h.tenant_id=m.tenant_id AND h.matter_id=m.matter_id)
 AND EXISTS(SELECT 1 FROM qa_sessions s JOIN qa_principals q ON q.installation_id=s.installation_id AND q.user_id=s.user_id
 JOIN qa_memberships n ON n.installation_id=s.installation_id AND n.tenant_id=s.tenant_id AND n.user_id=s.user_id
 JOIN qa_login_verifiers v ON v.installation_id=s.installation_id AND v.user_id=s.user_id AND v.subject=s.subject
 WHERE s.installation_id=m.installation_id AND s.tenant_id=m.tenant_id AND s.sid=? AND s.issuer=? AND s.subject=? AND s.user_id=?
 AND s.revoked_at IS NULL AND s.expires_at>? AND q.status='active' AND n.status='active' AND n.role_key IN ('lawyer','tenant_admin') AND v.status='active')
 AND ${acl('read')}${write?' AND '+acl('write'):''}`;
 const a=[p.user_id,now,now,p.user_id,now,now];
 return {sql:check,args:[env.INSTALLATION_ID,p.tenant_id,...(matter===null?[]:[matter]),p.sid,env.JWT_ISSUER,p.subject,p.user_id,now,...a,...(write?a:[])]};
}
export async function readCaseJson(req,max=6000){
 const l=req.headers.get('content-length');
 if(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site'||req.headers.has('content-encoding')||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get('content-type')||'')||!req.body)throw Error('request');
 if(l!==null&&(!/^\d{1,5}$/.test(l)||Number(l)>max))throw Error('size');
 const reader=req.body.getReader(),chunks=[];let n=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>max){try{await reader.cancel();}catch{}throw Error('size');}chunks.push(value);}}finally{reader.releaseLock();}
 if(l!==null&&Number(l)!==n)throw Error('length');
 const out=new Uint8Array(n);let i=0;for(const c of chunks){out.set(c,i);i+=c.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(out));
}
export async function caseMetadataApi(req,env,opts={}){
 const url=new URL(req.url),match=/^\/api\/qa\/case-info\/([0-9a-f-]{36})(?:\/(events|hide))?$/.exec(url.pathname);
 if(!match||!UUID.test(match[1])||url.search||url.protocol!=='https:')return denied();
 const matter=match[1],op=match[2]||'details';
 if((op==='events'&&req.method!=='GET')||(op==='hide'&&req.method!=='POST')||(op==='details'&&!['GET','PATCH'].includes(req.method)))return json(405,{error:'Phương thức không hỗ trợ.'});
 if(env?.AI_LAW_CF_MODE!=='isolated-qa-only'||!UUID.test(env.INSTALLATION_ID||'')||!env.DB)return json(503,{error:'Dịch vụ QA chưa sẵn sàng.'});
 try{
  const now=opts.now??Math.floor(Date.now()/1000),p=await mobileSession(req,env,now);
  if(!p||!UUID.test(p.user_id)||!UUID.test(p.tenant_id))return json(401,{error:'Phiên đăng nhập không hợp lệ.'});
  if(!['lawyer','tenant_admin'].includes(p.role_key))return denied();
  const read=matterAccess(env,p,matter,now),write=matterAccess(env,p,matter,now,true);
  if(req.method==='GET'){
   const row=await env.DB.prepare('SELECT c.title,c.version AS title_version '+read.sql).bind(...read.args).first();
   if(!row)return denied();
   const scope=' WHERE installation_id=? AND tenant_id=? AND matter_id=?';
   if(op==='events'){
    // Recheck permission in the event query itself; never return case content in the audit log.
    const result=await env.DB.prepare('SELECT event_id,actor_id,action,detail_version,occurred_at,changed_fields FROM qa_case_metadata_events_gpt'+scope+' AND EXISTS(SELECT 1 '+read.sql+') ORDER BY occurred_at DESC,event_id DESC LIMIT 50').bind(env.INSTALLATION_ID,p.tenant_id,matter,...read.args).all();
    if(result?.success!==true)return json(503,{error:'Không tải được nhật ký.'});
    return json(200,{events:result.results.map(x=>({id:x.event_id,actor_id:x.actor_id,action:x.action,version:x.detail_version,occurred_at:x.occurred_at,fields:JSON.parse(x.changed_fields).filter(Boolean)}))});
   }
   const d=await env.DB.prepare('SELECT '+DETAIL_FIELDS.join(',')+',version FROM qa_case_details'+scope+' AND EXISTS(SELECT 1 '+read.sql+')').bind(env.INSTALLATION_ID,p.tenant_id,matter,...read.args).first();
   if(!await env.DB.prepare('SELECT 1 '+read.sql).bind(...read.args).first())return denied();
   const canWrite=!!await env.DB.prepare('SELECT 1 '+write.sql).bind(...write.args).first();
   return json(200,{id:matter,title:row.title,title_version:row.title_version,version:d?.version||0,details:Object.fromEntries(DETAIL_FIELDS.map(k=>[k,d?.[k]??DEFAULTS[k]])),can_write:canWrite});
  }
  let body;try{body=await readCaseJson(req);}catch{return bad();}
  if(!await env.DB.prepare('SELECT 1 '+write.sql).bind(...write.args).first())return denied();
  if(op==='hide'){
   if(!body||Object.keys(body).sort().join(',')!=='expected_version'||!Number.isSafeInteger(body.expected_version)||body.expected_version<1)return bad();
   // Atomic tombstone + ACL version invalidation + immutable audit.
   const hidden=await env.DB.prepare('INSERT INTO qa_matter_hides(installation_id,tenant_id,matter_id,hidden_by,hidden_at) SELECT m.installation_id,m.tenant_id,m.matter_id,?,? '+write.sql+' AND c.version=? AND m.acl_version<9007199254740990 RETURNING matter_id').bind(p.user_id,now,...write.args,body.expected_version).first();
   return hidden?.matter_id===matter?json(200,{id:matter,hidden:true,physical_deleted:false}):json(409,{error:'Hồ sơ hoặc quyền đã thay đổi.'});
  }
  if(!body||Object.keys(body).sort().join(',')!=='details,expected_version'||!Number.isSafeInteger(body.expected_version)||body.expected_version<0||body.expected_version>1000000000||!validCaseDetails(body.details))return bad();
  const v=body.expected_version,values=DETAIL_FIELDS.map(k=>body.details[k]);let saved;
  if(v===0){
   const sql='INSERT INTO qa_case_details(installation_id,tenant_id,matter_id,'+DETAIL_FIELDS.join(',')+',assignee_user_id,version,updated_by,updated_at) SELECT m.installation_id,m.tenant_id,m.matter_id,?,?,?,?,?,?,?,?,?,1,?,? '+write.sql+' AND NOT EXISTS(SELECT 1 FROM qa_case_details d WHERE d.installation_id=m.installation_id AND d.tenant_id=m.tenant_id AND d.matter_id=m.matter_id) RETURNING version';
   saved=await env.DB.prepare(sql).bind(...values,p.user_id,p.user_id,now,...write.args).first();
  }else{
   const sql='UPDATE qa_case_details SET '+DETAIL_FIELDS.map(k=>k+'=?').join(',')+',version=version+1,updated_by=?,updated_at=? WHERE installation_id=? AND tenant_id=? AND matter_id=? AND version=? AND EXISTS(SELECT 1 '+write.sql+') RETURNING version';
   saved=await env.DB.prepare(sql).bind(...values,p.user_id,now,env.INSTALLATION_ID,p.tenant_id,matter,v,...write.args).first();
  }
  return saved?.version===v+1?json(200,{id:matter,version:v+1}):json(409,{error:'Phiên bản hoặc quyền đã thay đổi.'});
 }catch{return json(503,{error:'Không xác nhận được thao tác. Hãy tải lại dữ liệu.'});}
}
