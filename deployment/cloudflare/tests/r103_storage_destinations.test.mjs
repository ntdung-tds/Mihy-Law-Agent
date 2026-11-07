import test from 'node:test';
import assert from 'node:assert/strict';
import {storageDestinationApi,assignedDestination,ASSIGNED_SQL} from '../src/qa_storage_destinations.mjs';
import {COOKIE_SESSION_SQL} from '../src/mobile_auth.mjs';
import {PERSONAL_OWNER_SQL} from '../src/oauth_drive.mjs';

const I='11111111-1111-4111-8111-111111111111';
const T='22222222-2222-4222-8222-222222222222';
const O='99999999-9999-4999-8999-999999999999';
const ADMIN='33333333-3333-4333-8333-333333333333';
const STAFF='44444444-4444-4444-8444-444444444444';
const NOW=1800000000,ORIGIN='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
function makeReq(path,body,opts={}){
 const method=body===undefined?'GET':'POST';
 const headers={'Origin':opts.origin||ORIGIN,'Sec-Fetch-Site':'same-origin'};
 if(opts.cookie!==false)headers.Cookie='al_qa_session=55555555-5555-4555-8555-555555555555';
 if(method==='POST')headers['Content-Type']='application/json';
 return new Request(ORIGIN+path,{method,headers,body:method==='POST'?JSON.stringify(body):undefined});
}
function fixture({user=ADMIN,role='tenant_admin',kind='organization',tenant=T,connected=true}={}){
 const folders=new Map(),grants=new Set();
 const dbLog=[];
 const person=[ADMIN,STAFF];
 const env={AI_LAW_CF_MODE:'isolated-qa-only',JWT_ISSUER:'https://issuer.qa.test',INSTALLATION_ID:I};
 let childN=0;
 const storageDrive={
  async createChildFolder(name){childN++;return {id:'qaFolder_'+String(childN).padStart(12,'0'),name};},
  async removeChildFolder(){},created:()=>childN
 };
 const key=(d,u,t=tenant)=>[t,d,u].join('|');
 env.DB={
  prepare(sql){return{bind(...args){dbLog.push({sql,args});
   const stmt={
    async first(){
     if(sql===COOKIE_SESSION_SQL)return connected?{user_id:user,tenant_id:tenant,role_key:role,kind,
      subject:'synthetic',email:'qa@example.test',expires_at:NOW+500}:null;
     if(sql===PERSONAL_OWNER_SQL)return kind==='personal'?{ok:1}:null;
     if(sql===ASSIGNED_SQL){
      const [,,destId,requestedUser]=args,d=folders.get(destId);
      return d&&d.tenant_id===tenant&&d.status==='active'&&grants.has(key(destId,requestedUser))?
       {destination_id:destId,folder_id:d.folder_id,label:d.label,provider:'google_drive',
        owner_kind:d.owner_kind}:null;
     }
     if(sql.includes('COUNT(*) AS n FROM qa_storage_destinations'))return {n:folders.size};
     if(sql.includes('SELECT destination_id FROM qa_storage_destinations')){
      const d=folders.get(args[2]);return d&&d.tenant_id===tenant&&d.owner_kind==='organization'?d:null;
     }
     if(sql.includes('SELECT 1 AS ok FROM qa_memberships'))return person.includes(args[2])?{ok:1}:null;
     return null;
    },
    async all(){
     if(sql.includes('FROM qa_storage_destinations d')){
      const isManage=sql.includes(' AS assigned');
      const visible=[...folders.values()].filter(x=>x.tenant_id===tenant&&x.status==='active'&&
       (isManage||grants.has(key(x.destination_id,user))));
      return {results:visible.map(d=>({...d,provider:'google_drive',created_by:ADMIN,
       assigned:grants.has(key(d.destination_id,user))?1:0}))};
     }
     if(sql.includes('FROM qa_memberships m JOIN qa_principals')){
      return {results:person.map((id,i)=>({user_id:id,role_key:i?'lawyer':'tenant_admin',email:'qa'+i+'@example.test'}))};
     }
     return {results:[]};
    },
    async run(){
     if(sql.startsWith('INSERT INTO qa_storage_destinations')){
      const [installation_id,tenant_id,destination_id,folder_id,label,owner_kind,created_by,created_at]=args;
      folders.set(destination_id,{installation_id,tenant_id,destination_id,folder_id,label,owner_kind,
       status:'active',created_by,created_at});return {success:true,meta:{changes:1}};
     }
     if(sql.startsWith('INSERT INTO qa_storage_assignments')){
      grants.add(key(args[2],args[3]));return {success:true,meta:{changes:1}};
     }
     if(sql.startsWith('DELETE FROM qa_storage_assignments')){
      grants.delete(key(args[2],args[3]));return {success:true,meta:{changes:1}};
     }
     return {success:true,meta:{changes:1}};
    }
   };return stmt;
  }};},
  async batch(actions){const results=[];for(const a of actions)results.push(await a.run());return results;}
 };
 return {env,storageDrive,folders,grants,dbLog,key};
}
async function api(f,path,body,opts){
 const r=await storageDestinationApi(makeReq(path,body,opts),f.env,{now:NOW,storageDrive:f.storageDrive});
 return {status:r.status,json:await r.json()};
}

