# AI Law — PCS Chat Solo MOMENT

- **Repository:** `ntdung-tds/Mihy-Law-Agent` (public).
- **PCS revision:** `21` (source of truth `pcs/STATE.json`).
- **Updated:** `2026-11-03T15:37:38.791Z`.
- **Phase:** R0 mobile-first UI preview; design **SAVED AS REFERENCE** on Owner request, **not** full R0 application acceptance.
- **SRS:** v1.1.15 remains private and unchanged.

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
