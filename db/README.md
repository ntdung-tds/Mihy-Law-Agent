# R30 — Disposable PostgreSQL IAM/RLS integration (SRS v1.1.15)

**Scope:** One approved R30 technical batch; migration `db/migrations/0001_r0_iam_rls.sql` operationalizes the **specification-only** canonical IAM layout in a dedicated `ai_law` schema. This migration is currently **test-only**. It must not be run on any real customer or production database without independent DBA/security review, migrations/rollback planning, and the SRS release gates.

## Four bounded tasks

- **R30-01:** Provision a disposable PostgreSQL 16 service in GitHub Actions, apply IAM relational schema, maintain FK tenant consistency and approved-registry role checks (role catalog contains **no production seed**).
- **R30-02:** Enable **and FORCE** RLS on all tenant-sensitive physical tables; the test role has no superuser or BYPASSRLS and only SELECT grants. A transaction-scoped user/tenant setting controls rows, a security-invoker ACL view preserves base RLS, MatterACL user/group allow+deny rules enforce deny precedence and validity. Role/group changes advance `authz_version`; ACL changes advance `acl_version`; revoked membership cannot be silently reactivated. An audit metadata table records membership changes, **not** a complete append-only outbox.
- **R30-03:** `r0_core.postgres_scope` binds user/tenant in a fresh DB transaction. `PostgresMembershipRepository` (R26) and `PostgresMatterRead` enforce real SQL RLS in R28's existing `GET /v1/runs/{id}` WSGI seam. This test retains a fake token verifier, synthetic session/tenant resolver, test-only run-to-matter mapping and in-memory TaskRun: **neither identity provider nor run store is real**.
- **R30-04:** CI has separate `unit` (no DB required) and `postgres-rls` (actual disposable PostgreSQL 16) jobs. The PostgreSQL job must run on each PR/push, not merely compile SQL. Test case and release-gate evidence lives in `tests/evidence/AL-R0-R30-POSTGRES-2026-11-04.json`.

## Security assumptions / blockers

- Application-generated `app.verified_user_id` and `app.verified_tenant_id` are ordinary PostgreSQL custom settings, **not independently authenticated capabilities**. Only trusted server middleware may construct scope and issue SQL; permitting untrusted SQL or changing these GUCs is a security failure. Review real role privileges, parameterization, connection pools, transaction boundaries and SECURITY DEFINER paths independently.
- `ai_law.actor_user()` / `actor_tenant()` and RLS deny rows when verification settings are missing. Do not reuse connections with session-scoped tenant claims; only transaction-local values are used here. The dedicated runtime test role is not table owner and cannot write rows.
- The migration's constraint trigger rejects active membership without a valid role at transaction COMMIT. Changes to membership roles/group membership update `authz_version`; MatterACL changes update `acl_version` atomically and preserve surviving grant revisions.
- **Not implemented or verified**: production IdP/OIDC/JWKS signature verification, persisted session revocation and MFA, production-equivalent non-bypass credentials, immutable event outbox/audit shipping, RLS effects across all services (search, files, jobs, download proxies), actual TaskRun repository and run-to-matter relation, tenant-wide retention/invalidation, schema rollback/forward migrations and load/performance tests.
- **GATE-D01-R0 remains PENDING_EVIDENCE, GATE-LEGAL-DATA remains PENDING_APPROVAL, GATE-IAM-RUNTIME remains unaccepted** despite these real PostgreSQL synthetic CI tests. Neither production nor staging was deployed. No real customer documents were used.

## Reproduce in isolated test environment

Set up a *disposable* PostgreSQL 16 instance and set `AI_LAW_TEST_PG_DSN` to its administrator-owned test connection string. Install the isolated driver `python -m pip install "psycopg[binary]>=3.2,<3.4"`, then run:

```bash
python -m unittest discover -s tests -p 'test_r0_postgres_integration.py' -v
```

**WARNING:** The test class drops `ai_law` schema in its database and uses a synthetic local test role. Never supply a shared/staging/production DSN. CI uses a dedicated disposable PostgreSQL service.
