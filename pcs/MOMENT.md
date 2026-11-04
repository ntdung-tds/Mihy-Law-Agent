# AI Law — PCS Chat Solo MOMENT

- **Repository:** `ntdung-tds/Mihy-Law-Agent` (public).
- **PCS revision:** `30` (source of truth `pcs/STATE.json`).
- **Updated:** `2026-11-04T01:01:42.890Z`.
- **Phase:** R30 four-task actual PostgreSQL16 synthetic RLS/ACL integration TECH_DONE in disposable CI. R31 live IdP/staging/real run store NOT_STARTED. D01 and real-data gates remain pending; R25 UI unchanged.
- **SRS:** v1.1.15 remains private and unchanged.

## R30 — one-batch PostgreSQL16 IAM/RLS and synthetic getRun integration

- **DEC-012 / AL-R0-DB-001..004**: Owner approved a single grouped R30. Added isolated versioned `db/migrations/0001_r0_iam_rls.sql` with IAM tables, FK constraints, deferred active-role rule, membership audit metadata, FORCE RLS and read MatterACL with deny precedence. A nonowner and non-BYPASSRLS runtime role in CI cannot read other-tenant records or write data.
- **Authorization state:** trusted per-transaction database scope; role or matter-group change bumps `authz_version`, MatterACL changes bump `acl_version`; revoked membership cannot silently reactivate. Security-invoker `matter_acl` view does not bypass RLS. Existing R26 PostgresMembershipRepository and R28 `GET /v1/runs/{id}` use actual PostgreSQL for membership+MatterACL with an in-memory fake run store and fake bearer verifier.
- **Real CI evidence:** GitHub Actions run `41750910297` on R30 code branch: real PostgreSQL16 job **18/18 PASS** and separate standard unit job **195 PASS, 18 DB-only tests SKIPPED by design** (all executed in DB job). Verified local HTTP 200 when allowed and 404 after changing tenant/revoking. Earlier failed review cases—fixture setup, missing version triggers, active-role guard assertion—were fixed and retested. See `tests/evidence/AL-R0-R30-POSTGRES-2026-11-04.json`.
- **Not yet accepted as live IAM:** D01 formal signed evidence and legal-data Pilot approval pending; production JWT/IdP/MFA, persisted session and TaskRun store, full audit/outbox, SQL-injection/role/pool independent assessment, application TC12A/B E2E and actual customer data NOT_RUN. No staging/production deployed and baseline SRS v1.1.15 unchanged.
- **Next:** verify and approve real external identity + controlled isolated staging, production-equivalent DB/service roles, real run authorization storage and full app E2E before any gate change. Owner final acceptance pending.

## R29 — D01 Owner policy approval, formal/legal/security evidence still open

- **DEC-011 / AL-D01-GOV-001:** Owner explicitly approved the D01 multi-tenant customer/data-control policy on 2026-11-04. Personal and organization tenants; multiple membership; no silent cross-tenant files, no implicit tenant_admin/platform_operator matter read, no default client document model training or vendor processing. Per-flow legal roles require actual assessment. Policy approval does **not** equal a signed legal decision, certificate, data processing agreement, or production approval.
- **Source-of-truth:** Locked SRS v1.1.15 baseline has two relevant decisions: `GATE-D01-R0=PENDING_EVIDENCE` for activation of real identity/tenant, and `GATE-LEGAL-DATA=PENDING_APPROVAL` for Pilot with customer data. Synthetic R0 fixture work may proceed. D03/D05/D07 and scope-dependent D02/D04 remain separate.
- **Factual gates:** Named supplier legal entity not provided; written determination of Decree 356/2025/NĐ-CP Articles 21–25 applicability pending; DPA, actual data-flow role mapping and signed Owner evidence absent. Actual PostgreSQL RLS, MatterACL, verified identity and TC12 E2E NOT_RUN.
- **Artifacts:** Public-safe `pcs/decisions/D01_POLICY_R29.{json,md}`, D01 governance unit tests **9/9 PASS** and full repo **195/195 PASS** (CI `41747231230`); private Word/role/flow/gate/QA dossier rendered and its archive checksum verified. Private SRS was read only; source file, OpenAPI, release decision register and production unaffected.
- **Next:** Obtain formal evidence, legal conclusions, contract/vendor approvals and actual E2E before opening either release gate.

