# PCS SRS Changes
<!-- pcs-srs-changes:v1 -->

## CR-20261107-BYOS-01 — Organization-scoped selectable storage folders

```pcs-change
{"kind":"PROPOSE","id":"CR-20261107-BYOS-01","task_id":"AL-R0-DOC-TRANSFER-R72","item_key":"CR-20261107-BYOS-01","srs_ref":"UNMAPPED","mapping":"ACTIVE_CONTEXT","ambiguous_features":false,"based_on":"BASELINE_OR_IMPLEMENTED_QA_BEHAVIOR","before":"QA selects a single tenant Google Drive root as document upload destination; no employee-level folder selection/assignment flow.","after":"For customer organization A, an authorized admin can associate accessible storage folders with particular employees/groups; the signed-in user can select among permitted destinations before saving. No unconsented automatic upload to a hardcoded tenant root. Both AI Law ACL and provider permissions remain enforced.","reason":"Owner explicitly rejected forced default Drive destination and specified company-assigned per-employee folders in active Google Drive document work.","at":"2026-11-07T10:03:00Z","verified_external_decision":false}
```

## CR-20261107-BYOS-02 — User-connected Google Drive / OneDrive and folder choice

```pcs-change
{"kind":"PROPOSE","id":"CR-20261107-BYOS-02","task_id":"AL-R0-DOC-TRANSFER-R72","item_key":"CR-20261107-BYOS-02","srs_ref":"UNMAPPED","mapping":"ACTIVE_CONTEXT","ambiguous_features":false,"based_on":"BASELINE_OR_IMPLEMENTED_QA_BEHAVIOR","before":"QA document intake supports one connected Google Drive organization/personal workspace root. OneDrive and user-level selection of provider/account/folder are not implemented in this tested QA flow.","after":"A person can connect their own Google Drive or OneDrive account and explicitly select an authorized folder as destination; organization-authorized storage and personal-account storage must be distinguishable and isolated. Provider/account/folder choice is user-facing; personal destination is permitted only if the organization's policy allows it. Do not silently transfer client documents between storage owners.","reason":"Owner clarified the release must allow individual Google Drive/OneDrive login and chosen folder, not a forced provider/root; implementation compatibility and release phase require review.","at":"2026-11-07T10:03:00Z","verified_external_decision":false}
```

## Scope / implementation gate

- These are **Owner-stated functional deltas**, recorded in the active task ledger for review. They do **not** silently rewrite private SRS v1.1.15 or authorize production, new IAM privileges, or broader Google/Microsoft OAuth scopes.
- Relevant existing QA upload architecture: browser-to-Google directly, MatterACL, tenant root, bound ticket and D1 receipt; storage destination is currently fixed to tenant root.
- Implement as small provider-and-destination policy tasks; assess Google Picker `drive.file`, Microsoft Graph delegated permissions and available picker APIs; verify folder selection and access with real provider accounts. Do not assume selecting a folder grants app unrestricted access to its children.
- Acceptance: distinct organization/personal accounts, assigned folder allowed/denied, per-user and cross-tenant isolation, folder change/revocation, OneDrive and Google Drive upload/download, no unintended provider redirect or duplicates; CI then real QA browser, Owner final acceptance.
- No document data or secret stored in this public file.


### CR-20261107-BYOS-01 — Owner confirms implementation direction

```pcs-change
{"kind":"DECIDE","id":"CR-20261107-BYOS-01","decision":"APPROVED","actor":"owner","ref":"Current project conversation: Owner 'Ok, làm' after BYOS destination and Google Drive/OneDrive folder assignment proposal","at":"2026-11-07T10:41:27.169Z","verified_external_decision":false}
```

### CR-20261107-BYOS-02 — Owner confirms implementation direction

```pcs-change
{"kind":"DECIDE","id":"CR-20261107-BYOS-02","decision":"APPROVED","actor":"owner","ref":"Current project conversation: Owner 'Ok, làm' after BYOS destination and Google Drive/OneDrive folder assignment proposal","at":"2026-11-07T10:41:27.169Z","verified_external_decision":false}
```


