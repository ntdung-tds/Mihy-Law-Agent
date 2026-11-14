import test from 'node:test';
import assert from 'node:assert/strict';
import {canApproveMatterOutput} from '../src/f21_approval_guard_gpt.mjs';
const base={tenantId:'tenant-a',matterTenantId:'tenant-a',matterId:'matter-a',
 actorId:'lawyer-b',authorId:'lawyer-a',role:'lawyer',matterRead:true,
 matterApprove:true,denied:false,qualifiedLawyer:true,assignedReviewer:true,
 outputStatus:'pending_review',sourceVerified:true};
test('R160 F21 requires explicit independent qualified lawyer review',()=>{
 assert.equal(canApproveMatterOutput(base),true);
 for(const patch of [{actorId:'lawyer-a'},{qualifiedLawyer:false},
  {assignedReviewer:false},{matterApprove:false},{matterRead:false},
  {denied:true},{role:'tenant_admin'},{role:'system_admin'},
  {outputStatus:'approved'},{outputStatus:'draft'},
  {sourceVerified:false},{matterTenantId:'tenant-b'},
  {tenantId:''},{matterId:''},{authorId:''}]){
  assert.equal(canApproveMatterOutput({...base,...patch}),false,JSON.stringify(patch));
 }
});
test('R160 F21 missing or untrusted approval context fails closed',()=>{
 for(const value of [null,undefined,{},[],{...base,denied:undefined},
  {...base,qualifiedLawyer:'true'},{...base,actorId:42}]){
  assert.equal(canApproveMatterOutput(value),false);
 }
});
