import test from 'node:test';
import assert from 'node:assert/strict';
import {approveMatterOutput} from '../src/f21_approval_transition_gpt.mjs';

// Regression: identifier strings are opaque keys, never control-bearing tokens.
test('R166 F21 reject control characters in all externally supplied identifiers before store reads',async()=>{
 let loads=0, writes=0;
 const store={
  loadVerifiedApprovalContext:async()=>{loads++;return null;},
  approveWithAudit:async()=>{writes++;return {changed:true,auditWritten:true};}
 };
 const valid={actorId:'lawyer-b',tenantId:'tenant-a'};
 for(const bad of ['output\\n1','output\\r1','output\\t1','output\\u00001','output\\u007f1','output\\u20281']){
  const id=bad.replace('\\n','\n').replace('\\r','\r').replace('\\t','\t').replace('\\u0000','\u0000').replace('\\u007f','\u007f').replace('\\u2028','\u2028');
  assert.equal((await approveMatterOutput({store,session:valid,input:{outputId:id}})).status,'DENIED');
  assert.equal((await approveMatterOutput({store,session:{...valid,actorId:id},input:{outputId:'out-1'}})).status,'DENIED');
  assert.equal((await approveMatterOutput({store,session:{...valid,tenantId:id},input:{outputId:'out-1'}})).status,'DENIED');
 }
 assert.equal(loads,0);assert.equal(writes,0);
});
