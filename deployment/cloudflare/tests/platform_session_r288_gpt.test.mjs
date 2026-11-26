import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {platformSessionApi,PLATFORM_SESSION_SQL} from '../src/platform_session_gpt.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const ID='11111111-1111-1111-1111-111111111111';
const TOKEN='a'.repeat(64), COOKIE='__Host-al_platform_session='+TOKEN;
const base='https://qa.example';
function fixture(actor={actor_id:'synthetic-admin'}){
  const queries=[],batches=[];
  const db={prepare(sql){queries.push(sql);return {bind(...args){return {first:async()=>{assert.equal(sql,PLATFORM_SESSION_SQL);assert.equal(args[0],ID);assert.match(args[1],/^[0-9a-f]{64}$/);assert.notEqual(args[1],TOKEN);return actor;}}},all:async()=>({success:true,results:[]})}},batch:async statements=>{batches.push(statements);return [{success:true,meta:{changes:1}},{success:true,meta:{changes:1}}]}};
  return {env:{AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:ID,DB:db},queries,batches};
}
const req=(path,headers={},method='GET',body)=>new Request(base+path,{method,headers,body});
test('ordinary tenant cookie and spoofed role cannot access platform',async()=>{const f=fixture();const r=await platformSessionApi(req('/api/platform/plans',{cookie:'al_qa_session='+ID,'x-role':'system_admin'}),f.env);assert.equal(r.status,401);assert.equal(f.queries.length,0);});
test('duplicate platform cookies fail before D1',async()=>{const f=fixture();assert.equal((await platformSessionApi(req('/api/platform/session',{cookie:COOKIE+'; '+COOKIE}),f.env)).status,401);assert.equal(f.queries.length,0);});
test('missing or revoked platform session cannot read metadata',async()=>{const f=fixture(null);assert.equal((await platformSessionApi(req('/api/platform/plans',{cookie:COOKIE}),f.env)).status,403);assert.deepEqual(f.queries,[PLATFORM_SESSION_SQL]);});
test('verified platform session returns derived CSRF, not raw session token',async()=>{const f=fixture();const r=await platformSessionApi(req('/api/platform/session',{cookie:COOKIE}),f.env);assert.equal(r.status,200);const b=await r.json();assert.equal(b.kind,'system_admin');assert.match(b.csrfToken,/^[0-9a-f]{64}$/);assert.notEqual(b.csrfToken,TOKEN);assert.equal(r.headers.get('cache-control'),'no-store');});
test('verified platform session can list plans without tenant tables',async()=>{const f=fixture();const r=await platformSessionApi(req('/api/platform/plans',{cookie:COOKIE}),f.env);assert.equal(r.status,200);assert.deepEqual(await r.json(),{items:[]});assert.equal(f.queries.length,2);assert.ok(f.queries.every(s=>!s.includes('qa_memberships')));});
test('mutation with forged CSRF is denied before service writes',async()=>{const f=fixture();const r=await platformSessionApi(req('/api/platform/services',{cookie:COOKIE,origin:base,'content-type':'application/json','x-csrf-token':'b'.repeat(64)},'POST',JSON.stringify({tenantId:'test',status:'active',reasonCode:'TEST'})),f.env);assert.equal(r.status,403);assert.equal(f.batches.length,0);assert.equal(f.queries.length,1);});
test('foreign origin and non-QA mode fail closed',async()=>{const f=fixture();const r=await platformSessionApi(req('/api/platform/services',{cookie:COOKIE,origin:'https://foreign.example','content-type':'application/json'},'POST','{}'),f.env);assert.equal(r.status,403);assert.equal(f.batches.length,0);assert.equal((await platformSessionApi(req('/api/platform/plans',{cookie:COOKIE}),{...f.env,AI_LAW_CF_MODE:'production'})).status,503);});
test('verified session and CSRF perform one audited service mutation',async()=>{const f=fixture();const session=await platformSessionApi(req('/api/platform/session',{cookie:COOKIE}),f.env);const {csrfToken}=await session.json();const r=await platformSessionApi(req('/api/platform/services',{cookie:COOKIE,origin:base,'content-type':'application/json','x-csrf-token':csrfToken},'POST',JSON.stringify({tenantId:'test',status:'active',reasonCode:'TEST'})),f.env);assert.equal(r.status,200);assert.deepEqual(await r.json(),{changed:true,tenantId:'test',status:'active'});assert.equal(f.batches.length,1);assert.equal(f.batches[0].length,2);});
