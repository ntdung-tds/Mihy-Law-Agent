# AI Law — PCS Chat Solo MOMENT

- **Repository:** `ntdung-tds/Mihy-Law-Agent` (public).
- **PCS revision:** `25` (source of truth `pcs/STATE.json`).
- **Updated:** `2026-11-03T22:54:49.848Z`.
- **Phase:** R25 flat-block R0 Overview now deployed to nonproduction preview with 11 status-only UC tiles; source Chromium and CI passed. Owner final visual acceptance pending; real legal workflows remain unimplemented.
- **SRS:** v1.1.15 remains private and unchanged.

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

Continue functional R0 slices on separate task branches while retaining the saved R20 design and R25 updated preview. Owner is final project acceptor; POC1 stays ON_HOLD, POC2 and POC3 remain PLANNED.

## Publication boundary

Synthetic preview source and public-safe PCS notes only. No internal SRS, genuine legal/client data, secrets, screenshots or private Drive identifiers.
