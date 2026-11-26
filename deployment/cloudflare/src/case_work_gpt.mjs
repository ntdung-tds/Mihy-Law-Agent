// R293 QA only. Contact information belongs to a matter, not a globally readable tenant directory.
import {mobileSession} from './mobile_auth.mjs';
import {matterAccess,readCaseJson} from './case_metadata_gpt.mjs';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers});
const deny=()=>json(404,{error:'Không tìm thấy hoặc không có quyền truy cập.'});
const bad=()=>json(400,{error:'Thông tin không hợp lệ.'});
const conflict=()=>json(409,{error:'Phiên bản, quyền hoặc đối tượng đã thay đổi. Hãy làm mới.'});
const unavailable=()=>json(503,{error:'Không xác nhận được thao tác. Hãy tải lại dữ liệu.'});
const keys=(x,a)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===a.slice().sort().join(',');
const clean=(s,max,min=0)=>typeof s==='string'&&s.length>=min&&s.length<=max&&s===s.trim().normalize('NFC')&&!/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069<>]/u.test(s);
const date=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||s.startsWith('0000'))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;};
const time=s=>s===''||typeof s==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s);
const version=v=>Number.isSafeInteger(v)&&v>=1&&v<=1000000000;
const contactFields=['kind','name','email','phone','state'];
const activityFields=['kind','title','due_date','due_time','contact_id','state'];
const checkContact=x=>keys(x,contactFields)&&['client','counterparty','other'].includes(x.kind)&&clean(x.name,160,1)&&clean(x.email,254)&&(!x.email||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email))&&clean(x.phone,50)&&(!x.phone||/^[+0-9 ()-]+$/.test(x.phone))&&['active','archived'].includes(x.state);
const checkActivity=x=>keys(x,activityFields)&&['task','meeting','hearing','deadline','interaction'].includes(x.kind)&&clean(x.title,160,1)&&date(x.due_date)&&time(x.due_time)&&['open','done','cancelled'].includes(x.state)&&(x.kind==='interaction'?typeof x.contact_id==='string'&&UUID.test(x.contact_id)&&x.state!=='open':x.contact_id===null);
const cfg={contacts:{table:'qa_case_contacts_gpt',id:'contact_id',fields:contactFields,validate:checkContact},activities:{table:'qa_case_activities_gpt',id:'activity_id',fields:activityFields,validate:checkActivity}};
const scope='installation_id=? AND tenant_id=? AND matter_id=?';
function requireResult(r){if(r?.success!==true||!Array.isArray(r.results))throw Error('DB');return r.results;}
const calendarToday=now=>new Date((now+7*3600)*1000).toISOString().slice(0,10);
function dueState(d,today){return d<today?'overdue':d===today?'today':'upcoming';}
async function calendar(env,p,now){
 const access=matterAccess(env,p,null,now);
 const sql=`WITH allowed AS (SELECT m.installation_id,m.tenant_id,m.matter_id,c.title AS matter_title ${access.sql})
 SELECT a.matter_id,a.matter_title,x.activity_id AS id,x.kind,x.title,x.due_date,x.due_time FROM allowed a
 JOIN qa_case_activities_gpt x ON x.installation_id=a.installation_id AND x.tenant_id=a.tenant_id AND x.matter_id=a.matter_id
 WHERE x.state='open' AND x.kind<>'interaction'
 UNION ALL SELECT a.matter_id,a.matter_title,'case-deadline:'||a.matter_id AS id,'case_deadline' AS kind,'Thời hạn hồ sơ' AS title,d.deadline AS due_date,'' AS due_time
 FROM allowed a JOIN qa_case_details d ON d.installation_id=a.installation_id AND d.tenant_id=a.tenant_id AND d.matter_id=a.matter_id
 WHERE d.deadline<>'' AND d.status<>'closed'
 ORDER BY due_date,due_time,id LIMIT 101`;
 const rows=requireResult(await env.DB.prepare(sql).bind(...access.args).all());
 const today=calendarToday(now);
 return json(200,{today,timezone:'Asia/Ho_Chi_Minh',truncated:rows.length>100,items:rows.slice(0,100).map(x=>({...x,due_state:dueState(x.due_date,today)}))});
}
async function list(env,p,matter,now){
 const read=matterAccess(env,p,matter,now),write=matterAccess(env,p,matter,now,true),args=[env.INSTALLATION_ID,p.tenant_id,matter];
 const gate=' AND EXISTS(SELECT 1 '+read.sql+')';
 const summary=await env.DB.prepare('SELECT c.title '+read.sql).bind(...read.args).first();
 if(!summary)return deny();
 const contacts=requireResult(await env.DB.prepare('SELECT contact_id AS id,'+contactFields.join(',')+',version FROM qa_case_contacts_gpt WHERE '+scope+gate+' ORDER BY state,name,contact_id LIMIT 101').bind(...args,...read.args).all());
 const activities=requireResult(await env.DB.prepare('SELECT activity_id AS id,'+activityFields.join(',')+',version FROM qa_case_activities_gpt WHERE '+scope+gate+' ORDER BY due_date,due_time,activity_id LIMIT 101').bind(...args,...read.args).all());
 const events=requireResult(await env.DB.prepare('SELECT event_id,entity_kind,entity_id,action,version,actor_id,occurred_at FROM qa_case_work_audit_gpt WHERE '+scope+gate+' ORDER BY occurred_at DESC,event_id DESC LIMIT 50').bind(...args,...read.args).all());
 if(!await env.DB.prepare('SELECT 1 '+read.sql).bind(...read.args).first())return deny();
 const canWrite=!!await env.DB.prepare('SELECT 1 '+write.sql).bind(...write.args).first();
 return json(200,{matter_id:matter,matter_title:summary.title,can_write:canWrite,contacts:contacts.slice(0,100),activities:activities.slice(0,100),truncated:contacts.length>100||activities.length>100,events});
}
async function mutate(req,env,p,matter,kind,id,now){
 const c=cfg[kind],write=matterAccess(env,p,matter,now,true);
 if(!await env.DB.prepare('SELECT 1 '+write.sql).bind(...write.args).first())return deny();
 let body;try{body=await readCaseJson(req,2500);}catch{return bad();}
 const create=req.method==='POST';
 if(!keys(body,create?['record']:['record','expected_version'])||!c.validate(body.record)||(!create&&!version(body.expected_version)))return bad();
 const record=body.record;
 if(create&&kind==='contacts'&&record.state!=='active')return bad();
 if(kind==='activities'&&record.kind==='interaction'&&create&&record.state!=='done')return bad();
 const values=c.fields.map(k=>record[k]);
 const contactGate=kind==='activities'&&record.kind==='interaction'?
  " AND EXISTS(SELECT 1 FROM qa_case_contacts_gpt k WHERE k.installation_id=m.installation_id AND k.tenant_id=m.tenant_id AND k.matter_id=m.matter_id AND k.contact_id=? AND k.state='active')":"";
 const accessArgs=[...write.args,...(contactGate?[record.contact_id]:[])];
 if(create){
  const newId=crypto.randomUUID(),placeholders=['?','?',...c.fields.map(()=>'?'),'1','?','?'].slice(1).join(',');
  // Count and permission checks share the INSERT statement. QA bound is 100 records per matter/type.
  const sql='INSERT INTO '+c.table+'(installation_id,tenant_id,matter_id,'+c.id+','+c.fields.join(',')+',version,updated_by,updated_at) SELECT m.installation_id,m.tenant_id,m.matter_id,'+placeholders+' '+write.sql+contactGate+' AND (SELECT COUNT(*) FROM '+c.table+' z WHERE z.installation_id=m.installation_id AND z.tenant_id=m.tenant_id AND z.matter_id=m.matter_id)<100 RETURNING '+c.id+' AS id,version';
  const row=await env.DB.prepare(sql).bind(newId,...values,p.user_id,now,...accessArgs).first();
  return row?.id===newId&&row.version===1?json(201,row):conflict();
 }
 const sql='UPDATE '+c.table+' SET '+c.fields.map(k=>k+'=?').join(',')+',version=version+1,updated_by=?,updated_at=? WHERE '+scope+' AND '+c.id+'=? AND version=? AND EXISTS(SELECT 1 '+write.sql+contactGate+') RETURNING '+c.id+' AS id,version';
 const row=await env.DB.prepare(sql).bind(...values,p.user_id,now,env.INSTALLATION_ID,p.tenant_id,matter,id,body.expected_version,...accessArgs).first();
 return row?.id===id&&row.version===body.expected_version+1?json(200,row):conflict();
}
export async function caseWorkApi(req,env,opts={}){
 const url=new URL(req.url),cal=url.pathname==='/api/qa/calendar',m=/^\/api\/qa\/case-work\/([0-9a-f-]{36})(?:\/(contacts|activities)(?:\/([0-9a-f-]{36}))?)?$/.exec(url.pathname);
 if(url.protocol!=='https:'||url.search||(!cal&&(!m||!UUID.test(m[1])||(m[3]&&!UUID.test(m[3])))))return deny();
 const valid=cal?req.method==='GET':!m[2]?req.method==='GET':m[3]?req.method==='PATCH':req.method==='POST';
 if(!valid)return json(405,{error:'Phương thức không hỗ trợ.'});
 if(env?.AI_LAW_CF_MODE!=='isolated-qa-only'||!UUID.test(env.INSTALLATION_ID||'')||!env.DB)return unavailable();
 try{
  const now=opts.now??Math.floor(Date.now()/1000),p=await mobileSession(req,env,now);
  if(!p||!UUID.test(p.user_id)||!UUID.test(p.tenant_id))return json(401,{error:'Phiên đăng nhập không hợp lệ.'});
  if(!['lawyer','tenant_admin'].includes(p.role_key))return deny();
  if(cal)return await calendar(env,p,now);
  if(!m[2])return await list(env,p,m[1],now);
  return await mutate(req,env,p,m[1],m[2],m[3],now);
 }catch{return unavailable();}
}
