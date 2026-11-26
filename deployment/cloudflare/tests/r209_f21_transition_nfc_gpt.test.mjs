import test from 'node:test';
import assert from 'node:assert/strict';
import {approveMatterOutput} from '../src/f21_approval_transition_gpt.mjs';

test('R209: transition rejects non-NFC actor before any store read',async()=>{
 let reads=0, writes=0;
 const store={
  async loadVerifiedApprovalContext(){reads++;return null;},
  async approveWithAudit(){writes++;return null;}
 };
 const result=await approveMatterOutput({
  store,session:{actorId:'reviewer-e\u0301',tenantId:'tenant-a'},
  input:{outputId:'output-a'}
 });
 assert.deepEqual(result,{status:'DENIED'});
 assert.equal(reads,0);
 assert.equal(writes,0);
});

test('R209: transition rejects non-NFC output and tenant identifiers before store read',async()=>{
 let reads=0;
 const store={
  async loadVerifiedApprovalContext(){reads++;return null;},
  async approveWithAudit(){throw Error('must not write');}
 };
 for(const [tenantId,outputId] of [['tenant-e\u0301','output-a'],['tenant-a','output-e\u0301']]){
  const result=await approveMatterOutput({
   store,session:{actorId:'reviewer-a',tenantId},input:{outputId}
  });
  assert.deepEqual(result,{status:'DENIED'});
 }
 assert.equal(reads,0);
});
