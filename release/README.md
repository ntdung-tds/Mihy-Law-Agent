# AI Law — R0 product release decision (R41)

**State:** PRODUCT_NOT_READY. **D01 policy: OWNER APPROVED. On standalone IAICT is an ordinary customer; future IAICT SaaS operation is deferred.** The earlier five-persona static showcase and PostgreSQL seed are synthetic-only test aids; the Owner-defined demo acceptance target is **real authenticated accounts for different customer roles** with real staging E2E. They are not equivalent.

## R41 — Operator QA kit tested, permanent staging still unavailable

Two local independent Docker+PostgreSQL16 QA installations ran 10 credentials, membership/MatterACL and real Chromium 1440/390/320 checks before and after stop/restart. RSA keys and database accounts were unchanged. CI 41793096574: PASS all eight jobs.

The deployment kit and operator runbook are ready for an authorized standalone host, but no durable Docker host is connected; the Owner-saved R40 bundle was not applied to a permanent staging server. Full legal AI workflows, authenticated workspace discovery, approved IdP/MFA, TC12 and final acceptance remain NOT_RUN. No public deploy or production.

## R40 — 10 named QA actor accounts, nonproduction SQL/HTTP tests and private credentials

A reusable public-safe manifest maps QA-01..QA-10 to RA-02..RA-09 (9 primary standalone, 1 independent second installation), with **actual existing** `lawyer` and `tenant_admin` roles and explicit MatterACL. Private owner-only Google Drive holds a separate credential bundle with 10 random passwords and Argon2id hashes; no secret links or hashes are placed in this public repository. A trusted operator may apply the SQL produced by `tools/r40_qa_provision.py` idempotently on a **private QA-only PostgreSQL16** installation.

GitHub Actions `41788819557`: all SEVEN jobs PASS including actual credential-based HTTP login for QA-01..QA-10, multi-membership, tenant_admin denial, revoked/disabled accounts, limited two-case read ACL, cross-installation signing key isolation, same SQL idempotency, Docker Compose down/up data persistence and mismatched private secret bundle refusal.

**Status NOT READY:** The CI installs were destroyed after tests and the owner-saved bundle has NOT been applied to any durable owner-accessible staging host. `delivery_modes.dedicated.deployment_e2e`, `APPLICATION_E2E`, full TC12, legal AI UC cases, canonical production IAM, MFA and backup remain NOT_RUN. Do not mark real customer accounts activated, enable SaaS or deploy production. D01 Owner-approved and SRS baseline v1.1.15 stay unchanged.

## R39 — browser sign-in real against disposable standalone stack, NOT full application E2E

Playwright/Chromium actually opened and used the `web/r0-standalone` login UI at **1440, 390 and 320 px**, via a same-origin local-only BFF and a separate R38 Argon2id account service with SQL session, RS256 JWT, R37 GET run and PostgreSQL16 FORCE RLS/MatterACL. Two separate Docker installations were used, and both host the identical UI/backend image; localhost cookie/CSRF, reload and logout are tested. GitHub Actions `41784653735` **PASS** all six jobs. Other legal AI functions are correctly labeled not connected.

**Do not mark `APPLICATION_E2E` PASS.** This is only a nonproduction narrow TaskRun GET fixture; no real user accounts on durable staging, upload, AI legal outputs, full TC12A/B, MFA, production security/operations, Owner acceptance or production authorization. `delivery_modes.dedicated.deployment_e2e` remains `NOT_RUN`, and `standalone_release_ready` remains false. SaaS later.

## R38: actual standalone credential test login in isolated Docker (not production IAM)

R38 provisions **disposable, invented** individual/organization/tenant-admin password accounts into isolated PostgreSQL16 fixture databases and performs actual `POST /standalone/auth/login` and `/logout` over a private Docker HTTP network. Argon2id verifies passwords, membership is checked against PostgreSQL RLS, a separate auth process signs an RSA JWT, and the application verifies that JWT/SQL session/MatterACL before returning the existing SRS GET /v1/runs/{id}. Account disable triggers session revocation, five bad passwords lock a disposable account, and authorization checks protect ordinary IAICT customer cases. GitHub Actions `41781535393` passes five jobs including real login.

**Important:** These test-only endpoints are private/local scaffolding, *not* an approved production IdP, public SRS auth contract, persistent live user directory or self-registration. External IdP, MFA, actual customer account activation, browser login and entire R0 legal workflows are not complete. Production remains NOT_AUTHORIZED and the Owner must still accept the complete standalone result. SaaS implementation is still postponed by Owner.

## R37: actual isolated API+PostgreSQL one-route test; not customer product

