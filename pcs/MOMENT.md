# AI Law — PCS Chat Solo MOMENT

- **Repository:** `ntdung-tds/Mihy-Law-Agent` (public).
- **PCS revision:** `22` (source of truth `pcs/STATE.json`).
- **Updated:** `2026-11-03T16:28:00.000Z`.
- **Phase:** R0 mobile-first UI preview. R20 design **SAVED AS REFERENCE**; R22 scoped mobile filter fix deployed to isolated preview, **not** full application acceptance.
- **SRS:** v1.1.15 remains private and unchanged.

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
- **Live preview:** `https://ai-law-r0-preview.iaict-platform.workers.dev/` currently serves this design; it is a **mutable preview URL**, not the immutable snapshot.
- **R20 verified baseline:** 115/115 CI PASS; scoped Chromium widths 320, 390 and 768px PASS. Physical-device review and actual app/backend E2E remain unverified.
- **Owner intent:** save a design checkpoint for reference / rollback, not to approve R0 functionality, release to production, authorize true client data or alter the SRS.

## Follow-up

Continue future UI revisions on separate task branches, preserving the saved R20 branch and source commit. Owner is the final project acceptor. POC1 stays ON_HOLD; POC2 and POC3 remain PLANNED.

## Publication boundary

Synthetic preview source and public-safe PCS notes only. No internal SRS, genuine legal/client data, secrets, screenshots or private Drive identifiers.
