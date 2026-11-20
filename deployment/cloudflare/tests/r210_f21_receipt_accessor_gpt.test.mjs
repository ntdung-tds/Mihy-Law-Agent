import test from 'node:test';
import assert from 'node:assert/strict';
import {approveMatterOutput} from '../src/f21_approval_transition_gpt.mjs';

const context={
 outputId:'output-a',outputVersion:2,tenantId:'tenant-a',matterTenantId:'tenant-a',
 matterId:'matter-a',actorId:'reviewer-a',authorId:'author-b',
 outputTenantId:'tenant-a',outputMatterId:'matter-a',outputAuthorId:'author-b',
 reviewerAssignmentTenantId:'tenant-a',reviewerAssignmentMatterId:'matter-a',
 reviewerAssignmentActorId:'reviewer-a',role:'lawyer',matterRead:true,
 matterApprove:true,denied:false,qualifiedLawyer:true,assignedReviewer:true,
 outputStatus:'pending_review',sourceVerified:true
};
test('R210: untrusted receipt getters cannot fabricate committed approval',async()=>{
 let invoked=0;
 const receipt={};
 Object.defineProperty(receipt,'changed',{enumerable:true,get(){invoked++;return true;}});
 Object.defineProperty(receipt,'auditWritten',{enumerable:true,get(){invoked++;return true;}});
 const result=await approveMatterOutput({session:{actorId:'reviewer-a',tenantId:'tenant-a'},input:{outputId:'output-a'},store:{
  async loadVerifiedApprovalContext(){return context;},
  async approveWithAudit(){return receipt;}
 }});
 assert.notEqual(result.status,'APPROVED');
 assert.equal(invoked,0);
});