R37 tests real Docker standalone HTTP API, actual disposable PostgreSQL16 persisted synthetic sessions and queued runs, RSA-signed JWT and MatterACL/RLS. The `standalone-api` CI job passed on 2026-11-04 (run 41774950797), with no public API/DB port and no privileged SQL application role. This **does not** implement real account login or functional legal workflows, and does not satisfy full dedicated app acceptance. `delivery_modes.dedicated` is PARTIAL_TESTED, `deployment_e2e` NOT_RUN and `standalone_release_ready` false.

## Owner DEC-016 priority: standalone FIRST (2026-11-04)

The active product target is a **working independently installed AI Law**. IAICT is an ordinary organization customer tenant inside standalone, not a root operator for every deployment. IAICT-hosted shared SaaS is intentionally deferred until after standalone acceptance.

**Separate acceptance:** `tools.check_product_readiness.evaluate_readiness` now reports `standalone_release_ready`. It requires complete legal/security/functional gates, actual standalone deployment E2E PASS and evidence, real accounts, separate dedicated Owner final approval and dedicated production authorization. It does **not** require the deferred SaaS mode to PASS. `product_ready` remains the later *combined dual-delivery offering* gate. Both remain **false** today.

**R36 real CI:** `deployment/standalone/compose.yaml` and `deployment/standalone/smoke_isolation.sh` boot two isolated PostgreSQL16 database instances and verify no exposed host ports, independent synthetic org tenants and restart durability. This is **not** a functioning AI Law application or proof of user login, storage or workflow E2E. Production migration is not approved.

## Two required delivery modes — Owner DEC-015 (2026-11-04)

The Owner explicitly requires both the **IAICT-hosted shared SaaS** and **dedicated customer installation** (separately hosted/private cloud/on-premises) to be **implemented and tested** using the **same application code, migrations, authorization and R0 legal workflows**. Dedicated installation must not be omitted or automatically delayed until after SaaS is considered complete. See `deployment/README.md`, `deployment/modes.json` and `srs_changed.md` for the decision, current work and proposed SRS alignment.

The readiness checker now requires **actual deployment E2E PASS evidence for both** `delivery_modes.saas` and `delivery_modes.dedicated` before declaring the full dual-delivery product ready. A signed-JWT CI test or a static frontend cannot satisfy either installation test. Both are currently NOT_RUN, and production remains unauthorized.

## Evidence-driven gate order

1. **Authority and legal basis:** D01 policy is approved by the Owner; separately complete the remaining formal D01-R0 evidence and the independent GATE-LEGAL-DATA checks (D03/D05/D07, D02 if real corpus, D04 if external AI/OCR); name the legal operator; complete applicable data-processing contracts and service-condition legal review. Owner approval of D01 design alone does not authorize customer data.
2. **Actual authentication:** build **real test customer accounts with different roles** and select/configure an authorized IdP with validated JWT signature/JWKS, MFA/session revocation and real tenant membership mapping. Verify client/user provisioning using sanctioned synthetic accounts.
3. **Runtime tenant safety:** independently verify PostgreSQL RLS under production-equivalent least-privilege database credentials, with controlled transaction scope, pool boundaries, audit/outbox and protection against SQL/user-config forgery. R30 proves only an isolated fixture.
4. **Document ingestion and storage:** implement approved SRS API, DOCX/PDF secure upload, quarantine, immutable original, extraction, OCR and document/MatterACL. Test wrong MIME, malicious content, size/page limits, retention and rollback.
5. **Task lifecycle and R0 workflows:** implement persistent TaskRun/job pipeline and SRS-defined UC03 translation, UC04 summarization and UC07 grammar assistance with actual providers, grounded results, coverage/error semantics and DOCX/Word behavior where required. The earlier R25 catalog is not callable AI functionality.
6. **Full negative and usability QA:** TC12A/B real app switching/permissions, revocation during jobs, cross-tenant/cross-file leakage, browser responsive/mobile, accessibility, load, incident/backup/restore and staged security testing.
7. **Release candidate to production:** stage with synthetic/sanctioned accounts only; pass CI, security and legal gates; prepare rollback/monitoring; submit observed evidence and actual product to Owner for final acceptance. **No automatic production deployment.**

## Source of truth

- Technical/functional baseline: private AI Law SRS v1.1.15, unchanged.
- PCS state: pcs/STATE.json and pcs/MOMENT.md.
- Release evidence: release/product_readiness.json (not production credentials) and tests/evidence/.
- Readiness command: python -m tools.check_product_readiness release/product_readiness.json --json.
- Exit code 3 means not ready. A zero exit only indicates all recorded gates and Owner acceptance fields are present; it is NOT a replacement for independent release approval or security testing.
- Demo tests: tests/test_r31_demo_customers.py, disposable PostgreSQL 16 CI.

This checklist does not introduce new features beyond SRS or authorize production. Missing external services, legal evidence and unimplemented SRS business functionality are marked BLOCKED/NOT_RUN, never fabricated PASS.
