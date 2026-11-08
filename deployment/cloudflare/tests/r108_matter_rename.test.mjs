import test from 'node:test';
import assert from 'node:assert/strict';
import {matterApi,MATTER_EDIT_SQL,MATTER_RENAME_SQL,WRITE_ACL_SQL} from '../src/matter_workspace.mjs';
const I='11111111-1111-4111-8111-111111111111';
const U='22222222-2222-4222-8222-222222222222';
const T='33333333-3333-4333-8333-333333333333';
const M='44444444-4444-4444-8444-444444444444';
const BASE='https://ai-law-standalone-cf-qa.iaict-platform.workers.dev';
const NOW=1800000000;
const PATH='/api/qa/matters/'+M;
function fixture({active=true,editable=true,version=1,writeSucceeded=true,role='lawyer'}={}){
 let updated=false;
 const queries=[];
 const env={AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:I,
  DB:{prepare(sql){return{bind(...params){queries.push({sql,params});return{
    async first(){
     if(sql.includes('FROM qa_sessions s'))return active?{user_id:U,tenant_id:T,role_key:role}:null;
     if(sql===MATTER_EDIT_SQL)return editable?{title:'Synthetic old title',version}:null;
      if(sql.includes('SELECT title,version,updated_by,updated_at FROM qa_matter_catalog'))
       return updated?{title:'Synthetic new title',version:version+1,updated_by:U,updated_at:NOW}:null;
     return null;
    },
    async run(){if(sql===MATTER_RENAME_SQL&&writeSucceeded)updated=true;
      return {meta:{changes:updated?2:0}};},
    async all(){return {results:[]};}
   };}};}}};
 return {env,queries};
}
function request({method='PATCH',title='Synthetic new title',version=1,origin=BASE,cookie=true,extra=null}={}){
 const headers={'Content-Type':'application/json',Origin:origin,'Sec-Fetch-Site':'same-origin'};
 if(cookie)headers.Cookie='al_qa_session='+M;
 const body=extra??{title,expected_version:version};
 return new Request(BASE+PATH,{method,headers,body:method==='PATCH'?JSON.stringify(body):undefined});
}
test('R108 rename respects the current writer ACL and increments optimistic version',async()=>{
 const f=fixture();
 const r=await matterApi(request(),f.env,{now:NOW});
 assert.equal(r.status,200,await r.clone().text());
 assert.deepEqual(await r.json(),{id:M,title:'Synthetic new title',version:2});
 const read=f.queries.find(q=>q.sql===MATTER_EDIT_SQL);
 assert.deepEqual(read.params,[I,T,M,U,NOW,NOW,U,NOW,NOW]);
 const write=f.queries.find(q=>q.sql===MATTER_RENAME_SQL);
 assert.deepEqual(write.params,['Synthetic new title',U,NOW,I,T,M,1,U,NOW,NOW,U,NOW,NOW]);
 assert.match(MATTER_RENAME_SQL,/version=version\+1/);
 assert.match(MATTER_RENAME_SQL,/c\.tenant_id=\?/);
 assert.match(WRITE_ACL_SQL,/effect='deny'/);
 assert.match(WRITE_ACL_SQL,/w\.acl_version=m\.acl_version/);
});
test('R108 rejects missing sessions, CSRF, invalid names, extra keys and wrong verbs',async()=>{
 assert.equal((await matterApi(request({cookie:false}),fixture({active:false}).env,{now:NOW})).status,401);
 assert.equal((await matterApi(request({origin:'https://evil.example'}),fixture().env,{now:NOW})).status,400);
 assert.equal((await matterApi(request({method:'DELETE'}),fixture().env,{now:NOW})).status,405);
 for(const title of ['', 'xx', 'A'.repeat(101),'a\nb','<script>bad</script>']){
  const r=await matterApi(request({title}),fixture().env,{now:NOW});
  assert.equal(r.status,400,title);
 }
 for(const bad of [{title:'Safe title',expected_version:0},
                   {title:'Safe title',expected_version:1,tenant_id:T},
                   {title:'Safe title',expected_version:'1'}]){
  const r=await matterApi(request({extra:bad}),fixture().env,{now:NOW});
  assert.equal(r.status,400,JSON.stringify(bad));
 }
});
test('R108 denies unauthorized, stale, concurrent, and incompatible callers',async()=>{
 assert.equal((await matterApi(request(),fixture({editable:false}).env,{now:NOW})).status,404);
 assert.equal((await matterApi(request({version:1}),fixture({version:2}).env,{now:NOW})).status,409);
 assert.equal((await matterApi(request(),fixture({writeSucceeded:false}).env,{now:NOW})).status,409);
 assert.equal((await matterApi(request(),fixture({role:'viewer'}).env,{now:NOW})).status,403);
});
test('R108 unchanged title never emits an event or mutates version',async()=>{
 const f=fixture();
 const r=await matterApi(request({title:'Synthetic old title'}),f.env,{now:NOW});
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{id:M,title:'Synthetic old title',version:1,unchanged:true});
 assert.equal(f.queries.some(q=>q.sql===MATTER_RENAME_SQL),false);
});
