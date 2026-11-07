import test from 'node:test';
import assert from 'node:assert/strict';
import {oauthDriveApi,tenantDriveAdapter,ready,CHECK_SESSION_SQL,PERSONAL_OWNER_SQL} from '../src/oauth_drive.mjs';
import {COOKIE_SESSION_SQL} from '../src/mobile_auth.mjs';
const I='11111111-1111-4111-8111-111111111111';
const T='22222222-2222-4222-8222-222222222222';
const U='33333333-3333-4333-8333-333333333333';
const SID='44444444-4444-4444-8444-444444444444';
const ROOT='qaDriveFolder_123456789';
const BASE='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const now=1800000000;
function fixture({role='tenant_admin',active=true,configured=true,tokenDenied=false,driveDenied=false,
 personal=false,personalMembers=1}={}){
 const statements=[];const pending=new Map(),connections=new Map(),calls=[];
 const env={AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:I,JWT_ISSUER:'https://issuer.qa.test',
  ...(configured?{GOOGLE_OAUTH_CLIENT_ID:'12345-demo.apps.googleusercontent.com',
   GOOGLE_OAUTH_CLIENT_SECRET:'synthetic-app-secret',QA_DRIVE_TOKEN_KEY:'a'.repeat(64)}:{})};
 env.DB={async batch(actions){const result=[];for(const a of actions)result.push({...await a.run(),success:true});return result;},
  prepare(sql){return {bind(...params){statements.push({sql,params});return {
  async first(){
   if(sql===COOKIE_SESSION_SQL)return active?{sid:SID,user_id:U,tenant_id:T,role_key:role,
     subject:'synthetic',expires_at:now+600}:null;
   if(sql===CHECK_SESSION_SQL)return active?{user_id:U,tenant_id:T,role_key:role}:null;
   if(sql===PERSONAL_OWNER_SQL){
    assert.deepEqual(params,[I,T,U]);
    return active&&personal&&role==='lawyer'&&personalMembers===1?{ok:1}:null;
   }
   if(sql.startsWith('SELECT tenant_id,user_id,sid_cipher'))return pending.get(params[1])||null;
   if(sql.startsWith('SELECT root_id FROM qa_drive_connections'))return connections.get(params[1])||null;
   if(sql.startsWith('SELECT connected_at FROM qa_drive_connections'))return connections.get(params[1])||null;
   if(sql.startsWith('SELECT encrypted_refresh,root_id FROM qa_drive_connections'))return connections.get(params[1])||null;
   if(sql.startsWith('SELECT encrypted_refresh,connected_by,scope FROM qa_drive_connections')){const v=connections.get(params[1]);return v?{...v}:null;}
   if(sql.startsWith('SELECT connected_by,scope FROM qa_drive_connections'))return connections.get(params[1])||null;
   return null;
  },
  async run(){
   if(sql.startsWith('INSERT INTO qa_drive_oauth_pending')){
    pending.set(params[1],{tenant_id:params[2],user_id:params[3],sid_cipher:params[4],
     verifier_cipher:params[5],expires_at:params[7],used_at:null});
    return {meta:{changes:1}};
   }
   if(sql.startsWith('UPDATE qa_drive_oauth_pending')){
    const x=pending.get(params[2]);
    if(!x||x.used_at!==null||x.expires_at<=params[3])return {meta:{changes:0}};
    x.used_at=params[0];return {meta:{changes:1}};
   }
   if(sql.startsWith('INSERT INTO qa_drive_connections')){
    connections.set(params[1],{encrypted_refresh:params[2],root_id:params[3],
     scope:params[4],connected_by:params[5],connected_at:params[6]});
    return {meta:{changes:1}};
   }
   if(sql.startsWith('DELETE FROM qa_drive_connections')){
    const present=connections.delete(params[1]);return {meta:{changes:present?1:0}};
   }
   if(sql.startsWith('DELETE FROM qa_drive_oauth_pending')){
    let count=0;
    for(const [key,item] of pending)if(item.tenant_id===params[1]){
     pending.delete(key);count++;
    }
    return {meta:{changes:count}};
   }
   throw Error('unhandled SQL '+sql);
  }
 };}};}};
 async function googleFetch(url,options={}){
  calls.push({url,method:options.method});
  if(url==='https://oauth2.googleapis.com/token'){
   if(tokenDenied)return Response.json({error:'invalid_grant'},{status:400});
   const body=new URLSearchParams(options.body);
   const grant=body.get('grant_type');
   assert.equal(body.get('client_secret'),'synthetic-app-secret');
   if(grant==='authorization_code'){
    assert.match(body.get('code_verifier')||'',/^[A-Za-z0-9_-]{43}$/);
    return Response.json({access_token:'synthetic-access-token-1234567',
     token_type:'Bearer',refresh_token:'synthetic-refresh-token-1234567',scope:'https://www.googleapis.com/auth/drive.file'});
   }
   if(grant==='refresh_token'){
    assert.equal(body.get('refresh_token'),'synthetic-refresh-token-1234567');
    return Response.json({access_token:'synthetic-refreshed-token-1234567',token_type:'Bearer'});
   }
  }
  if(url.startsWith('https://www.googleapis.com/drive/v3/files?')){
   assert.equal(options.method,'POST');
   if(driveDenied)return Response.json({error:{code:403}},{status:403});
   return Response.json({id:ROOT,mimeType:'application/vnd.google-apps.folder',trashed:false});
  }
  if(url.startsWith('https://www.googleapis.com/drive/v3/files/'+ROOT)){
   return Response.json({id:ROOT,mimeType:'application/vnd.google-apps.folder',trashed:false});
  }
  throw Error('Unexpected remote URL');
 }
 const opts={now,googleFetch};
 return {env,statements,pending,connections,calls,opts};
}
function req(path,method='GET',{cookie=true,origin=BASE}={}){
 const headers={};
 if(cookie)headers.Cookie='al_qa_session='+SID;
 if(method==='POST'){headers.Origin=origin;headers['Sec-Fetch-Site']='same-origin';}
 return new Request(BASE+path,{method,headers});
}
test('deny OAuth before configured and require role + same origin',async()=>{
 let x=fixture({configured:false});assert.equal(ready(x.env),false);
 assert.equal((await oauthDriveApi(req('/api/qa/drive/connect','POST'),x.env,x.opts)).status,503);
 const status=await oauthDriveApi(req('/api/qa/drive/status'),x.env,x.opts);
 assert.equal(status.status,200);
 assert.deepEqual(await status.json(),{connected:false,can_connect:true,configuration_ready:false,connected_at:null});
 x=fixture({active:false});
 assert.equal((await oauthDriveApi(req('/api/qa/drive/status'),x.env,x.opts)).status,401);
 assert.equal((await oauthDriveApi(req('/api/qa/drive/connect','POST'),x.env,x.opts)).status,401);
 x=fixture({role:'lawyer'});
 assert.equal((await oauthDriveApi(req('/api/qa/drive/connect','POST'),x.env,x.opts)).status,403);
 x=fixture();
 assert.equal((await oauthDriveApi(req('/api/qa/drive/connect','POST',{origin:'https://evil.invalid'}),x.env,x.opts)).status,403);
 assert.equal(x.pending.size,0);
});
test('full PKCE state consent, callback sans strict cookie, tenant-root refresh, replay deny',async()=>{
 const x=fixture();
 assert.equal(ready(x.env),true);
 const started=await oauthDriveApi(req('/api/qa/drive/connect','POST'),x.env,x.opts);
 assert.equal(started.status,200);
 const {authorization_url}=await started.json();
 const url=new URL(authorization_url);
 assert.equal(url.origin,'https://accounts.google.com');
 assert.equal(url.searchParams.get('scope'),'https://www.googleapis.com/auth/drive.file');
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.equal(url.searchParams.get('redirect_uri'),BASE+'/api/qa/drive/callback');
 assert.equal(x.pending.size,1);
 const pending=[...x.pending.values()][0];
 assert.notEqual(pending.sid_cipher,SID);
 assert.equal(pending.sid_cipher.includes(SID),false);
 const callback=req('/api/qa/drive/callback?state='+url.searchParams.get('state')+'&code=qa-synthetic-code',
  'GET',{cookie:false});
 const completed=await oauthDriveApi(callback,x.env,x.opts);
 assert.equal(completed.status,303);
 assert.equal(completed.headers.get('Location'),'https://ai-law-web-qa.iaict-platform.workers.dev/drive-return?drive=connected');
 assert.equal(x.connections.size,1);
 const record=x.connections.get(T);
 assert.equal(record.root_id,ROOT);
 assert.ok(!record.encrypted_refresh.includes('synthetic-refresh-token'));
 const status=await oauthDriveApi(req('/api/qa/drive/status'),x.env,x.opts);
 assert.deepEqual((await status.json()).connected,true);
 const adapter=await tenantDriveAdapter(x.env,{tenant_id:T},x.opts);
 assert.equal(adapter.rootId,ROOT);
 assert.equal(adapter.accessToken,'synthetic-refreshed-token-1234567');
 assert.equal((await oauthDriveApi(callback,x.env,x.opts)).status,303);
});
test('revoked session blocks callback and token endpoint is never invoked',async()=>{
 const x=fixture();const r=await oauthDriveApi(req('/api/qa/drive/connect','POST'),x.env,x.opts);
 const url=new URL((await r.json()).authorization_url);
 const startCalls=x.calls.length;
 // Revoke after initiating consent, before callback.
 x.env.DB.prepare=(()=>{const original=x.env.DB.prepare.bind(x.env.DB);
  return sql=>sql===CHECK_SESSION_SQL?{bind:()=>({first:async()=>null})}:original(sql);
 })();
 const done=await oauthDriveApi(req('/api/qa/drive/callback?state='+url.searchParams.get('state')+'&code=synthetic-code','GET',{cookie:false}),x.env,x.opts);
 assert.equal(done.status,303);
 assert.equal(done.headers.get('Location'),'https://ai-law-web-qa.iaict-platform.workers.dev/drive-return?drive=failed&issue=session');
 assert.equal(x.calls.length,startCalls);
});
test('Google denied token exchange leaves no connection and consumes state',async()=>{
 const x=fixture({tokenDenied:true});
 const r=await oauthDriveApi(req('/api/qa/drive/connect','POST'),x.env,x.opts);
 const url=new URL((await r.json()).authorization_url);
 const callback=req('/api/qa/drive/callback?state='+url.searchParams.get('state')+'&code=test-code','GET',{cookie:false});
 const rejected=await oauthDriveApi(callback,x.env,x.opts);
 assert.equal(rejected.status,303);
 assert.equal(rejected.headers.get('Location'),
  'https://ai-law-web-qa.iaict-platform.workers.dev/drive-return?drive=failed&issue=provider');
 assert.equal(x.connections.size,0);
 assert.equal((await oauthDriveApi(callback,x.env,x.opts)).status,303);
});

