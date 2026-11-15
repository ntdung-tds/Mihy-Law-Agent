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
