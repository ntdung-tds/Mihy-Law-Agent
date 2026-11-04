# AI Law — R31 demo customer and production readiness

**Status: DEMO DATA FIXTURE ONLY. NOT A DEPLOYED PRODUCT.**

## Demo customer
The isolated PostgreSQL seed `db/demo/seed_r31_synthetic.sql` creates two **fictional** organization tenants, three synthetic principals, two synthetic matters, explicit MatterACL read permissions and membership roles. `db/demo/customer_catalog.json` contains non-sensitive display labels and stable IDs. No real names, phone numbers, passwords, legal documents or authentication credentials are stored. No live account has been created at an identity provider. The second tenant is a negative-test boundary; `tenant_admin` does not automatically receive matter read rights.

**Reproduce:** only in a disposable PostgreSQL 16 test database, run the R30 migration followed by the R31 seed; alternatively run the existing CI `postgres-rls` job which executes `test_r31_demo_customer_seed_and_cross_tenant_negative_cases` against a temporary database. The R30 tests drop `ai_law` schema and MUST NEVER be run with a production/staging/shared DSN.

## What is necessary before any product launch

| Gate | Acceptance evidence required | Current status |
|---|---|---|
| Baseline scope | Owner-confirmed SRS v1.1.15 and final feature acceptance matrix; any proposed changes recorded in `srs_changed.md`, not silently applied | SRS unchanged; product acceptance NOT_RUN |
| Identity and accounts | Actual approved IdP/JWKS verification, real sign-in/sign-out, session revoke, tenant switching, MFA/step-up and TC12A/B against controlled test identities | NOT_RUN; demo principal records are NOT accounts |
| Data isolation | Production-equivalent non-BYPASS role, pooled transaction scope, SQL-injection/tenant GUC tampering assessment, cross-tenant tests on every API, download, job and index | Partial real PostgreSQL 16 synthetic CI PASS; full review NOT_RUN |
| Durable application | Persistent TaskRun + matter association, full R0 UC03/UC04/UC07 workflows, provider integration and policy/versioned snapshots, actual failure/retry/error handling | NOT_RUN; R28 uses synthetic in-memory run |
| Legal data & vendors | D01 signed evidence, provider/DPA/retention decisions, `GATE-LEGAL-DATA` and conditional D03/D05/D07 decisions as applicable | PENDING |
| Security and operations | Secrets management, immutable audit/outbox, backups + restore drill, encryption, rate limits, observability, disaster recovery, privacy/retention and incident response | NOT_RUN |
| Quality | Full SRS acceptance test traceability, cross-browser/mobile E2E, negative authorization and security test run, real DOCX Microsoft Word Accept/Reject where required | NOT_RUN; current CI only covers slices |
| Release process | Isolated staging, smoke/UAT with synthetic data, documented rollback, release candidate and final owner approval | NOT_RUN |
| Production | Deploy only after all required gates PASS and explicit owner authorization for production cutover | BLOCKED; NO PRODUCTION DEPLOY |

## Controlled progression

1. **R31 (this PR):** prepare a safe fictional customer fixture and repeatable PostgreSQL tenant/ACL negative test. No login URL or live deployment is claimed.
2. **R32 and onward:** implement only the next approved SRS task contract, verify actual IdP and persistent data layer in isolated staging, then expand to end-to-end workflows in small reviewed PRs.
3. **Pilot:** provide the Owner a real staging login only after approved IdP, synthetic test accounts, browser E2E and security gates. Keep pilot data synthetic until the legal-data gate is signed.
4. **Production:** require explicit Owner final acceptance of all SRS launch criteria and separate deployment approval. Never promote the current R0 preview or this fixture as the completed legal AI product.

**Existing UI:** https://ai-law-r0-preview.iaict-platform.workers.dev/#overview — static demonstration only; not a live legal assistant.

**Evidence:** `tests/evidence/AL-R0-R31-DEMO-2026-11-04.json`. No real client account or document is required to execute this test.
