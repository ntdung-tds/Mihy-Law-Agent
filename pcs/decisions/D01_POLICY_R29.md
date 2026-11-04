# AI Law — D01: Approved policy, release gates unchanged

**Decision:** D01 (owner policy approval recorded 2026-11-04).  
**Canonical baseline:** private SRS v1.1.15, unchanged.  
**Status:** `OWNER_APPROVED_IN_CHAT` for design/policy **only**. This is not a signed decision record, legal compliance clearance, or product acceptance.

## Model approved
- Personal and organization tenants on one platform; one verified user may have multiple memberships, each scoped to a tenant.
- Tenant administration is not legal ownership of all data or permission to read all matters; MatterACL, sensitivity, source rights and point-of-use checks remain mandatory.
- Joining/leaving an organization does not silently transfer personal files or restore revoked access.
- No default client-case-data training of AI models, cross-tenant reuse, sale, or provider access.
- Legal controller/processor roles must be mapped per processing activity, contract and actual purpose/means.

## Two separate release gates
- `GATE-D01-R0=PENDING_EVIDENCE`: private SRS requires formal owner confirmation/evidence and identity boundaries before live R0 identity/tenant operations. Synthetic fixture R0 development may continue.
- `GATE-LEGAL-DATA=PENDING_APPROVAL`: real-client-data Pilot is blocked until D01 and other **applicable** decisions, lawful case-data handling and security evidence are complete. D03/D05/D07 are generally required; D02 if real corpus, D04 if external AI/OCR/vendor. D06 budget and D08 DMS are distinct scope decisions.

## Factual and legal open items
A legal entity/operator has not been supplied. Applicable controller/processor roles, client DPA and third-party processing agreements are not signed. Counsel must determine whether the actual service falls under Vietnam Decree 356/2025/NĐ-CP Articles 21–25, including potential service certification; no categorical determination is claimed. Real PostgreSQL RLS, IdP/session revocation, MatterACL and live cross-tenant E2E are NOT_RUN.

## Evidence and access classification
- Owner explicitly approved the proposed D01 policy in conversation, on 2026-11-04.
- No owner-signed electronic or physical document was received; do not populate any signed approval URI from this chat.
- Detailed source quotations, customer/legal documents, legal advice and the private SRS remain **outside this public repository**.
- This is public-safe project governance metadata; see `D01_POLICY_R29.json` for machine-readable controls and blockers.

**Current effect:** Approve the D01 design assumptions for synthetic R0 work, keep the two live-data/identity gates locked, and require separate formal evidence before any actual activation.