## R28 — grouped 3-task GET /v1/runs/{id} implementation, 4 review loops

- **One batch, three tasks:** AL-R0-FN-004 verified session ID after R27 checks; AL-R0-FN-005 SRS-approved `GET /v1/runs/{id}` WSGI ErrorResponse/TaskRun handler; AL-R0-FN-006 session-owned tenant, fresh membership, run ACL and cross-tenant masking. **PR #42 merged** `46a284940c624d0fba4ab69b45699e61a19d770f`. No new endpoint outside the SRS.
- **Four red→repair→green review loops:** initial missing handler, dependency failure HTTP 503 vs access 404 and unsupported run-ID maximum, typed IdP/service outage vs invalid token, and nullable TaskRun coverage/usage inconsistency. Synthetic test count grew to **186/186 PASS** at final PR-head GitHub Actions `41741449670`. See `tests/evidence/AL-R0-R28-GETRUN-TR-2026-11-04.json` for actual test-run history.
- **Real HTTP evidence:** standard-library WSGI ran on an ephemeral **127.0.0.1 loopback server** with fake signed verifier, principal, membership, ACL and run store; returned synthetic 200/401/404 as asserted. Additional direct WSGI unit cases exercise 400 and 503. No cloud API, JWT cryptography, user data, browser E2E or production deployment.
- **Unverified:** D01 security approvals, real IdP/JWKS/MFA, persistent session/active-tenant store, actual PostgreSQL FORCE RLS/MatterACL and real run repositories. Owner final functional acceptance PENDING. SRS v1.1.15 unchanged and immutable R20/R25 previews untouched.
- **Next:** provision security approvals and isolated real dependencies before staging integration and E2E; never describe synthetic WSGI as deployed R0 product.

## R27 — trusted bearer request boundary, unit-tested only

- **PR #40 merged** at `b797e9e94fae24ff9d9fd13458e2593828ea3917`. `r0_core/session_boundary.py` consumes Authorization Bearer through **injected external trusted verifier**, maps provider subject through authoritative internal identity store, rechecks active session, and invokes existing R26 tenant membership adapter. There is no new HTTP route, runtime token-verifier implementation or real IdP.
- **Test-first:** missing-module regression was an expected RED in run `41738147905`; final PR-head GitHub Actions run `41738492253` **161/161 PASS**, including **12 synthetic** auth/tenant boundary unit cases. This proves in-process adapter behavior, not JWT cryptography, MFA, HTTP 401/403 behavior, PostgreSQL RLS or actual logged-in UI.
- **Boundaries:** SRS v1.1.15 stays private/unchanged, D01 PENDING_APPROVAL. Do not use client-supplied claim objects as verified identities. No real data or production; immutable R20 snapshot and R25 live UI not touched. Private Drive test folder prepared, raw logs not uploaded.
- **Next:** implement a small approved /v1 request handler after trusted verification, configured session source and tenant/ACL gate are available; run isolated actual PostgreSQL/RLS and browser E2E before claiming IAM readiness.

## R26 — read-only relational membership adapter (FR12-01)

- **PR #38 merged** at `a638d73d09e96c279e4705ea8e52e7c761772376`: `r0_core/membership_repository.py` reads tenant, active principal, current membership and approved role registry using one parameter-bound DB-API query; existing core clears tenant-sensitive context on switch. No new HTTP endpoint introduced; R25 UI remains unchanged.
- **Tests:** expected initial red CI `41736074780`; two additional timestamp/revocation tests red in `41736459846`; fixed and rerun full GitHub Actions **149/149 PASS** on PR final head `41736855153`. 12 cases use isolated **synthetic SQLite** with a PostgreSQL placeholder translator; this is *not* actual PostgreSQL, RLS, live auth or browser E2E.
- **Gates remaining:** D01 security/role/owner approval is pending; do not use real customer data or enable real login/production. PostgreSQL migrations/RLS, actual IdP, session revocation, MatterACL, endpoint integration and E2E are NOT_RUN. A private Drive run folder exists but no raw test artifact was uploaded.
- **Next:** verify authenticated principal at a request boundary with SRS-aligned API workflow without inventing an unauthorized tenant-switch endpoint; test real PostgreSQL/RLS separately when available.

