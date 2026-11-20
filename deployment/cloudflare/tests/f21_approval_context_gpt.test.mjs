import test from 'node:test';
import assert from 'node:assert/strict';
import {mayApproveMatterOutput} from '../src/f21_approval_context_gpt.mjs';

const allowed = () => ({
 sessionVerified:true,sessionActive:true,tenantMatches:true,matterMatches:true,
 membershipActive:true,lawyerQualified:true,reviewerAssigned:true,
 aclAllow:true,aclDeny:false,systemAdministrator:false,
 reviewerId:'reviewer-b',authorId:'author-a'
});

test('R204 positive: independently verified approval context',()=>{
 assert.equal(mayApproveMatterOutput(allowed()),true);
});
test('R204 negative: fail closed on every missing, false or forged gate',()=>{
 for(const key of Object.keys(allowed()).filter(k=>!['reviewerId','authorId'].includes(k))){
  const missing=allowed();delete missing[key];
  assert.equal(mayApproveMatterOutput(missing),false,key+' missing');
  const wrong=allowed();wrong[key]=key==='aclDeny'||key==='systemAdministrator'?true:false;
  assert.equal(mayApproveMatterOutput(wrong),false,key+' wrong');
  const string=allowed();string[key]=String(allowed()[key]);
  assert.equal(mayApproveMatterOutput(string),false,key+' string');
 }
 assert.equal(mayApproveMatterOutput(null),false);
});
test('R204 negative: deny overrides allow and SaaS system admin is never a reviewer',()=>{
 assert.equal(mayApproveMatterOutput({...allowed(),aclAllow:true,aclDeny:true}),false);
 assert.equal(mayApproveMatterOutput({...allowed(),systemAdministrator:true}),false);
 assert.equal(mayApproveMatterOutput({...allowed(),tenantMatches:false}),false);
 assert.equal(mayApproveMatterOutput({...allowed(),matterMatches:false}),false);
});
test('R204 negative: no self approval, invalid identities or client-controlled nulls',()=>{
 for(const reviewerId of ['author-a','', ' reviewer-b','reviewer-b ', 'x'.repeat(129),null])
  assert.equal(mayApproveMatterOutput({...allowed(),reviewerId}),false);
 assert.equal(mayApproveMatterOutput({...allowed(),authorId:undefined}),false);
});

// R205 regression: inherited or accessor-controlled flags must not grant approval.
test('R205 negative: prototype-inherited approval flags never authorize',()=>{
 const inherited=Object.create(allowed());
 assert.equal(mayApproveMatterOutput(inherited),false);
 const partial=Object.create(allowed());
 partial.reviewerId='reviewer-b';
 assert.equal(mayApproveMatterOutput(partial),false);
});

// R206: own accessor properties must never be invoked for authorization.
test('R206 negative: own getters and proxies cannot supply approval gates',()=>{
 const getter=allowed();let invoked=0;
 Object.defineProperty(getter,'sessionVerified',{enumerable:true,get(){invoked++;return true;}});
 assert.equal(mayApproveMatterOutput(getter),false);
 assert.equal(invoked,0,'authorization getter must not execute');
 const identity=allowed();Object.defineProperty(identity,'reviewerId',{get(){throw Error('untrusted getter executed');}});
 assert.equal(mayApproveMatterOutput(identity),false);
});
