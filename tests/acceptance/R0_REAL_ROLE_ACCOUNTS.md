# R0 role-based real account acceptance — IAICT operator (Owner clarification 2026-11-04)

**Baseline:** private SRS v1.1.15; TC12A/TC12B and existing IAM/authorization contracts. This file clarifies *how to test approved functionality* and adds no new public API or SRS role. **Owner D01 policy APPROVED**. IAICT operates the whole AI Law platform; individual case content remains governed by tenant membership and MatterACL.

## Meaning of "demo customer"

A demo customer is **an actual test user account provisioned in the authorized identity provider**, signing in to an isolated real application and interacting with backend APIs and PostgreSQL permissions. A static persona button or synthetic SQL principal row is NOT a demo account, cannot prove login, and must not be reported as TC12 acceptance.

The entries below are **test actor scenarios, not proof that accounts have been created**. Reuse approved role keys from the SRS role registry. Store test credentials in the controlled identity provider/secret manager, NEVER here or in GitHub; record internal test-run references in private Drive.

| Case | Actor / account type | Actual behavior to verify | Current |
| --- | --- | --- | --- |
| RA-01 | IAICT platform operator | Authorized platform/customer/tenant administration; **cannot** read customer matter content without a separately authorized scoped pathway | NOT_RUN |
| RA-02 | Personal legal professional | Verified sign-in, personal tenant membership, sees only explicitly permitted personal case | NOT_RUN |
| RA-03 | Same principal with personal + organization memberships | Switch authorized server-owned tenant context, clear prior scoped document/chat/results; no cross-tenant leakage | NOT_RUN |
| RA-04 | Organization tenant administrator | Can manage tenant membership only as approved; no implicit case read despite admin role | NOT_RUN |
| RA-05 | Organization lawyer with explicit MatterACL | Can read authorized organization case; cannot access unrelated case or other tenant | NOT_RUN |
| RA-06 | Authenticated nonmember / revoked member | Cannot access target tenant, matter, run, file, search, or download (deny/masked response) | NOT_RUN |
| RA-07 | Revoked session / disabled user | Login or subsequent calls fail closed; no stale authorization after revocation | NOT_RUN |
| RA-08 | Malicious tenant/matter/run substitution | Cross-tenant URL, header, ID and query tampering cannot override authenticated session context | NOT_RUN |
| RA-09 | Limited-permission organization member | Can read only the explicitly granted matter; another matter in the same tenant remains denied (not a new SRS role) | NOT_RUN |

## Execution requirements and evidence

1. **Connect a real approved IdP** with cryptographically validated token signature/JWKS, issuer, audience, expiry and session state; configure MFA/step-up if mandated by the locked SRS. Do not make the static demo selector into a login system.
2. **Provision separately identifiable test users**, actual roles and memberships in an isolated nonproduction deployment backed by a non-shared PostgreSQL database. The same person's two memberships must map to the **same internal principal**, not two unrelated fake users.
3. **Test real browser and backend** with API traces, database RLS/MatterACL assertion, revoke/negative cases, 320px/390px/desktop and at least the SRS TC12A/TC12B cases. Run logout/session expiry and re-login checks.
4. Track each test as PASS / FAIL / BLOCKED / NOT_RUN with environment, build SHA, test-run ID, timestamp and artifacts stored in private Drive. Do not publish credentials, customer content, or screenshots to public GitHub.
5. Gate final product acceptance on the Owner's review. This document **does not authorize production** or client-case-data processing. Legal-data and formal evidence requirements remain separate; **do not reopen the already-approved D01 policy**.

## Status at creation

- D01 decision: **OWNER_APPROVED**; operator: **IAICT**.
- Existing static R31 demo and PostgreSQL synthetic CI: **PASS as technical fixtures, not account E2E**.
- Actual IdP provisioning, real-role login, RA-01..RA-08, TC12A/B application E2E: **NOT_RUN**.
- No provider or test credentials were invented or committed.
