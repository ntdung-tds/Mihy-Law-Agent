import test from 'node:test';
import assert from 'node:assert/strict';
import {canApproveMatterOutput} from '../src/f21_approval_guard_gpt.mjs';

// Synthetic policy fixture only; all fields must be populated by trusted server records.
const c={tenantId:'tenant-a',matterTenantId:'tenant-a',matterId:'matter-a',
 actorId:'lawyer-b',authorId:'lawyer-a',role:'lawyer',matterRead:true,
 outputTenantId:'tenant-a',outputMatterId:'matter-a',outputAuthorId:'lawyer-a',
 reviewerAssignmentTenantId:'tenant-a',reviewerAssignmentMatterId:'matter-a',
 reviewerAssignmentActorId:'lawyer-b',matterApprove:true,denied:false,
 qualifiedLawyer:true,assignedReviewer:true,outputStatus:'pending_review',sourceVerified:true};

test('R163 assigned reviewer identity must match verified session actor',()=>{
 assert.equal(canApproveMatterOutput(c),true);
 for(const patch of [
  {reviewerAssignmentActorId:'lawyer-c'},
  {reviewerAssignmentActorId:'lawyer-a'},
  {reviewerAssignmentActorId:''},
  {reviewerAssignmentActorId:null},
  {reviewerAssignmentActorId:undefined},
  {reviewerAssignmentActorId:42},
  {actorId:'lawyer-c'},
 ]) assert.equal(canApproveMatterOutput({...c,...patch}),false,JSON.stringify(patch));
});