## R25 — flat 11-UC blocks, informational modal click repaired

- **Owner direction DEC-010:** Approved styling refinement, not expansion. Same 11 UCs in three A/B/C categories; UC03/04/07 remain R0 developing, eight remain R1 planned. No private SRS v1.1.15 baseline edits, no backend or production.
- **PR #36 merged** at `3cecb226632121fb4eb709aa2d922fe1e451d0fc`. Minimal catalog CSS creates flat section/block grids, stronger border, stable hover/focus, highlighted R0 stripe; one-line JS selector fix lets all 11 info-only buttons function. Immutable R20 snapshot intact.
- **Tests:** pre-fix CSS red CI run `41732615109`; final code CI `41734140720` **137/137 PASS**. Source-branch actual Chromium verified **11/11** information-modal open/close; 390px group A and 1280px group B screenshots visually checked. 320px source Chromium: clientWidth=scrollWidth=320, box shadow none, single-column catalog. Deployed 320px Chromium: all 11 accessible labels in correct 3 R0 + 8 R1 split, group A screenshot visually checked.
- **Preview:** isolated `ai-law-r0-preview` Worker deployed with source readback of HTML/CSS/JS exactly matching merged main; production unaffected. Private Drive test-run folder prepared, but raw screenshots were not uploaded.
- **Open gates:** physical Owner visual acceptance NOT_RUN; live Worker click script-injection probe NOT_VERIFIED (source-equivalent Chromium interaction did PASS); actual AI/document/backend E2E NOT_RUN. No screenshot bytes in public GitHub.
- **Next:** Owner reviews R25 visual preview; then proceed to small SRS-aligned R0 authenticated principal/membership/API integration without expanding R1 workflows.

## R24 — 11 UC catalog on R0 nonproduction preview

- **Owner direction DEC-009:** Approved grouped display of 11 legal workflows as status-only entries. UC03 translation, UC04 summarization and UC07 grammar correction are shown as **R0 · Đang triển khai**; remaining 8 are **R1 · Sắp triển khai**. Nothing is marked usable. Private SRS v1.1.15 and actual release scope remain unchanged.
- **PR #34 merged:** `332e7cf345d4750bc3403d478d1abc8c6044bc79`. Changes limited to Overview HTML/CSS/preview modal info, README and 3 regressions. Saved `snapshot/r0-ui-mobile-r20-20261103` intact. Isolated `ai-law-r0-preview` Worker updated; all 3 assets read back equal merged main; production untouched.
- **Tests:** Expected preimplementation red CI `41729224471`; final green **133/133** run `41730222478`. Actual deployed Chromium 320px accessibility tree exposes **11 unique buttons** (3 R0, 8 R1); visual screenshots source group A 390px and live group B 390px passed scoped layout checks.
- **Still open:** Full live click/close-modal E2E not verified; 320px group C tall-element screenshot partial; physical Owner device testing NOT_RUN; private Drive test-run folder prepared but raw screenshot bytes not uploaded. Real AI/legal workflows and backend E2E remain NOT_RUN.
- **Next:** Owner checks current 11-UC preview. Continue smallest authenticated principal/membership/API integration task before connecting UC03/04/07. POC1 stays ON_HOLD.

## R23 — first R0 functional core slice (FR12-01 / TC12A)

