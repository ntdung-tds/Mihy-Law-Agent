/** R126 real local Chromium fixture: original Cloudflare website + API Worker.
 * Isolated disposable Node 22 SQLite and synthetic principals only. Bound to
 * 127.0.0.1 TLS; no real Cloudflare D1, user credentials or remote endpoint.
 */
import {createServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {pbkdf2Sync} from 'node:crypto';
import {handleSite} from '../../../build/ai-law-web/site_worker.mjs';
import {handle} from '../src/worker.mjs';

const I='11111111-1111-4111-8111-111111111111';
const A='22222222-2222-4222-8222-222222222222';
const B='33333333-3333-4333-8333-333333333333';
const TA='44444444-4444-4444-8444-444444444444';
const TB='55555555-5555-4555-8555-555555555555';
const MA='66666666-6666-4666-8666-666666666666';
const MB='77777777-7777-4777-8777-777777777777';
const MP='88888888-8888-4888-8888-888888888888';
const NOW=1800000000;
const PORT=18765;
const password='R126-fixture-local-synthetic-password-only';
const salt='1234567890abcdef1234567890abcdef';
const files=['0001_cf_qa_metadata.sql','0002_cf_qa_mobile_login.sql',
             '0003_cf_qa_matter_catalog.sql','r108_qa_matter_rename.sql',
             'r109_qa_legal_ai_quota.sql','r67_qa_account_profiles.sql'];
const db=new DatabaseSync(':memory:');
for(const name of files)db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));

for(const [sql,params] of [
  ['INSERT INTO qa_principals VALUES(?,?,?)',[I,A,'active']],
  ['INSERT INTO qa_principals VALUES(?,?,?)',[I,B,'active']],
  ['INSERT INTO qa_tenants VALUES(?,?,?)',[I,TA,'personal']],
  ['INSERT INTO qa_tenants VALUES(?,?,?)',[I,TB,'organization']],
  ['INSERT INTO qa_memberships(installation_id,tenant_id,user_id,role_key,status) VALUES(?,?,?,?,?)',[I,TA,A,'lawyer','active']],
  ['INSERT INTO qa_memberships(installation_id,tenant_id,user_id,role_key,status) VALUES(?,?,?,?,?)',[I,TB,A,'lawyer','active']],
  ['INSERT INTO qa_memberships(installation_id,tenant_id,user_id,role_key,status) VALUES(?,?,?,?,?)',[I,TB,B,'tenant_admin','active']],
  ['INSERT INTO qa_matters VALUES(?,?,?,?)',[I,TA,MA,1]],
  ['INSERT INTO qa_matters VALUES(?,?,?,?)',[I,TB,MB,1]],
  ['INSERT INTO qa_matters VALUES(?,?,?,?)',[I,TB,MP,1]],
  ['INSERT INTO qa_matter_catalog(installation_id,tenant_id,matter_id,title,created_by,created_at) VALUES(?,?,?,?,?,?)',[I,TA,MA,'SYNTHETIC Personal A',A,NOW-20]],
  ['INSERT INTO qa_matter_catalog(installation_id,tenant_id,matter_id,title,created_by,created_at) VALUES(?,?,?,?,?,?)',[I,TB,MB,'SYNTHETIC Organization A',A,NOW-20]],
  ['INSERT INTO qa_matter_catalog(installation_id,tenant_id,matter_id,title,created_by,created_at) VALUES(?,?,?,?,?,?)',[I,TB,MP,'SYNTHETIC Organization B private',B,NOW-20]],
  ['INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)',[I,TA,MA,A,'read','allow',1,NOW-120,null]],
  ['INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)',[I,TB,MB,A,'read','allow',1,NOW-120,null]],
  ['INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)',[I,TB,MP,B,'read','allow',1,NOW-120,null]],
])db.prepare(sql).run(...params);
const hash=pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex');
for(const [user,email] of [[A,'r126-a@synthetic.invalid'],[B,'r126-b@synthetic.invalid']]){
  db.prepare('INSERT INTO qa_login_verifiers(installation_id,email,user_id,subject,password_salt,password_hash,pbkdf2_iterations,status) VALUES(?,?,?,?,?,?,?,?)')
    .run(I,email,'fixture-subject-'+user,salt,hash,100000,'active');
}

function d1(){
  return {
    prepare(sql){return {bind(...args){return {
      async first(){return db.prepare(sql).get(...args)??null;},
      async all(){return {results:db.prepare(sql).all(...args)};},
      async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}};}
    };}}},
    async batch(stmts){
      db.exec('BEGIN');
      try{const out=[];for(const stmt of stmts)out.push(await stmt.run());db.exec('COMMIT');return out;}
      catch(e){db.exec('ROLLBACK');throw e;}
    }
  };
}
let modelCalls=0;
const backend={
  DB:d1(),AI_LAW_CF_MODE:'isolated-qa-only',INSTALLATION_ID:I,
  JWT_ISSUER:'https://fixture-idp.invalid',JWT_AUDIENCE:'ai-law-api',
  JWT_JWKS_JSON:'{"keys":[]}',QA_RATE_PEPPER:'r126-fixture-only-local-runner-pepper-2026',
  AI:{async run(){modelCalls++;return {response:'Bản nháp QA giả lập [A1]. Luật sư kiểm duyệt.'};}}
};
const site={QA_AUTH:{fetch:(request)=>handle(request,backend,{now:NOW})}};
const base='https://127.0.0.1:'+PORT;
const dir=mkdtempSync(join(tmpdir(),'mihy-r126-gpt-'));
const cert=join(dir,'cert.pem'),key=join(dir,'key.pem');
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-sha256','-nodes',
  '-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost',
  '-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
const options={cert:readFileSync(cert),key:readFileSync(key)};
const server=createServer(options,async (incoming,outgoing)=>{
  try{
    if(incoming.url==='/__r126_fixture__/metrics'&&incoming.method==='GET'){
      const usage=db.prepare('SELECT COUNT(*) AS quota_rows,COALESCE(SUM(requests),0) AS quota_requests FROM qa_legal_ai_quota').get();
      outgoing.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      outgoing.end(JSON.stringify({quota_rows:usage.quota_rows,quota_requests:usage.quota_requests,model_calls:modelCalls}));
      return;
    }
    const chunks=[];let length=0;
    for await(const chunk of incoming){
      length+=chunk.length;
      if(length>100000){outgoing.writeHead(413);outgoing.end();return;}
      chunks.push(chunk);
    }
    const request=new Request(base+incoming.url,{
      method:incoming.method,headers:incoming.headers,
      ...(chunks.length?{body:Buffer.concat(chunks),duplex:'half'}:{})
    });
    const response=await handleSite(request,site);
    outgoing.writeHead(response.status,Object.fromEntries(response.headers.entries()));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  }catch{
    outgoing.writeHead(503,{'Content-Type':'text/plain','Cache-Control':'no-store'});
    outgoing.end('QA fixture unavailable');
  }
});
function shutdown(){server.close(()=>{db.close();rmSync(dir,{recursive:true,force:true});});}
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
server.listen(PORT,'127.0.0.1',()=>console.log('R126_LOCAL_FIXTURE_READY'));
