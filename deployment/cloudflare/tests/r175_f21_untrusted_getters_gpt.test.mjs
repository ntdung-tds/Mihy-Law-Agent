import test from 'node:test';
import assert from 'node:assert/strict';
import {approveMatterOutput} from '../src/f21_approval_transition_gpt.mjs';

// Synthetic hostile transport objects must not throw before the fail-closed boundary.
test('R175 F21 malformed accessor inputs fail closed without store writes', async () => {
 for (const field of ['session','input']) {
  let writes=0,loads=0;
  const hostile=new Proxy({}, {get(){throw Error('synthetic accessor failure');}});
  const args={session:{actorId:'reviewer',tenantId:'tenant-a'},
   input:{outputId:'out-1'},store:{
    loadVerifiedApprovalContext:async()=>{loads++;return null;},
    approveWithAudit:async()=>{writes++;return {changed:true,auditWritten:true};}
   }};
  args[field]=hostile;
  const result=await approveMatterOutput(args);
  assert.deepEqual(result,{status:'DENIED'});
  assert.equal(loads,0);
  assert.equal(writes,0);
 }
});
