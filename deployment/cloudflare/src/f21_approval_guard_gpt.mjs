/* R160 F21 standalone policy primitive only.
 * Inputs MUST come from server-verified session, current MatterACL, reviewer
 * assignment, professional qualification and persisted output/source state. Never trust
 * client-supplied booleans. No approval persistence, API or release yet.
 */
export const validApprovalId=x=>typeof x==='string'&&x.length>0&&x.length<=128&&x.trim()===x&&
 !/[\u0000-\u001f\u007f-\u009f\u2028\u2029\p{Cf}]/u.test(x);

export function canApproveMatterOutput(c){
 if(!c||typeof c!=='object'||Array.isArray(c))return false;
 for(const key of ['tenantId','matterTenantId','matterId','actorId','authorId',
  'outputTenantId','outputMatterId','outputAuthorId',
  'reviewerAssignmentTenantId','reviewerAssignmentMatterId','reviewerAssignmentActorId'])
  if(!validApprovalId(c[key]))return false;
 return c.tenantId===c.matterTenantId&&
  c.outputTenantId===c.tenantId&&c.outputMatterId===c.matterId&&
  c.outputAuthorId===c.authorId&&
  c.reviewerAssignmentTenantId===c.tenantId&&
  c.reviewerAssignmentMatterId===c.matterId&&
  c.reviewerAssignmentActorId===c.actorId&&
  c.actorId!==c.authorId&&c.role==='lawyer'&&
  c.matterRead===true&&c.matterApprove===true&&c.denied===false&&
  c.qualifiedLawyer===true&&c.assignedReviewer===true&&
  c.outputStatus==='pending_review'&&c.sourceVerified===true;
}
