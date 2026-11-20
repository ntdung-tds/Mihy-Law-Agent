/* R201/R202: explicit F21 review lifecycle contract. Not a Worker endpoint or D1 migration.
 * Callers must separately enforce verified session, Tenant/MatterACL, lawyer
 * qualification, assignment and atomic persistence/audit. No issuance here.
 */
export const REVIEW_STATES=Object.freeze(['draft','pending_review','approved']);
const safeVersion=v=>Number.isSafeInteger(v)&&v>=1&&v<Number.MAX_SAFE_INTEGER;
const validId=x=>typeof x==='string'&&x.length>0&&x.length<=128&&
 x.trim()===x&&!/[\u0000-\u001f\u007f-\u009f\u2028\u2029\p{Cf}]/u.test(x);
export function nextReviewState({from,to,version,reviewerId,authorId}={}){
 if(!safeVersion(version)||typeof from!=='string'||typeof to!=='string')return null;
 if(from==='draft'&&to==='pending_review'){
  // Submission is not an approval: no reviewer identity may be supplied.
  if(reviewerId!==undefined&&reviewerId!==null)return null;
  return {expectedStatus:'draft',nextStatus:'pending_review',expectedVersion:version,nextVersion:version+1};
 }
 if(from==='pending_review'&&to==='approved'&&
    validId(reviewerId)&&validId(authorId)&&reviewerId!==authorId){
  return {expectedStatus:'pending_review',nextStatus:'approved',expectedVersion:version,nextVersion:version+1};
 }
 return null;
}
