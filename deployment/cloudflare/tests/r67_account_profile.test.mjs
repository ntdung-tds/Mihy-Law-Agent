import test from 'node:test';
import assert from 'node:assert/strict';
import {accountApi} from '../src/account_profile.mjs';
import {COOKIE_SESSION_SQL} from '../src/mobile_auth.mjs';
const INSTALL='a1a1a1a1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER='40404040-0000-4000-8000-000000000004';
const SID='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ORIGIN='https://qa.example.invalid';
function mockDB({revoked=false,tier='demo',user=USER}={}){
  const state={row:null,writes:[],user,tier,revoked,activeTenant:TENANT};
  return {state,prepare(sql){return {bind(...params){return {
    async first(){
      if(sql===COOKIE_SESSION_SQL){
        return state.revoked||params[1]!==SID?null:{user_id:state.user,tenant_id:state.activeTenant,
          role_key:'lawyer',kind:'organization',subject:'qa-synthetic',
          expires_at:1800001800,email:'qa@example.invalid'};
      }
      if(sql.includes('FROM qa_account_profiles WHERE installation_id=? AND user_id=?'))
        return state.row;
      throw Error('Unexpected first: '+sql.slice(0,90));
    },
    async all(){
      if(!sql.includes('FROM qa_memberships m'))throw Error('Unexpected all');
      return {results:[
        {tenant_id:TENANT,role_key:'lawyer',kind:'organization'},
        {tenant_id:FOREIGN,role_key:'tenant_admin',kind:'personal'}
      ]};
    },
    async run(){
      state.writes.push({sql,params});
      if(sql.startsWith('INSERT INTO qa_account_profiles')&&sql.includes('display_name,phone')){
        state.row={...(state.row||{plan_code:state.tier,avatar_data:''}),
          display_name:params[2],phone:params[3],job_title:params[4],
          bio:params[5],updated_at:params[6]};
      }else if(sql.startsWith('INSERT INTO qa_account_profiles')&&sql.includes('avatar_data')){
        state.row={...(state.row||{plan_code:state.tier,display_name:'',phone:'',
                                     job_title:'',bio:''}),avatar_data:params[2],
                   updated_at:params[3]};
      }else throw Error('Unexpected write');
      return {meta:{changes:1}};
    }
  };}}}};
}
const env=db=>({DB:db,INSTALLATION_ID:INSTALL,AI_LAW_CF_MODE:'isolated-qa-only',
 JWT_ISSUER:'https://issuer.example.invalid'});
const request=(path,{method='GET',body,cookie=true,origin=ORIGIN}={})=>
  new Request(ORIGIN+path,{method,headers:{
    ...(cookie?{Cookie:'al_qa_session='+SID}:{}),
    ...(method==='POST'?{'Content-Type':'application/json',Origin:origin,
      'Sec-Fetch-Site':origin===ORIGIN?'same-origin':'cross-site'}:{})
  },...(method==='POST'?{body:JSON.stringify(body)}:{})});
const call=(path,db,options)=>accountApi(request(path,options),env(db),{now:1800000000});
const valid={display_name:'Nguyễn Thử Nghiệm',phone:'+84 912 345 678',
  job_title:'Luật sư tư vấn',bio:'Chỉ dùng dữ liệu QA'};
