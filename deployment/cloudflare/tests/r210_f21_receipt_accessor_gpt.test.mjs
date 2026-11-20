import test from 'node:test';
import assert from 'node:assert/strict';
import {approveMatterOutput} from '../src/f21_approval_transition_gpt.mjs';

const context={outputId:'output-a',actorId:'reviewer-a',tenantId:'tenant-a',matterId:'matter-a',outputVersion:2,
  sessionVerified:true,tenantActive:true,matterReadAllowed:true,matterWriteAllowed:true,
  reviewerIsLawyer:true,reviewerAssigned:true,authorId:'author-b',outputStatus:'pending_review'};
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
