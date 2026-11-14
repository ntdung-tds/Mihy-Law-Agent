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

test('R167 reject absent, fractional and unsafe persisted output revisions before write',async()=>{
 for(const version of [undefined,null,-1,1.5,Number.MAX_SAFE_INTEGER+1,'3']){
  let writes=0;
  const store={loadVerifiedApprovalContext:async()=>({...base,outputVersion:version}),
   approveWithAudit:async()=>{writes++;return {changed:true,auditWritten:true};}};
  const result=await approveMatterOutput({store,session:{actorId:'lawyer-b',tenantId:'tenant-a'},
   input:{outputId:'out-1'}});
  assert.equal(result.status,'DENIED');
  assert.equal(writes,0);
 }
});

test('R167 pass trusted Matter scope and expected output revision into atomic adapter',async()=>{
 let args;
 const store={loadVerifiedApprovalContext:async()=>({...base}),
  approveWithAudit:async x=>{args=x;return {changed:true,auditWritten:true};}};
 const result=await approveMatterOutput({store,session:{actorId:'lawyer-b',tenantId:'tenant-a'},
  input:{outputId:'out-1',outputVersion:999,matterId:'matter-other'}});
 assert.equal(result.status,'APPROVED');
 assert.equal(args.expectedVersion,3);
 assert.equal(args.matterId,'matter-a');
 assert.equal(args.expectedStatus,'pending_review');
 assert.equal(args.outputId,'out-1');
});
