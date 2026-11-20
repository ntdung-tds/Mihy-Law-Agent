/* R201: explicit F21 review lifecycle contract. Not a Worker endpoint or D1 migration.
 * Callers must separately enforce verified session, Tenant/MatterACL, lawyer
 * qualification, assignment and atomic persistence/audit. No issuance here.
 */
export const REVIEW_STATES=Object.freeze(['draft','pending_review','approved']);
const safeVersion=v=>Number.isSafeInteger(v)&&v>=1&&v<Number.MAX_SAFE_INTEGER;
export function nextReviewState({from,to,version,reviewerId,authorId}={}){
 if(!safeVersion(version)||typeof from!=='string'||typeof to!=='string')return null;
 if(from==='draft'&&to==='pending_review'){
  // Submission is not an approval; no reviewer identity is accepted here.
  return {expectedStatus:'draft',nextStatus:'pending_review',expectedVersion:version,nextVersion:version+1};
 }
 if(from==='pending_review'&&to==='approved'&&
    typeof reviewerId==='string'&&reviewerId.length>0&&
    typeof authorId==='string'&&authorId.length>0&&reviewerId!==authorId){
  return {expectedStatus:'pending_review',nextStatus:'approved',expectedVersion:version,nextVersion:version+1};
 }
 return null;
}
