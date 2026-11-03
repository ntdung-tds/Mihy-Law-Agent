# AI Law — PCS Chat Solo MOMENT

- **Repository:** `ntdung-tds/Mihy-Law-Agent` (Public; canonical `main` only after PR merge).
- **State revision:** `14` (canonical source: `pcs/STATE.json`).
- **Updated:** `2026-11-03T11:02:21Z`.
- **Phase:** POC1 technical preparation; no Owner acceptance or production deployment.
- **SRS baseline:** Owner-provided v1.1.15 previously checksum-verified; original remains private and unchanged.

## R14 — FR14-03 approval invalidation domain slice

- **AL-POC1-005 TECH_DONE**, narrow pure-Python domain helper `poc_approval/invalidation.py`. An immutable approved record binds output version and SHA-256, source snapshot and policy. A stale binding emits a new `ApprovalInvalidation`-shaped event instead of rewriting the prior approval.
- A real **synthetic DOCX byte test** changes `15` to `16` (one character) with a successor product version. It triggers `product_changed`; the old approved hash/record remains unchanged. Source snapshot or policy changes also invalidate; wrong hash without a new version is rejected.
- Two defects found and fixed during local negative testing: invalidation timestamp earlier than original approval was accepted; a malformed non-string decision raised uncontrolled `TypeError`.
- **Local tests:** **87/87 PASS** (72 prior + 15 new) and compileall PASS. SRS v1.1.15 private static contract checker returned `STATIC_CONTRACT_AND_WORD_PASS`, 145 contract checksums; locally validated generated events against private `ApprovalInvalidation` schema.
- **PR #19** merged as `6d98d0ddb7d43cc4bcafa3f083825fec67bffc64`; final PR head `2aafc93aa623277a6684257dd3d2ae5fe20e49ad`; GitHub Actions run `41624122919` completed `success` (unit job and unittest step PASS).
- **Drive:** synthetic R14 test-run ZIP uploaded into existing authorized private evidence folder; file `AL-POC1-TR-20261103-R14_approval_invalidation_synthetic_evidence.zip`, size **71890 bytes**, metadata read back. No private Drive file ID published to GitHub.
- **Public-safe evidence:** `tests/evidence/AL-POC1-APPROVAL-R14-2026-11-03.json`.

## Open acceptance gates — not masked by this POC

- `AL-POC1-002` remains **BLOCKED**: Microsoft Word Desktop Accept/Reject, real Word-saved/reopened files and screenshot/tester/version/test_run_id **NOT_RUN**.
- Application `TC02C`, `TC07C`, `TC14B` reviewer authorization, `TCE2E-02` approval invalidation E2E **NOT_RUN**. This pure helper does **not** supply authenticated reviewer identity, persistence, concurrency safety or real app end-to-end evidence.
- POC2 authorized legal PDFs / POC3 real PostgreSQL RLS remain PLANNED; no Owner acceptance and no production.

## Next action

Run real Microsoft Word Desktop review on controlled R12 kit, record private GUI evidence, then build/test the application authorization and transaction-safe approval flow as separately authorized SRS slices. Owner gives final acceptance; do not change v1.1.15 baseline automatically.

## Publication boundary

Original SRS, legal/customer data, private Drive IDs, credentials and screenshots remain out of Public GitHub.
