/* R204: fail-closed F21 approval authorization boundary (source-only).
 * All inputs must be independently obtained from a verified server-side session,
 * current DB membership, MatterACL and assignment; NEVER from request body.
 * This does not replace an atomic D1 transaction or enable issuance.
 */
export function mayApproveMatterOutput(context) {
 if (!context || typeof context !== 'object' || Array.isArray(context)) return false;
 // Reject inherited authorization flags: every gate must be explicitly supplied
 // by the trusted server-side context builder, not its prototype chain.
 const required = ['sessionVerified','sessionActive','tenantMatches','matterMatches',
  'membershipActive','lawyerQualified','reviewerAssigned','aclAllow','aclDeny',
  'systemAdministrator','reviewerId','authorId'];
 if (!required.every(key => Object.hasOwn(context,key))) return false;
 const {sessionVerified,sessionActive,tenantMatches,matterMatches,
        membershipActive,lawyerQualified,reviewerAssigned,
        aclAllow,aclDeny,systemAdministrator,reviewerId,authorId} = context;
 if (sessionVerified !== true || sessionActive !== true ||
     tenantMatches !== true || matterMatches !== true ||
     membershipActive !== true || lawyerQualified !== true ||
     reviewerAssigned !== true || aclAllow !== true ||
     aclDeny !== false || systemAdministrator !== false) return false;
 const safeId = x => typeof x === 'string' && x.length > 0 && x.length <= 128 &&
   x.trim() === x && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029\p{Cf}]/u.test(x);
 return safeId(reviewerId) && safeId(authorId) && reviewerId !== authorId;
}
