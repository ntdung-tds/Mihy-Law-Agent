# AI Law — R31 demo customers and safe usage

The canonical, **synthetic-only** fixture is demo/customers.json, copied identically to web/r0-demo/customers.json. Automated tests verify both copies match.

| Scenario | Demo identity | Tenant | Right | Visible synthetic labels |
| --- | --- | --- | --- | --- |
| personal | Luật sư Demo A | Personal | lawyer | DEM-P01, DEM-P02 |
| organization | Luật sư Demo A | Organization | lawyer | DEM-O01, DEM-O02 |
| org_admin | Quản trị Demo B | Organization | tenant_admin | None: admin has no implicit matter read |
| org_lawyer | Luật sư Demo C | Organization | lawyer | DEM-O01, DEM-O02 |
| outsider | Khách ngoài Demo D | Organization | none | None |

There are **2 tenants, 4 fake identities, 4 synthetic active memberships, 2 matters, 4 document names and 5 scenarios**. No actual passwords, IdP accounts, legal case files, processing results or real client identities have been created.

## Run the static demonstration

From the repository root:

    python -m http.server 8767 --directory web/r0-demo

Open http://127.0.0.1:8767/. The browser loads local synthetic JSON only. Persona switching clears local search/selection. The revoke/cross-tenant controls are **UI simulations**; they do not revoke real access. The JSON contains all non-sensitive demo labels, so no one should mistake this browser filter for a backend authorization boundary.

## Run with disposable real PostgreSQL16

GitHub Actions' postgres-rls job runs both R30 and R31 tests on a disposable PostgreSQL 16 service. The seed helper writes synthetic principals, memberships, role mappings, matters and explicit user ACL. No document content is persisted.

For optional reproduction against an isolated and empty local test database after the R30 migration:

    export AI_LAW_TEST_PG_DSN="postgresql://postgres:synthetic-ci-only@127.0.0.1:5432/ai_law_r30_synthetic"
    export AI_LAW_ALLOW_DISPOSABLE_DEMO_SEED=R31_SYNTHETIC_ONLY
    python -m demo.seed_demo

Both the CLI and the direct seed function reject non-disposable database targets. Do not point them to shared, staging or production data. Running the test suite in CI is safer than manual seeding.

## Verification and boundaries

- Unit/static: python -m unittest discover -s tests -p 'test_r31_demo_customers.py' -v
- Real PostgreSQL 16: in dedicated GitHub Actions job with an explicit disposable test DSN.
- Product readiness: python -m tools.check_product_readiness release/product_readiness.json --json (exit 3 means PRODUCT_NOT_READY).
- The live identity provider, full R0 UC03/04/07, stored TaskRun, actual document/ACL pipeline, audit/outbox and all real application E2E are **not implemented or accepted** by this fixture.
- SRS v1.1.15 baseline, R25 preview, R20 snapshot, D01 and other real-data gates remain unchanged.
