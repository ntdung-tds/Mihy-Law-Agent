import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileApi,COOKIE_SESSION_SQL} from '../src/mobile_auth.mjs';

const INSTALL='a1a1a1a1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SID='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PERSONAL='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FOREIGN='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER='40404040-0000-4000-8000-000000000002';
const ISSUER='https://idp.example.invalid',SUBJECT='qa02-synthetic-dual';
const NOW=1800000000,ORIGIN='https://qa.example.invalid';
function fake({disabled=false,revokedPersonal=false,expired=false}={}){
  const membership=[
    {tenant_id:ORG,role_key:'lawyer',kind:'organization',status:'active'},
    {tenant_id:PERSONAL,role_key:'lawyer',kind:'personal',status:revokedPersonal?'revoked':'active'}
  ];
  const state={sid:SID,tenant_id:ORG,exp:expired?NOW-1:NOW+300,subject:SUBJECT,revoked:false};
  const statements=[];
  const db={state,statements,
    prepare(sql){return {bind(...params){statements.push({sql,params});return {
      async first(){
        if(sql!==COOKIE_SESSION_SQL)throw Error('Unhandled SQL first: '+sql.slice(0,90));
        if(disabled||state.revoked||state.sid!==params[1]||params[2]!==ISSUER||state.exp<=params[3])return null;
        const active=membership.find(m=>m.tenant_id===state.tenant_id&&m.status==='active');
        return active?{user_id:USER,tenant_id:state.tenant_id,subject:state.subject,expires_at:state.exp,
          email:'qa02.dual@ai-law.invalid',role_key:active.role_key,kind:active.kind}:null;
      },
      async all(){
        if(!sql.includes('FROM qa_memberships m')||!sql.includes('ORDER BY t.kind'))throw Error('Unhandled SQL all');
        return {results:membership.filter(m=>m.status==='active')};
      },
      async run(){
        if(!sql.startsWith('UPDATE qa_sessions SET sid=?,tenant_id=?'))throw Error('Unhandled UPDATE');
        const [newSid,target,install,oldSid,issuer,subject,user,source,at,install2,target2,user2]=params;
        const targetMembership=membership.find(m=>m.tenant_id===target&&m.status==='active');
        if(disabled||state.revoked||state.sid!==oldSid||state.tenant_id!==source||at>=state.exp||
          install!==INSTALL||install2!==INSTALL||issuer!==ISSUER||subject!==state.subject||
          user!==USER||user2!==USER||target2!==target||!targetMembership)return {meta:{changes:0}};
        state.sid=newSid;state.tenant_id=target;return {meta:{changes:1}};
      }
    };}};}
  };
  return {db,env:{DB:db,AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:INSTALL,JWT_ISSUER:ISSUER}};
}
const call=(path,{method='GET',cookie=SID,body,origin=ORIGIN}={})=>new Request(ORIGIN+path,{
  method,headers:{...(cookie?{Cookie:'al_qa_session='+cookie}:{}),...(method==='POST'?{
    Origin:origin,'Content-Type':'application/json','Sec-Fetch-Site':'same-origin'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
});
test('R62: only active server-owned dual memberships are disclosed',async()=>{
  const f=fake();
  const r=await mobileApi(call('/api/qa/workspaces'),f.env,{now:NOW});
  assert.equal(r.status,200);
  const data=await r.json();
  assert.equal(data.current_tenant_id,ORG);
  assert.deepEqual(data.workspaces.map(w=>w.tenant_id),[ORG,PERSONAL]);
  assert.equal(data.workspaces.every(w=>w.role==='lawyer'),true);
  assert.equal((await mobileApi(call('/api/qa/workspaces',{cookie:null}),f.env,{now:NOW})).status,401);
  const revoked=fake({revokedPersonal:true});
  const only=await (await mobileApi(call('/api/qa/workspaces'),revoked.env,{now:NOW})).json();
  assert.deepEqual(only.workspaces.map(w=>w.tenant_id),[ORG]);
});
test('R62: switching an authorized tenant rotates HttpOnly cookie and invalidates the old SID',async()=>{
  const f=fake();
  const result=await mobileApi(call('/api/qa/switch-workspace',{
    method:'POST',body:{tenant_id:PERSONAL}}),f.env,{now:NOW});
  assert.equal(result.status,200);
  const cookie=result.headers.get('Set-Cookie');
  assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
  assert.match(cookie,/Max-Age=300/);
  const rotated=cookie.match(/al_qa_session=([0-9a-f-]{36})/)?.[1];
  assert.ok(rotated);assert.notEqual(rotated,SID);
  assert.equal((await mobileApi(call('/api/qa/session'),f.env,{now:NOW})).status,401,'old SID revoked');
  const user=await (await mobileApi(call('/api/qa/session',{cookie:rotated}),f.env,{now:NOW})).json();
  assert.equal(user.tenant_id,PERSONAL);assert.equal(user.workspace_type,'personal');
  assert.equal(f.db.statements.some(x=>x.sql.startsWith('UPDATE qa_sessions SET sid')),true);
});
test('R62: cross-tenant, revoked membership, expired session and disabled actor fail closed',async()=>{
  for(const [opts,target,expected] of [
    [{},FOREIGN,404],
    [{revokedPersonal:true},PERSONAL,404],
    [{expired:true},PERSONAL,401],
    [{disabled:true},PERSONAL,401]
  ]){
    const f=fake(opts);
    const r=await mobileApi(call('/api/qa/switch-workspace',{method:'POST',body:{tenant_id:target}}),f.env,{now:NOW});
    assert.equal(r.status,expected);
    assert.equal(f.db.state.sid,SID,'rejected operation must not alter session');
    assert.equal(r.headers.has('Set-Cookie'),false);
  }
});
test('R62: fail closed on missing cookie, invalid tenant, wrong origin and method',async()=>{
  const f=fake();
  assert.equal((await mobileApi(call('/api/qa/switch-workspace',{
    method:'POST',cookie:null,body:{tenant_id:PERSONAL}}),f.env,{now:NOW})).status,401);
  assert.equal((await mobileApi(call('/api/qa/switch-workspace',{
    method:'POST',body:{tenant_id:'other-user-tenant'}}),f.env,{now:NOW})).status,400);
  assert.equal((await mobileApi(call('/api/qa/switch-workspace',{
    method:'POST',origin:'https://attacker.invalid',body:{tenant_id:PERSONAL}}),f.env,{now:NOW})).status,400);
  assert.equal((await mobileApi(call('/api/qa/switch-workspace'),f.env,{now:NOW})).status,404);
  assert.equal((await mobileApi(call('/api/qa/workspaces',{
    method:'POST',body:{tenant_id:PERSONAL}}),f.env,{now:NOW})).status,404);
});