test('sole active member of personal workspace may connect their own Drive',async()=>{
 const x=fixture({role:'lawyer',personal:true});
 const status=await oauthDriveApi(req('/api/qa/drive/status'),x.env,x.opts);
 assert.equal(status.status,200);
 assert.equal((await status.json()).can_connect,true);
 const start=await oauthDriveApi(req('/api/qa/drive/connect','POST'),x.env,x.opts);
 assert.equal(start.status,200);
 const u=new URL((await start.json()).authorization_url);
 assert.equal(u.origin,'https://accounts.google.com');
 assert.equal(u.searchParams.get('scope'),'https://www.googleapis.com/auth/drive.file');
 const callback=req('/api/qa/drive/callback?state='+u.searchParams.get('state')+'&code=synthetic-code',
  'GET',{cookie:false});
 const completed=await oauthDriveApi(callback,x.env,x.opts);
 assert.equal(completed.status,303);
 assert.equal(completed.headers.get('Location'),
  'https://ai-law-web-qa.iaict-platform.workers.dev/drive-return?drive=connected');
 assert.equal(x.connections.get(T)?.root_id,ROOT);
 assert.equal(x.statements.filter(s=>s.sql===PERSONAL_OWNER_SQL).length>=4,true);
});
test('organization lawyers and shared personal memberships cannot connect',async()=>{
 for(const options of [
  {role:'lawyer',personal:false},
  {role:'lawyer',personal:true,personalMembers:2}
 ]){
  const x=fixture(options);
  const status=await oauthDriveApi(req('/api/qa/drive/status'),x.env,x.opts);
  assert.equal((await status.json()).can_connect,false);
  const start=await oauthDriveApi(req('/api/qa/drive/connect','POST'),x.env,x.opts);
  assert.equal(start.status,403);
  assert.equal(x.pending.size,0);
  assert.equal(x.calls.length,0);
 }
});
test('personal owner loses sole membership during consent and callback fails closed',async()=>{
 const x=fixture({role:'lawyer',personal:true});
 const start=await oauthDriveApi(req('/api/qa/drive/connect','POST'),x.env,x.opts);
 const url=new URL((await start.json()).authorization_url);
 const prior=x.calls.length;
 const original=x.env.DB.prepare;
 x.env.DB.prepare=sql=>sql===PERSONAL_OWNER_SQL?
  {bind:()=>({first:async()=>null})}:original(sql);
 const completed=await oauthDriveApi(req('/api/qa/drive/callback?state='+
  url.searchParams.get('state')+'&code=synthetic-code','GET',{cookie:false}),x.env,x.opts);
 assert.equal(completed.status,303);
 assert.match(completed.headers.get('Location'),/drive=failed/);
 assert.equal(x.connections.size,0);
 assert.equal(x.calls.length,prior);
});

