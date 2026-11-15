import test from 'node:test';
import assert from 'node:assert/strict';
import {approveMatterOutput} from '../src/f21_approval_transition_gpt.mjs';

const context={outputId:'out-1',tenantId:'tenant-a',matterTenantId:'tenant-a',matterId:'matter-a',
 actorId:'lawyer-b',authorId:'lawyer-a',role:'lawyer',matterRead:true,
 outputTenantId:'tenant-a',outputMatterId:'matter-a',outputAuthorId:'lawyer-a',
 reviewerAssignmentTenantId:'tenant-a',reviewerAssignmentMatterId:'matter-a',
 reviewerAssignmentActorId:'lawyer-b',matterApprove:true,denied:false,
 qualifiedLawyer:true,assignedReviewer:true,outputStatus:'pending_review',sourceVerified:true,
 outputVersion:3};

test('R169: reject malformed persisted identity and scope before CAS/audit',async()=>{
 for(const field of ['authorId','outputAuthorId','matterTenantId','outputTenantId',
  'outputMatterId','reviewerAssignmentTenantId','reviewerAssignmentMatterId',
  'reviewerAssignmentActorId']){
  for(const invalid of [' actor','actor\nother','actor\u2028other','x'.repeat(129)]){
   let writes=0;
   const c={...context,[field]:invalid};
   const store={loadVerifiedApprovalContext:async()=>c,
    approveWithAudit:async()=>{writes++;return {changed:true,auditWritten:true};}};
   const result=await approveMatterOutput({store,session:{actorId:'lawyer-b',tenantId:'tenant-a'},input:{outputId:'out-1'}});
   assert.equal(result.status,'DENIED',field);
   assert.equal(writes,0,field);
  }
 }
});


test('R170: approval guard module loads and rejects Unicode control IDs', async () => {
 const {validApprovalId}=await import('../src/f21_approval_guard_gpt.mjs');
 assert.equal(validApprovalId('lawyer-b'),true);
 for(const id of ['lawyer\nother','lawyer\u2028other','lawyer\u0000other',' lawyer','x'.repeat(129)])
  assert.equal(validApprovalId(id),false);
});

// R171: invisible format controls must not enter persisted approval identities.
test('R171: reject invisible format controls before CAS/audit',async()=>{
 const {validApprovalId}=await import('../src/f21_approval_guard_gpt.mjs');
 for(const id of ['lawyer\u200bother','lawyer\u200eother','lawyer\u202eother','lawyer\u2066other','lawyer\ufeffother']){
  assert.equal(validApprovalId(id),false,'format control');
  let writes=0;
  const store={loadVerifiedApprovalContext:async()=>({...context,authorId:id,outputAuthorId:id}),approveWithAudit:async()=>{writes++;return {changed:true,auditWritten:true};}};
  assert.equal((await approveMatterOutput({store,session:{actorId:'lawyer-b',tenantId:'tenant-a'},input:{outputId:'out-1'}})).status,'DENIED');
  assert.equal(writes,0);
 }
});
