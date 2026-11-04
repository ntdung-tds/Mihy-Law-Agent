# AI Law — SRS change log (proposal only; not the approved baseline)

## SC-001 — 2026-11-04 — Owner clarification on delivery modes

- **Owner decision:** AI Law must be built for **both** IAICT-hosted shared SaaS **and** standalone/dedicated customer installation (e.g. isolated instance, private cloud or on-premises). Dedicated deployment is not to be postponed or omitted.
- **Stable product:** one source code base, versioned schema/migrations, identical legal AI functions, authorization/data-protection semantics, and versioned test suite. Different environment/operations configuration, **not** two product branches.
- **Current implementation:** No actual dedicated install has passed deployment/E2E tests; do not mark ready.
- **SRS impact:** Check whether SRS v1.1.15 deployment/nonfunctional requirements already express both targets. If they do, clarify delivery acceptance only; if not, propose a narrowly scoped addition covering dedicated package/install/upgrade/rollback and per-mode E2E. No changes to use cases, role registry, D01 approval or existing SRS baseline are authorized automatically.
- **Synchronization:** Pending Owner decision when final SRS consolidation is requested; do not edit the private SRS baseline in this repository.
- **Code/test references:** `deployment/modes.json`, `deployment/README.md`, `tests/test_dual_delivery_contract.py`.

## SC-002 — 2026-11-04 — Owner confirms standalone-first rollout and IAICT as ordinary organization

- **Priority:** Finish deployable, real functional dedicated AI Law first; IAICT-hosted shared SaaS is deferred until afterward but not removed from long-term target. Do not require SaaS test completion before standalone-specific acceptance.
- **IAICT test context:** In standalone, IAICT is an ordinary customer organization / tenant, not a mandatory cross-installation root operator or centralized IAM owner. The system operator for each standalone installation is separately designated; no implicit file/case rights.
- **One core:** Same SRS business functions, identity authorization boundaries, schema migration logic and upgrade path regardless of later SaaS offering. No baseline edits automatically.
- **Actual scope started:** `deployment/standalone/compose.yaml` and CI smoke implement disposable isolated PostgreSQL16 infrastructure only, not a full standalone application or user login. No real client data or production.
- **Approval:** Owner decision recorded as DEC-016; further SRS language alignment awaits Owner consolidation.

## SC-003 — 2026-11-04 — Standalone local account login test adapter (nonproduction only)

- **User-approved behavior:** A customer in a private standalone AI Law installation is issued an account by the installation operator, signs in using email/password, selects an authorized personal/organization workspace if applicable, and uses the existing legal AI functions. IAICT is an ordinary test organization in standalone; IAICT-hosted SaaS implementation remains deferred by Owner.
- **R38 implementation:** Separate internal nonproduction authentication container checks an Argon2id password hash in a PostgreSQL account table, validates current membership/role registry under RLS, issues a short-lived RSA-signed JWT with a server-created session; the read-only API independently verifies JWT signature and rechecks session and MatterACL. The only routes `POST /standalone/auth/login` and `POST /standalone/auth/logout` are **private test fixture routes**, not a replacement for approved public SRS API contracts.
- **Potential SRS alignment for future product:** Confirm the exact approved account creation, local authentication versus IdP/OIDC, MFA/step-up, password reset, secure secrets, auditing, tenant/context switch, logout, and long-lived installation requirements with the private SRS v1.1.15. The production provider, canonical IAM migration, user UI and external login contract remain pending independent review.
- **No automatic baseline revision:** Do not publish or modify SRS v1.1.15 in GitHub; this note is only a proposal for future Owner-controlled synchronization. No new product feature approval, user role key, public endpoint, real customer activation or production deployment follows from the test-only adapter.
- **Evidence:** `tests/evidence/AL-R0-R38-STANDALONE-LOGIN-2026-11-04.json` and GitHub Actions `41781535393` (five CI jobs PASS; nonproduction local account test).

## SC-004 — 2026-11-04 — Browser UI + standalone test-only session gateway

- **Owner-approved direction unchanged:** finish one usable standalone AI Law product before IAICT SaaS. IAICT is an ordinary organization/tenant within the current standalone nonproduction tests.
- **R39 test implementation:** `web/r0-standalone/` and `r0_core/standalone_browser_gateway.py` connect email/password test sign-in and workspace selection to the R38 test-only identity service, signed JWT and PostgreSQL RLS/MatterACL under a local loopback BFF. Browser uses an HttpOnly SameSite cookie; no JWT is placed in browser storage. A public synthetic workspace dropdown is **test-only display data** and not an acceptable customer user-directory design.
- **SRS impact to verify at final consolidation:** Align the production-approved login page, authenticated workspace discovery, session/cookie security, tenant switch, real login/logout API, CSRF protection, MFA/step-up, identity provider choice and browser acceptance matrix with SRS v1.1.15. Do not treat private `/api/*` and `/standalone/auth/*` fixture routes as newly approved SRS public endpoints.
- **No baseline update:** This is only a changed-requests log, not permission to revise SRS or expose a service publicly. Real customer account provisioning, standalone persistent staging, canonical migrations, legal AI and document cases, and deployment remain gated.
- **Evidence:** `tests/evidence/AL-R0-R39-STANDALONE-BROWSER-2026-11-04.json`; actual Chromium (1440, 390, 320 px) GitHub Actions `41784653735` PASS in disposable isolated Docker environments.

## SC-005 — 2026-11-04 — Private standalone QA installation kit for reusing R40 accounts

- **What the Owner asked:** Continue standalone implementation and reuse the already-saved QA-01..QA-10 credentials rather than create a new set every run. IAICT remains one ordinary organization; centralized SaaS remains deferred.
- **R41 implementation boundary:** One-time owner/operator-created QA installation keys and per-install PostgreSQL16 Docker Compose named volume, internal auth/API no host ports, localhost-only test UI over SSH tunnel; idempotent R40 SQL account provisioning and browser/role checks. No new SRS role, public endpoint or customer data contract; existing R37/R38/R39 services remain nonproduction-only test adapters.
- **Acceptance gap:** Cloudflare account has no configured Tunnel and current connection cannot use Cloudflare Containers (401); no user-authorized durable Docker/PG16 host is connected to the tooling. The Owner's saved R40 bundle was independently validated but not activated on a permanent staging database. The CLI/CI can prove restart persistence in disposable environments, not a live accessible server, an approved production IAM/IdP, complete legal AI functions, backup/restore or TC12 acceptance.
- **Follow-up for the Owner-controlled SRS change log only:** Align final dedicated deployment operator model, persistent secret/IdP rotation, authenticated workspace discovery (instead of synthetic public display labels), TLS or encrypted remote access, MFA/step-up, backup/restore and upgrade/rollback with SRS v1.1.15 before product release. Do not change private SRS baseline automatically.
- **Evidence target:** `tests/evidence/AL-R0-R41-STANDALONE-STAGING-KIT-2026-11-04.json`, `deployment/standalone/QA_R41_OPERATIONS.md`, CI standalone-staging-kit test. Never store owner-private QA bundle in public code or the CI artifacts.
