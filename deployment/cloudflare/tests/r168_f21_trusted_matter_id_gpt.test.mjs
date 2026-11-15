import test from 'node:test';
import assert from 'node:assert/strict';
import {approveMatterOutput} from '../src/f21_approval_transition_gpt.mjs';

const base={outputId:'out-1',tenantId:'tenant-a',matterTenantId:'tenant-a',matterId:'matter-a',
 actorId:'lawyer-b',authorId:'lawyer-a',role:'lawyer',matterRead:true,
 outputTenantId:'tenant-a',outputMatterId:'matter-a',outputAuthorId:'lawyer-a',
 reviewerAssignmentTenantId:'tenant-a',reviewerAssignmentMatterId:'matter-a',
 reviewerAssignmentActorId:'lawyer-b',matterApprove:true,denied:false,
 qualifiedLawyer:true,assignedReviewer:true,outputStatus:'pending_review',sourceVerified:true,
 outputVersion:3};

test('R168: invalid persisted Matter identifiers cannot reach approval/audit adapter',async()=>{
 for(const matterId of ['matter\nother','matter\u2028other',' matter-a','matter-a ', 'x'.repeat(129)]){
  let writes=0;
  const context={...base,matterId,outputMatterId:matterId,reviewerAssignmentMatterId:matterId};
  const store={loadVerifiedApprovalContext:async()=>context,
   approveWithAudit:async()=>{writes++;return {changed:true,auditWritten:true};}};
  const result=await approveMatterOutput({store,session:{actorId:'lawyer-b',tenantId:'tenant-a'},input:{outputId:'out-1'}});
  assert.equal(result.status,'DENIED',JSON.stringify(matterId));
  assert.equal(writes,0,JSON.stringify(matterId));
 }
});
