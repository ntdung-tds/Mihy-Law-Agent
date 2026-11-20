## R213 — F21 QA pending_review schema migration (2026-11-21 VN)

- Read four PCS files, issue #156, PR #256 HEAD/base, stacked PRs and R187 schema; checked R212 final-head Actions #44816019768 SUCCESS (synthetic tests only). R187 already includes audit insertion guard R190; R212 adds overlapping guard, not proof of live integration.
- Draft PR #257 stacked on #256 adds isolated QA SQLite migration for draft → pending_review → approved with table rebuild, guard/audit trigger update, immutable approval, optimistic version and legacy row preservation. Seven synthetic tests and CI workflow added. **R213 final-head CI NOT_VERIFIED**; no D1 migration applied or live Worker adapter.
- F21 PARTIAL; real verified session, qualified lawyer, active membership, MatterACL allow-minus-deny, assignment in same transaction, signed-in desktop/mobile E2E NOT_RUN. R126 BLOCKED/NOT_RUN. Frozen SRS v1.1.15, PCS revision140, protected AL-R0-DEPLOY-001; no signing, OAuth retries, customer data, merge or production deploy.

## R212 — F21 audit insertion integrity guard (2026-11-21 VN)

- Read PCS STATE/MOMENT/scope/SRS register, issue #156, open stacked PRs including #255 and R187 schema; avoid changes to protected AL-R0-DEPLOY-001 and frozen SRS v1.1.15.
- Test-first synthetic SQLite regression adds four cases for forged audit before approval, legitimate legacy atomic approval, mismatched version/actor and cross-tenant insertion. Additive QA migration adds BEFORE INSERT audit guard matching approved output state/version/reviewer/time; no migration applied to D1.
- **CI NOT_VERIFIED** until R212 final HEAD workflow runs and logs checked. F21 PARTIAL: pending_review schema and trigger incompatibilities remain; verified session/qualified lawyer/MatterACL atomic approval and signed-in E2E NOT_RUN; R126 BLOCKED/NOT_RUN. No signing, OAuth retry, customer data, merge or production deploy.

## R210 — F21 receipt accessor fail-closed (2026-11-20 VN)
