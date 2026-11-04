import test from 'node:test';
import assert from 'node:assert/strict';
import {matterApi,MATTER_LIST_SQL} from '../src/matter_workspace.mjs';
const INSTALL='11111111-1111-4111-8111-111111111111';
const USER='22222222-2222-4222-8222-222222222222';
const TENANT='33333333-3333-4333-8333-333333333333';
const SID='44444444-4444-4444-8444-444444444444';
const BASE='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const now=1800000000;
function fixture({active=true,rows=[]}={}){
 const statements=[];
 const env={
  INSTALLATION_ID:INSTALL, AI_LAW_CF_MODE:'isolated-qa-only',
  DB:{
   prepare(sql){
    return {bind(...params){
      const item={sql,params};statements.push(item);
      return {
       async first(){
        if(sql.includes('FROM qa_sessions s'))return active?{user_id:USER,tenant_id:TENANT,role_key:'lawyer'}:null;
        if(sql.includes('COUNT(*)'))return {n:0};
        return null;
       },
       async all(){return {results:rows};},
       async run(){return {success:true}}
      };
    }};
   },
   async batch(items){assert.equal(items.length,5);return items.map(()=>({success:true}));}
  }
 };
 return {env,statements};
}
function request(path,{method='GET',body,origin=BASE,cookie=true}={}){
 const headers={};
 if(cookie)headers.Cookie='al_qa_session='+SID;
 if(method==='POST'){headers.Origin=origin;headers['Content-Type']='application/json';headers['Sec-Fetch-Site']='same-origin';}
 return new Request(BASE+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
}
test('anonymous + disabled account cannot see or create matters',async()=>{
 for(const f of [fixture(),fixture({active:false})]){
  const r=await matterApi(request('/api/qa/matters',{cookie:false}),f.env,{now});
  assert.equal(r.status,401);
 }
 assert.equal((await matterApi(request('/api/qa/matters'),fixture({active:false}).env,{now})).status,401);
});
test('real D1 list query is scoped to tenant and explicit allow-minus-deny ACL',async()=>{
 assert.match(MATTER_LIST_SQL,/c\.installation_id=\? AND c\.tenant_id=\?/);
 assert.match(MATTER_LIST_SQL,/AND NOT EXISTS/);
 assert.match(MATTER_LIST_SQL,/a\.acl_version=m\.acl_version/);
 const row={matter_id:'case-01',title:'Synthetic QA case',created_at:now};
 const f=fixture({rows:[row]});
 const r=await matterApi(request('/api/qa/matters'),f.env,{now});
 assert.equal(r.status,200);
 assert.deepEqual((await r.json()).matters,[{id:row.matter_id,title:row.title,created_at:now}]);
 const q=f.statements.find(x=>x.sql===MATTER_LIST_SQL);
 assert.deepEqual(q.params,[INSTALL,TENANT,USER,now,now,USER,now,now]);
});
test('creation checks CSRF and refuses empty, oversized and markup names',async()=>{
 const f=fixture();
 assert.equal((await matterApi(request('/api/qa/matters',{method:'POST',origin:'https://attacker.invalid',body:{title:'QA case'}}),f.env,{now})).status,400);
 for(const title of ['', 'x', 'A'.repeat(101),'<script>alert(1)</script>','x\nnewline']){
  const r=await matterApi(request('/api/qa/matters',{method:'POST',body:{title}}),f.env,{now});
  assert.equal(r.status,400,title);
 }
 assert.equal(f.statements.filter(x=>x.sql.startsWith('INSERT')).length,0);
});
test('successful POST persists matter, read/write grants and event in one D1 batch',async()=>{
 const f=fixture();
 const r=await matterApi(request('/api/qa/matters',{method:'POST',body:{title:'Synthetic QA dossier 46'}}),f.env,{now});
 assert.equal(r.status,201);
 const data=await r.json();
 assert.match(data.id,/^[0-9a-f-]{36}$/);
 assert.equal(data.title,'Synthetic QA dossier 46');
 const inserts=f.statements.filter(x=>x.sql.startsWith('INSERT'));
 assert.equal(inserts.length,5);
 assert.equal(inserts.filter(x=>x.sql.includes('qa_matter_acl')).length,2);
 assert.ok(inserts.some(x=>x.params.includes('read')&&x.params.includes('allow')));
 assert.ok(inserts.some(x=>x.params.includes('write')&&x.params.includes('allow')));
 assert.ok(inserts.some(x=>x.sql.includes('qa_matter_events')&&x.params.includes('created')));
});
test('fail closed on missing D1 and wrong HTTP method',async()=>{
 assert.equal((await matterApi(request('/api/qa/matters'),{}, {now})).status,503);
 assert.equal((await matterApi(new Request(BASE+'/api/qa/matters',{method:'DELETE',headers:{Cookie:'al_qa_session='+SID}}),fixture().env,{now})).status,405);
});
