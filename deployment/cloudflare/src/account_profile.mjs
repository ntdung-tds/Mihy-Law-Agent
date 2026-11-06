/* R67 QA-only personal profile, role visibility and sanitized thumbnail.
 * Plans are display metadata, NEVER authorization; tenant permissions remain D1-owned.
 */
import {mobileSession} from './mobile_auth.mjs';
const MAX_PROFILE_BODY=4096,MAX_AVATAR_BODY=48000;
const PROFILE_FIELDS=['display_name','phone','job_title','bio'];
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin',
  'Referrer-Policy':'no-referrer'}});
const denied=()=>json(401,{error:'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'});
const bad=()=>json(400,{error:'Thông tin không hợp lệ.'});
const unavailable=()=>json(503,{error:'Không thể tải thông tin tài khoản. Vui lòng thử lại.'});
const profileSQL='SELECT display_name,phone,job_title,bio,avatar_data,plan_code,updated_at FROM qa_account_profiles WHERE installation_id=? AND user_id=?';
const membershipSQL=['SELECT m.tenant_id,m.role_key,t.kind FROM qa_memberships m',
  'JOIN qa_tenants t ON t.installation_id=m.installation_id AND t.tenant_id=m.tenant_id',
  "WHERE m.installation_id=? AND m.user_id=? AND m.status='active'",
  'ORDER BY t.kind DESC,m.tenant_id LIMIT 20'].join(' ');
function sameOrigin(req){const u=new URL(req.url);return u.protocol==='https:'&&
  req.headers.get('Origin')===u.origin&&req.headers.get('Sec-Fetch-Site')!=='cross-site';}
async function bodyJSON(req,max){
  if(!sameOrigin(req)||!req.headers.get('Content-Type')?.startsWith('application/json')||
      Number(req.headers.get('Content-Length')||0)>max)return null;
  try{const raw=await req.text();if(raw.length>max)return null;
    const obj=JSON.parse(raw);return obj&&typeof obj==='object'&&!Array.isArray(obj)?obj:null;
  }catch{return null;}
}
function cleanString(v,max){
  if(typeof v!=='string'||v.length>max*2)return null;
  const value=v.normalize('NFC').trim();
  return value.length<=max&&!/[\u0000-\u001f\u007f]/u.test(value)?value:null;
}
function jpegSafe(base64){
  if(typeof base64!=='string'||base64.length>44000||
     !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(base64))return false;
  let raw;try{raw=atob(base64.slice('data:image/jpeg;base64,'.length));}catch{return false;}
  if(raw.length<40||raw.length>32000)return false;
  const b=Uint8Array.from(raw,c=>c.charCodeAt(0)),n=b.length;
  if(b[0]!==255||b[1]!==216||b[2]!==255||b[n-2]!==255||b[n-1]!==217)return false;
  let p=2,sawFrame=false;
  while(p<n-4){
    if(b[p]!==255)return false;
    while(b[p]===255)p++;
    const mark=b[p++];
    if(mark===0xda)break;
    if(mark===0xd9)return false;
    if((mark>=0xd0&&mark<=0xd7)||mark===1)continue;
    if(p+2>n)return false;
    const size=b[p]*256+b[p+1];
    if(size<2||p+size>n)return false;
    if(mark===0xc0||mark===0xc1||mark===0xc2){
      if(size<7)return false;
      const height=b[p+3]*256+b[p+4],width=b[p+5]*256+b[p+6];
      if(height<32||height>256||width<32||width>256)return false;
      sawFrame=true;
    }
    p+=size;
  }
  return sawFrame;
}
async function readProfile(req,env,now){
  const session=await mobileSession(req,env,now);if(!session)return denied();
  const [row,memberships]=await Promise.all([
    env.DB.prepare(profileSQL).bind(env.INSTALLATION_ID,session.user_id).first(),
    env.DB.prepare(membershipSQL).bind(env.INSTALLATION_ID,session.user_id).all()
  ]);
  const active=(memberships.results||[]).filter(w=>
    (w.role_key==='lawyer'||w.role_key==='tenant_admin')&&
    (w.kind==='personal'||w.kind==='organization'));
  if(!active.some(w=>w.tenant_id===session.tenant_id&&w.role_key===session.role_key))return denied();
  return json(200,{email:session.email,
    profile:{display_name:row?.display_name||'',phone:row?.phone||'',
      job_title:row?.job_title||'',bio:row?.bio||'',avatar_data:row?.avatar_data||'',
      updated_at:row?.updated_at||null},
    plan:{code:row?.plan_code==='pro'?'pro':'demo',source:'qa_nonproduction',billing_active:false},
    active_workspace:{tenant_id:session.tenant_id,type:session.kind,role:session.role_key},
    workspaces:active.map(w=>({tenant_id:w.tenant_id,type:w.kind,role:w.role_key}))});
}
async function saveProfile(req,env,now){
  const data=await bodyJSON(req,MAX_PROFILE_BODY);if(!data)return bad();
  if(Object.keys(data).length!==PROFILE_FIELDS.length||
     Object.keys(data).some(k=>!PROFILE_FIELDS.includes(k)))return bad();
  const values=PROFILE_FIELDS.map(k=>cleanString(data[k],k==='bio'?400:k==='phone'?24:80));
  if(values.some(v=>v===null)||!values[0]||
     (values[1]&&!/^\+?[0-9 ()\-.]{6,24}$/.test(values[1])))return bad();
  const session=await mobileSession(req,env,now);if(!session)return denied();
  await env.DB.prepare(
    'INSERT INTO qa_account_profiles(installation_id,user_id,display_name,phone,job_title,bio,updated_at) '+
    'VALUES(?,?,?,?,?,?,?) ON CONFLICT(installation_id,user_id) DO UPDATE SET '+
    'display_name=excluded.display_name,phone=excluded.phone,job_title=excluded.job_title,'+
    'bio=excluded.bio,updated_at=excluded.updated_at'
  ).bind(env.INSTALLATION_ID,session.user_id,...values,now).run();
  return json(200,{ok:true});
}
async function saveAvatar(req,env,now){
  const data=await bodyJSON(req,MAX_AVATAR_BODY);if(!data||
     Object.keys(data).length!==1||!Object.hasOwn(data,'avatar_data'))return bad();
  if(data.avatar_data!==''&&!jpegSafe(data.avatar_data))return bad();
  const session=await mobileSession(req,env,now);if(!session)return denied();
  await env.DB.prepare(
    'INSERT INTO qa_account_profiles(installation_id,user_id,avatar_data,updated_at) '+
    'VALUES(?,?,?,?) ON CONFLICT(installation_id,user_id) DO UPDATE SET '+
    'avatar_data=excluded.avatar_data,updated_at=excluded.updated_at'
  ).bind(env.INSTALLATION_ID,session.user_id,data.avatar_data,now).run();
  return json(200,{ok:true,removed:data.avatar_data===''});
}
export async function accountApi(req,env,opts={}){
  if(env?.AI_LAW_CF_MODE!=='isolated-qa-only'||!env.DB||!env.INSTALLATION_ID)return unavailable();
  const now=opts.now??Math.floor(Date.now()/1000),path=new URL(req.url).pathname;
  try{
    if(path==='/api/qa/profile'&&req.method==='GET')return await readProfile(req,env,now);
    if(path==='/api/qa/profile'&&req.method==='POST')return await saveProfile(req,env,now);
    if(path==='/api/qa/profile/avatar'&&req.method==='POST')return await saveAvatar(req,env,now);
    return json(404,{error:'Không tìm thấy.'});
  }catch{return unavailable();}
}
