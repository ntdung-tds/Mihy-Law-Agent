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


### R104 implementation refinement — Owner-approved single Save action (2026-11-07)

- **Supersedes R103 customer-facing folder-administration UI:** In the existing AI Law Documents form, the user presses one **Lưu** button, opens Google Drive / OneDrive destination selection, and explicitly chooses an existing permitted folder **or the account's My Drive root**. Cancel does not upload. The application does not create, assign, relocate, or auto-pick folders. Multiple locations are available for browsing, but each Save writes one file to one explicitly selected destination, never to all.
- Existing AI Law authentication is reused; a separate Google/Microsoft grant is necessary **only if** the user account lacks appropriate provider authorization. The tenant-admin's existing Drive grant cannot be silently treated as an individual employee's Drive account.
- **Security/technical conditions:** Provider OAuth scopes and folder canAddChildren, user/provider account, installation/tenant and MatterACL, cancellation, duplicate prevention, provider proof and verified download. Google Picker needs an enabled API and a referrer-restricted public key. A successful source CI is not a real user/provider test.
- **Implementation checkpoint:** PR #154 draft based on R103, GitHub Actions 9/9 PASS and QA Worker readback. The Google Picker API key is not configured, so real folder selection is **BLOCKED**; signed-in Google and mobile end-to-end **NOT_RUN**; OneDrive **NOT_IMPLEMENTED**. No production and no change to private baseline SRS v1.1.15 until Owner final approval.