test('R103 no implicit Google root: empty organization destinations until admin explicitly creates folder',async()=>{
 const f=fixture();
 const empty=await api(f,'/api/qa/storage/destinations');
 assert.equal(empty.status,200);
 assert.deepEqual(empty.json.destinations,[]);
 assert.equal(empty.json.providers.onedrive,false,'do not advertise unconfigured OneDrive');
 const invalid=await api(f,'/api/qa/storage/destinations',{name:'../bad'});
 assert.equal(invalid.status,400);
 assert.equal(f.storageDrive.created(),0);
 const created=await api(f,'/api/qa/storage/destinations',{name:'Hồ sơ luật sư A'});
 assert.equal(created.status,201,JSON.stringify(created.json));
 const dest=created.json.destination;
 assert.match(dest.id,/^[0-9a-f-]{36}$/);
 assert.equal(dest.assigned,true);
 assert.equal(f.storageDrive.created(),1);
 assert.equal(f.folders.get(dest.id)?.tenant_id,T);
 assert.equal((await api(f,'/api/qa/storage/destinations')).json.destinations.length,1);
 assert.equal((await api(f,'/api/qa/storage/members')).json.members.length,2);
});
test('R103 grants are explicit; revoking member prevents selecting same folder',async()=>{
 const f=fixture();
 const created=await api(f,'/api/qa/storage/destinations',{name:'Hồ sơ nhóm A'});
 const id=created.json.destination.id;
 const before=await assignedDestination(f.env,{tenant_id:T,user_id:STAFF},id);
 assert.equal(before,null,'not assigned to everyone');
 const allow=await api(f,'/api/qa/storage/assignments',{destination_id:id,user_id:STAFF,enabled:true});
 assert.equal(allow.status,200);
 assert.equal((await assignedDestination(f.env,{tenant_id:T,user_id:STAFF},id))?.folder_id,
  f.folders.get(id).folder_id);
 const stop=await api(f,'/api/qa/storage/assignments',{destination_id:id,user_id:STAFF,enabled:false});
 assert.equal(stop.status,200);
 assert.equal(await assignedDestination(f.env,{tenant_id:T,user_id:STAFF},id),null);
});
test('R103 organization lawyer cannot create folders, list staff or assign rights',async()=>{
 const f=fixture({role:'lawyer',user:STAFF});
 assert.equal((await api(f,'/api/qa/storage/destinations',{name:'No access'})).status,404);
 assert.equal((await api(f,'/api/qa/storage/members')).status,404);
 assert.equal((await api(f,'/api/qa/storage/assignments',
  {destination_id:'55555555-5555-4555-8555-555555555555',user_id:ADMIN,enabled:true})).status,404);
 assert.equal(f.storageDrive.created(),0);
 assert.equal((await api(f,'/api/qa/storage/destinations')).status,200);
});
test('R103 QA CSRF, anonymous, and invalid cross-tenant member cannot mutate folder grants',async()=>{
 const f=fixture();
 const item=(await api(f,'/api/qa/storage/destinations',{name:'Hồ sơ riêng'})).json.destination.id;
 assert.equal((await api(f,'/api/qa/storage/assignments',
  {destination_id:item,user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',enabled:true})).status,404);
 assert.equal((await api(f,'/api/qa/storage/assignments',
  {destination_id:item,user_id:STAFF,enabled:true},{origin:'https://evil.invalid'})).status,403);
 const noSession=fixture({connected:false});
 assert.equal((await api(noSession,'/api/qa/storage/destinations')).status,401);
 assert.equal((await api(f,'/api/qa/storage/destinations',{provider:'onedrive',name:'No'})).status,400);
});
test('R103 sole personal owner can create their own storage folder while organization lawyer cannot',async()=>{
 const f=fixture({role:'lawyer',user:STAFF,kind:'personal',tenant:O});
 const r=await api(f,'/api/qa/storage/destinations',{name:'Tài liệu của tôi'});
 assert.equal(r.status,201,JSON.stringify(r.json));
 assert.equal(r.json.destination.kind,'personal');
 assert.equal(f.folders.get(r.json.destination.id).tenant_id,O);
});
