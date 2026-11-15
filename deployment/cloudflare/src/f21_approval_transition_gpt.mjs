/* R164 F21 server-side transition boundary (NOT a wired Worker endpoint).
 * The store adapter MUST load all policy fields from verified session + persisted
 * Tenant/MatterACL, assignment, qualification and output/source records.
 * approveWithAudit MUST atomically CAS pending_review -> approved and write audit
 * in the same DB transaction. No issuance, download, or publication here.
 */
import {canApproveMatterOutput} from './f21_approval_guard_gpt.mjs';

const validId=x=>typeof x==='string'&&x.length<=128&&x.trim()===x&&x.length>0&&
 !/[\u0000-\u001f\u007f-\u009f\u2028\u2029\p{Cf}]/u.test(x);
export async function approveMatterOutput({store,session,input}={}){
 const denied={status:'DENIED'};
 if(!store||typeof store.loadVerifiedApprovalContext!=='function'||
    typeof store.approveWithAudit!=='function'||!session||!input||
    !validId(session.actorId)||!validId(session.tenantId)||!validId(input.outputId))
  return denied;
 try{
  const c=await store.loadVerifiedApprovalContext({
   outputId:input.outputId,actorId:session.actorId,tenantId:session.tenantId});
  if(!c||c.outputId!==input.outputId||c.actorId!==session.actorId||c.tenantId!==session.tenantId||
     !canApproveMatterOutput(c)||!validId(c.matterId)||!Number.isSafeInteger(c.outputVersion)||c.outputVersion<0||
     c.outputVersion>=Number.MAX_SAFE_INTEGER)return denied;
  // Adapter MUST compare expectedVersion and Matter scope, revalidate ACL and assignment inside transaction;
  // an optimistic read alone is insufficient against concurrent revocation.
  const receipt=await store.approveWithAudit({
   outputId:input.outputId,actorId:session.actorId,tenantId:session.tenantId,
   matterId:c.matterId,expectedVersion:c.outputVersion,expectedStatus:'pending_review'});
  return receipt?.changed===true&&receipt?.auditWritten===true
   ?{status:'APPROVED'}:{status:'CONFLICT_OR_AUDIT_FAILURE'};
 }catch{
  // Do not leak customer data, SQL, or identity details through errors.
  return {status:'CONFLICT_OR_AUDIT_FAILURE'};
 }
}
