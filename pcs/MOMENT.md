# AI Law — PCS Chat Solo MOMENT

- **Repository:** `ntdung-tds/Mihy-Law-Agent` (Public; canonical branch `main`)
- **State revision:** `2` (canonical: `pcs/STATE.json`)
- **Updated:** `2026-11-03T02:08:30Z`
- **Phase:** `POC` — not production; Owner acceptance pending
- **SRS candidate:** v1.1.15, Owner-provided archive SHA-256 `bda7199181060f178f6ba6f6008a029c1b9ff576392c66792b93d822e74d932f` verified; source package kept outside Public repo. Owner has not signed baseline.

## Verified in this checkpoint

- ZIP CRC OK; manifest checksum matches **157/157**; nested contract checksum **145/145**; included `check_contracts.py --docx ...` returned `STATIC_CONTRACT_AND_WORD_PASS`, 132 requirements / 79 application TC **NOT_RUN**.
- Corrected task `AL-POC1-002` traceability: Track Changes crosses `TC02C`, `TC07C`, `TCE2E-02` (not `TCE2E-01`, which is about the legal source flow).
- `AL-POC1-001` remains **TECH_DONE** with scoped bug fix: enforced Word `documentProtection` is rejected. Bug reproduced before patch, unit regression **10/10 PASS** after patch.
- Offline OOXML simulation on the provided *synthetic* tracked DOCX gave expected Accept `30 ngày` and Reject `15 ngày` content; LibreOffice render/visual check passed for both. **Not** a Microsoft Word GUI E2E test. The initial independent helper's Reject output failed an XML content assertion; re-tested with corrected OOXML unwrapping, not accepted as Word evidence.

## Active task / blockers

- `AL-POC1-002` — **BLOCKED** pending actual Word UI Accept/Reject and application `TCE2E-02` approval invalidation flow. Word UI test and all 79 application TC are **NOT_RUN**. No POC is Owner-accepted.
- POC2 official 10-PDF ingestion and POC3 actual PostgreSQL RLS remain **PLANNED**, not performed.
- Next: run Word UI on controlled fixture, then exercise `TC02C`, `TC07C` and `TCE2E-02` once application flow and approvals exist. GitHub CI is **not independently verified** by this local test run.

## Publication boundary

Only public-safe metadata, checksums and synthetic POC code/tests may be committed. Original SRS contents, customer legal files, and credentials are not committed.
