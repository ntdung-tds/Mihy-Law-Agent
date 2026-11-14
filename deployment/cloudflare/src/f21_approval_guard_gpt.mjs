/* R160 F21 standalone policy primitive only.
 * Inputs MUST come from server-verified session, current MatterACL, reviewer
 * assignment, professional qualification and persisted output/source state. Never trust
 * client-supplied booleans. No approval persistence, API or release yet.
 */
export function canApproveMatterOutput(c){
 if(!c||typeof c!=='object'||Array.isArray(c))return false;
 for(const key of ['tenantId','matterTenantId','matterId','actorId','authorId',
  'outputTenantId','outputMatterId','outputAuthorId'])
  if(typeof c[key]!=='string'||!c[key].trim())return false;
 return c.tenantId===c.matterTenantId&&
  c.outputTenantId===c.tenantId&&c.outputMatterId===c.matterId&&
  c.outputAuthorId===c.authorId&&
  c.actorId!==c.authorId&&c.role==='lawyer'&&
  c.matterRead===true&&c.matterApprove===true&&c.denied===false&&
  c.qualifiedLawyer===true&&c.assignedReviewer===true&&
  c.outputStatus==='pending_review'&&c.sourceVerified===true;
}