## R108 — Implementation checkpoint, no SRS revision (2026-11-07)

- **Owner priority:** Pause Google Drive and OneDrive problem solving. Implement the remaining functions in small independent slices, with concrete source and real QA evidence; see [non-storage checklist #156](https://github.com/ntdung-tds/Mihy-Law-Agent/issues/156).
- **R108 implementation:** Versioned title-edit operation for the existing QA matter metadata register with effective current-tenant write ACL, deny-overrides, CSRF, 409 optimistic conflict, SQLite transactional audit trigger and mobile inline editor. This does not implement legal AI analysis, Word review, file storage or any new user-facing document provider.
- **SRS mapping:** Private v1.1.15 baseline unchanged. Its original artifact was not available in this conversation for clause-by-clause validation, so R108 is an implementation proposal to the existing QA matter management capability and the exact SRS reference is **NOT_VERIFIED**. Do not silently label it a new SRS feature or an accepted test case.
- **Evidence:** PR #155; GitHub Actions #42394048779 9/9 PASS; QA D1 migration applied, existing case preserved; QA web/backend surgical deployments verified without unrelated module changes. Real authenticated customer acceptance **NOT_RUN**, production untouched.


## R109 — Owner-requested implementation progress for remaining legal UC (2026-11-08)

- **Direction:** Stop developing Google Drive/OneDrive functionality; make measurable progress on remaining AI Law SRS use cases with synthetic QA data, without asking owner for routine technical approvals. The private v1.1.15 baseline is unchanged and clause-by-clause mapping remains NOT_VERIFIED in this context.
- **Source-only QA interface added:** Authenticated per-matter request form for all 11 UC labels. UC01/02/03/04/05/06/07/08/09 call Workers AI to produce **unverified review drafts** solely from user-pasted fictional source text. UC10/11 search only that fictional text and **do not** implement official case law or statutory search; no invented court decisions, URLs or article authority.
- **Security/operations:** One QA-only D1 quota table, max 12 AI calls per current user per UTC day. Authorization uses active MatterACL and deny override; sources and outputs are not stored in application D1; explicit fictional data consent and size limits. The input may be processed by Cloudflare Workers AI, so no real client/legal personal data is authorized in this QA stage.
- **Production and test gates:** Public/source CI synthetic and real provider smoke PASS, Cloudflare QA website/backend readback PASS, but authentic end-user E2E and legal answer correctness NOT_RUN; original DOCX/PDF/Word Track Changes, official corpus retrieval, revision/audit+review approval and full SRS release gates remain separate and incomplete. Owner final acceptance pending.
- **Evidence:** [R109 draft PR #157](https://github.com/ntdung-tds/Mihy-Law-Agent/pull/157), [CI #42397098574](https://github.com/ntdung-tds/Mihy-Law-Agent/actions/runs/42397098574), [QA acceptance matrix](../deployment/cloudflare/QA_R109_LEGAL_TEXT.md), [non-storage project checklist #156](https://github.com/ntdung-tds/Mihy-Law-Agent/issues/156).


## R110 — QA security correction only; no SRS v1.1.15 baseline revision (2026-11-08)

The existing eleven-UC R109 synthetic-text QA surface is unchanged. R110 adds a bounded streaming request reader and rejects explicit nonexistent AI source-anchor identifiers, including long ones; existing MatterACL, tenant login, quota, provider selection and source/output non-persistence are preserved. Real legal correctness, full PDF/DOCX workflow, official Vietnamese law retrieval and acceptance remain unverified. This is a technical correction to existing QA implementation, **not a new SRS requirement**. PR #159, CI #42407576294 PASS 9/9, QA-only backend deploy `301ecbe7-5a2e-47f9-9962-56b44ad2b26f`; production untouched. PR #158 duplicate was closed unmerged.