function syntheticJpeg(){
  const prefix=[0xff,0xd8,0xff,0xe0,0,4,0,0,0xff,0xc0,0,17,
    8,0,160,0,160,3,1,0x11,0,2,0x11,0,3,0x11,0,
    0xff,0xda,0,8,1,1,0,0,0x3f,0];
  return 'data:image/jpeg;base64,'+Buffer.from([...prefix,...Array(42).fill(7),255,217]).toString('base64');
}
test('R67 unauthenticated account profile and avatar requests fail closed',async()=>{
  const db=mockDB();
  assert.equal((await call('/api/qa/profile',db,{cookie:false})).status,401);
  assert.equal((await call('/api/qa/profile',db,{cookie:false,method:'POST',body:valid})).status,401);
  assert.equal((await call('/api/qa/profile/avatar',db,{cookie:false,method:'POST',
     body:{avatar_data:syntheticJpeg()}})).status,401);
  assert.equal(db.state.writes.length,0);
});
test('R67 profile read is identity bound, returns safe role and plan metadata',async()=>{
  const db=mockDB({tier:'pro'});
  let r=await call('/api/qa/profile',db);
  assert.equal(r.status,200);
  let data=await r.json();
  assert.equal(data.email,'qa@example.invalid');
  assert.equal(data.active_workspace.role,'lawyer');
  assert.equal(data.plan.code,'demo','unseeded self cannot invent Pro');
  assert.equal(data.plan.billing_active,false);
  db.state.row={display_name:'Professional QA',phone:'',job_title:'',bio:'',
    avatar_data:'',plan_code:'pro',updated_at:1800000001};
  r=await call('/api/qa/profile',db);data=await r.json();
  assert.equal(data.plan.code,'pro','admin-assigned account tier is readable');
  assert.equal(data.active_workspace.tenant_id,TENANT);
  assert.equal(data.workspaces.length,2);
  db.state.activeTenant='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  assert.equal((await call('/api/qa/profile',db)).status,401,'session with no eligible membership denied');
});
test('R67 personal fields save, preserve immutable plan/avatar and read back',async()=>{
  const db=mockDB();
  db.state.row={display_name:'Old',phone:'',job_title:'',
    bio:'',avatar_data:syntheticJpeg(),plan_code:'pro'};
  const r=await call('/api/qa/profile',db,{method:'POST',body:valid});
  assert.equal(r.status,200);
  assert.equal(db.state.row.display_name,valid.display_name);
  assert.equal(db.state.row.avatar_data.startsWith('data:image/jpeg'),true);
  assert.equal(db.state.row.plan_code,'pro');
  const read=await (await call('/api/qa/profile',db)).json();
  assert.equal(read.profile.display_name,valid.display_name);
  assert.equal(read.plan.code,'pro');
  assert.equal(db.state.writes[0].params[1],USER);
});
test('R67 crafted attempts to modify email, plan, permissions or other users are rejected',async()=>{
  const db=mockDB();
  for(const extra of [{plan_code:'pro'},{role_key:'tenant_admin'},
                      {email:'other@invalid.test'},{user_id:FOREIGN},{tenant_id:FOREIGN}]){
    assert.equal((await call('/api/qa/profile',db,{method:'POST',body:{...valid,...extra}})).status,400);
  }
  assert.equal(db.state.writes.length,0);
  assert.equal((await call('/api/qa/profile',db,{method:'POST',body:valid,
    origin:'https://attacker.invalid'})).status,400);
  assert.equal((await call('/api/qa/profile',db,{method:'POST',body:{...valid,display_name:' '}})).status,400);
  assert.equal((await call('/api/qa/profile',db,{method:'POST',body:{...valid,bio:'x'.repeat(401)}})).status,400);
  assert.equal(db.state.writes.length,0);
});
test('R67 avatar accepts normalized small JPEG only and supports removal',async()=>{
  const db=mockDB(),good=syntheticJpeg();
  assert.equal((await call('/api/qa/profile/avatar',db,{method:'POST',
    body:{avatar_data:good}})).status,200);
  assert.equal(db.state.row.avatar_data,good);
  for(const bad of ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
                     'data:image/png;base64,AA==','data:image/jpeg;base64,AAAA',
                     'data:image/jpeg;base64,'+'A'.repeat(46000)]){
    assert.equal((await call('/api/qa/profile/avatar',db,{method:'POST',
      body:{avatar_data:bad}})).status,400);
  }
  assert.equal((await call('/api/qa/profile/avatar',db,{method:'POST',
    body:{avatar_data:'',plan_code:'pro'}})).status,400);
  assert.equal(db.state.row.avatar_data,good);
  assert.equal((await call('/api/qa/profile/avatar',db,{method:'POST',
    body:{avatar_data:''}})).status,200);
  assert.equal(db.state.row.avatar_data,'');
});
test('R67 all other endpoints and non-QA environments fail closed',async()=>{
  const db=mockDB();
  assert.equal((await call('/api/qa/profile/avatar',db)).status,404);
  assert.equal((await call('/api/qa/profile/nope',db)).status,404);
  const r=await accountApi(request('/api/qa/profile'),{...env(db),
    AI_LAW_CF_MODE:'production'},{now:1800000000});
  assert.equal(r.status,503);
});
