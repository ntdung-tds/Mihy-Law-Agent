# AI Law — R0 product release decision (R35)

**State:** PRODUCT_NOT_READY. **D01 policy: OWNER APPROVED. Platform operator: IAICT.** The earlier five-persona static showcase and PostgreSQL seed are synthetic-only test aids; the Owner-defined demo acceptance target is **real authenticated accounts for different customer roles** with real staging E2E. They are not equivalent.

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
