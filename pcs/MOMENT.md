# AI Law — PCS Chat Solo MOMENT

- **Repository:** `ntdung-tds/Mihy-Law-Agent` (Public, Owner-selected; canonical branch `main`)
- **State revision:** `1` (source of truth: `pcs/STATE.json`)
- **Updated:** `2026-11-03T01:52:33Z`
- **Phase:** `POC` — not production, no Owner acceptance yet
- **SRS:** v1.1.15 referenced as locked, but original source artifact **not verified** in this repository/session; do not expand scope

## Most recent verified work

- `AL-POC1-001` — **TECH_DONE**: single-run JSON replacement generates real `w:del` and `w:ins`, preserves unrelated ZIP parts and MC namespaces; fails closed on ambiguous/unsupported edits.
- Local unit checks: **7/7 PASS** using synthetic `.docx` inputs. LibreOffice rendered one synthetic sample without errors; visual page check performed. This is **not** Microsoft Word test evidence.
- CI configured via `.github/workflows/tests.yml`; remote CI run must be checked after push, not assumed green.

## Now / next

- `AL-POC1-002` — **BLOCKED**: locked v1.1.15 / TCE2E-01 artifact and real Microsoft Word accept/reject validation outstanding.
- POC2 legal PDF ingestion, then POC3 PostgreSQL RLS stay **PLANNED**, no real test evidence yet.
- Next: inspect GitHub CI, locate SRS acceptance contract and run real Microsoft Word test. No production deployment or SRS changes are authorized by this checkpoint.

## Publication boundary

Only public-safe metadata and synthetic POC code/tests have been approved for this repo's initial checkpoint. No client documents, official PDFs, original SRS content or secrets.
