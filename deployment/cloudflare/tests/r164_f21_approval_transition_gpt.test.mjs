import test from 'node:test';
import assert from 'node:assert/strict';
import {approveMatterOutput} from '../src/f21_approval_transition_gpt.mjs';

const verified={tenantId:'tenant-a',matterTenantId:'tenant-a',matterId:'matter-a',
 actorId:'lawyer-b',authorId:'lawyer-a',role:'lawyer',matterRead:true,
 outputTenantId:'tenant-a',outputMatterId:'matter-a',outputAuthorId:'lawyer-a',
 reviewerAssignmentTenantId:'tenant-a',reviewerAssignmentMatterId:'matter-a',
 reviewerAssignmentActorId:'lawyer-b',matterApprove:true,denied:false,
 qualifiedLawyer:true,assignedReviewer:true,outputStatus:'pending_review',sourceVerified:true};

test('R164: never trust client approval fields; only server-loaded context can authorize',async()=>{
 let committed=0;
 const store={loadVerifiedApprovalContext:async()=>({...verified,denied:true}),
  approveWithAudit:async()=>{committed++;return {changed:true,auditWritten:true};}};
 const result=await approveMatterOutput({store,session:{actorId:'lawyer-b',tenantId:'tenant-a'},
  input:{outputId:'output-1',denied:false,qualifiedLawyer:true,sourceVerified:true}});
 assert.equal(result.status,'DENIED');assert.equal(committed,0);
});
test('R164: session actor and tenant must bind to verified server context',async()=>{
 let committed=0;
 const store={loadVerifiedApprovalContext:async()=>verified,
  approveWithAudit:async()=>{committed++;return {changed:true,auditWritten:true};}};
 for(const session of [{actorId:'lawyer-c',tenantId:'tenant-a'},
  {actorId:'lawyer-b',tenantId:'tenant-b'},null]){
  assert.equal((await approveMatterOutput({store,session,input:{outputId:'output-1'}})).status,'DENIED');
 }
 assert.equal(committed,0);
});
test('R164: success requires atomic compare-and-swap AND durable audit receipt',async()=>{
 for(const receipt of [{changed:false,auditWritten:true},{changed:true,auditWritten:false},null]){
  const store={loadVerifiedApprovalContext:async()=>verified,approveWithAudit:async()=>receipt};
  const result=await approveMatterOutput({store,session:{actorId:'lawyer-b',tenantId:'tenant-a'},
   input:{outputId:'output-1'}});
  assert.notEqual(result.status,'APPROVED');
 }
 const store={loadVerifiedApprovalContext:async()=>verified,
  approveWithAudit:async()=>({changed:true,auditWritten:true})};
 assert.equal((await approveMatterOutput({store,session:{actorId:'lawyer-b',tenantId:'tenant-a'},
  input:{outputId:'output-1'}})).status,'APPROVED');
});
test('R164: malformed identifiers, missing adapters and DB exceptions fail closed',async()=>{
 const store={loadVerifiedApprovalContext:async()=>verified,approveWithAudit:async()=>{throw Error('db');}};
 for(const input of [null,{}, {outputId:''},{outputId:42},{outputId:' '.repeat(2)}]){
  assert.notEqual((await approveMatterOutput({store,session:{actorId:'lawyer-b',tenantId:'tenant-a'},input})).status,'APPROVED');
 }
 assert.notEqual((await approveMatterOutput({store,session:{actorId:'lawyer-b',tenantId:'tenant-a'},
  input:{outputId:'output-1'}})).status,'APPROVED');
});