- **Owner direction DEC-008:** R0 visual design is accepted as reference; start real functionality in small bounded tasks. This is not approval of production or authenticated end-to-end workflows.
- **PR #32 merged** at `0ed8da7bfc08822091a588ff6f99a737d950e7c4`: internal `r0_core/tenant_context.py` selects tenant only after checking trusted active principal/membership. Cross-tenant switches and authz_version changes reset document, matter, chat, search, suggestions and result references; unauthorized cases fail closed.
- **Actual CI:** 14 focused synthetic unit tests PASS; repository suite **130/130 PASS** in GitHub Actions run `41726706712` on PR final head. Evidence: `tests/evidence/AL-R0-FR12-01-TR-20261104-01.json`.
- **Not implemented:** actual authentication provider/session verification, API route, persistent tenant membership store, PostgreSQL RLS, document ACL or user login. The full SRS TC12A and browser functional E2E are **NOT_RUN**. Unit-only TECH_DONE does not mean application or security acceptance.
- **Next bounded task:** authenticated principal + membership adapter and API integration in nonproduction, with cross-tenant denial tests. Keep private SRS v1.1.15 unchanged, POC1 ON_HOLD, saved R20 UI snapshot intact; no production.

## R22 — document filter visibility repair, live preview verified

- **PR #30 merged:** `94c5fdc75b1ed68064db7bc483d75f90d0d2501a`. R22 targets only 320–390px document filter strip clipping and its unittest; 2×2 buttons at <=620px. Main CSS was deployed to isolated `ai-law-r0-preview` Worker; HTML and JavaScript unchanged.
- **Test-first:** initial new regression test intentionally failed CI run `41672607713`; final PR-head CI `41673660703` passed **116/116 tests** and JS syntax. Cloudflare Chromium branch static render and actual live preview at **320px** and **390px** show all four filter choices without clipping, with synthetic document rows in live render. Live Worker CSS readback exactly equals main.
- **Screenshot evidence:** images were inspected during tool execution, but raw bytes have **not** been uploaded to Drive. Private Drive test-run folder was created, but must not be linked from this public repo.
- **Not verified:** physical mobile Owner visual acceptance, full authenticated app/AI/legal workflows, exhaustive accessibility and interaction E2E. User-selected R20 snapshot `snapshot/r0-ui-mobile-r20-20261103` is untouched; SRS v1.1.15 remains private/unchanged.
- **Next:** Owner reviews `https://ai-law-r0-preview.iaict-platform.workers.dev/#documents` on physical mobile. Do not treat this as R0 application or design final acceptance.

## R21 — saved R0 UI visual reference

- **Owner request DEC-007:** “Lưu giao diện này lại.”
- **Immutable source commit:** `19f02b9e53ce9a2db733d2cfeb92c62eac01b26f`, merged in PR #28 after the R20 mobile typography/contrast/touch-target review.
- **Recovery branch:** `snapshot/r0-ui-mobile-r20-20261103`, created at the exact source commit above; confirmed `web/r0-preview/styles.css` includes R20 mobile legibility/touch adjustments. Branch URL: `https://github.com/ntdung-tds/Mihy-Law-Agent/tree/snapshot/r0-ui-mobile-r20-20261103/web/r0-preview`.
- **UI code:** `web/r0-preview/index.html`, `web/r0-preview/styles.css`, `web/r0-preview/app.js`. These code files remain **unchanged** by R21.
- **Live preview:** `https://ai-law-r0-preview.iaict-platform.workers.dev/` serves the later R22 mobile filter refinement; immutable R20 reference remains at the snapshot branch.
- **R20 verified baseline:** 115/115 CI PASS; scoped Chromium widths 320, 390 and 768px PASS. Physical-device review and actual app/backend E2E remain unverified.
- **Owner intent:** save a design checkpoint for reference / rollback, not to approve R0 functionality, release to production, authorize true client data or alter the SRS.

## Follow-up

Continue functional R0 slices on separate task branches while retaining the saved R20 design and R25 preview (unchanged by R26/R27). Owner is final project acceptor; POC1 stays ON_HOLD, POC2 and POC3 remain PLANNED.

## Publication boundary

Synthetic preview source and public-safe PCS notes only. No internal SRS, genuine legal/client data, secrets, screenshots or private Drive identifiers.