test('Google consent may succeed while Drive API denies root creation; no grant is stored',async()=>{
 const x=fixture({driveDenied:true});
 const started=await oauthDriveApi(req('/api/qa/drive/connect','POST'),x.env,x.opts);
 assert.equal(started.status,200);
 const state=new URL((await started.json()).authorization_url).searchParams.get('state');
 const callback=req('/api/qa/drive/callback?state='+state+'&code=synthetic-test-code','GET',{cookie:false});
 const response=await oauthDriveApi(callback,x.env,x.opts);
 assert.equal(response.status,303);
 assert.equal(response.headers.get('Location'),
  'https://ai-law-web-qa.iaict-platform.workers.dev/drive-return?drive=failed&issue=drive');
 assert.equal(x.connections.size,0);
});

test('R80 organization admin disconnect deletes only tenant credential and pending consent',async()=>{
 const x=fixture();
 const start=await oauthDriveApi(req('/api/qa/drive/connect','POST'),x.env,x.opts);
 const state=new URL((await start.json()).authorization_url).searchParams.get('state');
 const callback=req('/api/qa/drive/callback?state='+state+'&code=synthetic','GET',{cookie:false});
 assert.equal((await oauthDriveApi(callback,x.env,x.opts)).status,303);
 assert.equal(x.connections.size,1);
 // A second, pending OAuth request is canceled on disconnect.
 const second=await oauthDriveApi(req('/api/qa/drive/connect','POST'),x.env,x.opts);
 const pending=new URL((await second.json()).authorization_url).searchParams.get('state');
 x.connections.set('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',{encrypted_refresh:'other-tenant-secret',root_id:'other-root1234'});
 x.pending.set('other-state',{tenant_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',used_at:null});
 const beforeRemote=x.calls.length;
 const res=await oauthDriveApi(req('/api/qa/drive/disconnect','POST'),x.env,x.opts);
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{connected:false,disconnected:true,files_preserved:true});
 assert.equal(x.connections.has(T),false);
 assert.equal(x.connections.has('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),true);
 assert.equal(x.pending.size,1,'only other tenant OAuth remains');
 assert.equal(x.calls.length,beforeRemote,'local disconnect does not revoke other tenants Google access');
 assert.equal((await (await oauthDriveApi(req('/api/qa/drive/status'),x.env,x.opts)).json()).connected,false);
 await assert.rejects(()=>tenantDriveAdapter(x.env,{tenant_id:T},x.opts),/No tenant grant/);
 const late=await oauthDriveApi(req('/api/qa/drive/callback?state='+pending+'&code=late-consent','GET',{cookie:false}),x.env,x.opts);
 assert.match(late.headers.get('Location'),/drive=failed/);
 assert.equal(x.calls.length,beforeRemote,'late callback never exchanges a token');
 // Safe and idempotent local disconnect.
 assert.equal((await oauthDriveApi(req('/api/qa/drive/disconnect','POST'),x.env,x.opts)).status,200);
});
test('R80 deny anonymous, CSRF and organization lawyer, with no credential deleted',async()=>{
 const x=fixture({role:'lawyer'});
 x.connections.set(T,{encrypted_refresh:'nonempty-secret',root_id:ROOT});
 assert.equal((await oauthDriveApi(req('/api/qa/drive/disconnect','POST'),x.env,x.opts)).status,403);
 assert.equal((await oauthDriveApi(req('/api/qa/drive/disconnect','POST',{origin:'https://evil.invalid'}),x.env,x.opts)).status,403);
 assert.equal((await oauthDriveApi(req('/api/qa/drive/disconnect'),x.env,x.opts)).status,405);
 assert.equal(x.connections.has(T),true);
 const anon=fixture({active:false});
 assert.equal((await oauthDriveApi(req('/api/qa/drive/disconnect','POST'),anon.env,anon.opts)).status,401);
});
test('R80 sole personal owner can disconnect while shared personal tenant cannot',async()=>{
 const owner=fixture({role:'lawyer',personal:true});
 owner.connections.set(T,{encrypted_refresh:'local-only-test',root_id:ROOT});
 const ok=await oauthDriveApi(req('/api/qa/drive/disconnect','POST'),owner.env,owner.opts);
 assert.equal(ok.status,200);
 assert.equal(owner.connections.size,0);
 const shared=fixture({role:'lawyer',personal:true,personalMembers:2});
 shared.connections.set(T,{encrypted_refresh:'still-present',root_id:ROOT});
 assert.equal((await oauthDriveApi(req('/api/qa/drive/disconnect','POST'),shared.env,shared.opts)).status,403);
 assert.equal(shared.connections.size,1);
});
test('R80 local disconnect works when OAuth app secrets are unavailable; never needs Google token',async()=>{
 const x=fixture({configured:false});
 x.connections.set(T,{encrypted_refresh:'encrypted-stored-secret',root_id:ROOT});
 const res=await oauthDriveApi(req('/api/qa/drive/disconnect','POST'),x.env,x.opts);
 assert.equal(res.status,200);
 assert.equal(x.connections.size,0);
 assert.equal(x.calls.length,0);
});

test('R107 connected Google owner gets only a short-lived access token without another consent',async()=>{
 const x=fixture();
 const started=await oauthDriveApi(req('/api/qa/drive/connect','POST'),x.env,x.opts);
 const u=new URL((await started.json()).authorization_url);
 const connected=await oauthDriveApi(req('/api/qa/drive/callback?state='+u.searchParams.get('state')+'&code=synthetic-code','GET',{cookie:false}),x.env,x.opts);
 assert.equal(connected.status,303);
 const prior=x.calls.filter(z=>z.url==='https://oauth2.googleapis.com/token').length;
 const response=await oauthDriveApi(req('/api/qa/drive/browser-access','POST'),x.env,x.opts);
 assert.equal(response.status,200,await response.clone().text());
 const d=await response.json();
 assert.equal(d.access_token,'synthetic-refreshed-token-1234567');
 assert.equal(d.scope,'https://www.googleapis.com/auth/drive.file');
 assert.ok(d.expires_in>=120&&d.expires_in<=3600);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.equal(JSON.stringify(d).includes('refresh_token'),false);
 assert.equal(JSON.stringify(d).includes('encrypted_refresh'),false);
 assert.equal(x.calls.filter(z=>z.url==='https://oauth2.googleapis.com/token').length,prior+1,
  'refresh existing server grant; never repeat Google user consent');
});
test('R107 rejects cross-origin, missing login, another employee and replaced Google owner',async()=>{
 const x=fixture();
 const started=await oauthDriveApi(req('/api/qa/drive/connect','POST'),x.env,x.opts);
 const u=new URL((await started.json()).authorization_url);
 await oauthDriveApi(req('/api/qa/drive/callback?state='+u.searchParams.get('state')+'&code=synthetic-code','GET',{cookie:false}),x.env,x.opts);
 const path='/api/qa/drive/browser-access';
 const deniedOrigin=await oauthDriveApi(req(path,'POST',{origin:'https://attacker.invalid'}),x.env,x.opts);
 assert.equal(deniedOrigin.status,403);
 const deniedSession=await oauthDriveApi(req(path,'POST',{cookie:false}),x.env,x.opts);
 assert.equal(deniedSession.status,401);
 const deniedVerb=await oauthDriveApi(req(path,'GET'),x.env,x.opts);
 assert.equal(deniedVerb.status,405);
 const callsBefore=x.calls.length;
 x.connections.get(T).connected_by='66666666-6666-4666-8666-666666666666';
 const mismatch=await oauthDriveApi(req(path,'POST'),x.env,x.opts);
 assert.equal(mismatch.status,403);
 assert.equal(x.calls.length,callsBefore,'never refresh the admin token for an unrelated user');
 assert.doesNotMatch(await mismatch.text(),/synthetic-refreshed-token|synthetic-refresh-token/);
});

test('R107 blocks stale Google token if connected owner switches accounts while refresh is in flight',async()=>{
 const x=fixture();
 const started=await oauthDriveApi(req('/api/qa/drive/connect','POST'),x.env,x.opts);
 const u=new URL((await started.json()).authorization_url);
 await oauthDriveApi(req('/api/qa/drive/callback?state='+u.searchParams.get('state')+'&code=synthetic-code','GET',{cookie:false}),x.env,x.opts);
 const original=x.opts.googleFetch;
 x.opts.googleFetch=async(url,init)=>{
  const response=await original(url,init);
  if(url==='https://oauth2.googleapis.com/token'&&String(init.body).includes('grant_type=refresh_token')){
   x.connections.get(T).encrypted_refresh='synthetic-rotated-encrypted-grant';
  }
  return response;
 };
 const res=await oauthDriveApi(req('/api/qa/drive/browser-access','POST'),x.env,x.opts);
 assert.equal(res.status,403,'revocation or reconnect during refresh must not mint a token for stale Google account');
 assert.doesNotMatch(await res.text(),/synthetic-refreshed-token/);
});
