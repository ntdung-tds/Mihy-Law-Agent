# AI Law R36–R39 — standalone-first local deployment bootstrap

## R39 — Browser UX connected to real standalone login and protected API (test only)

**User workflow:** open AI Law local login page → enter the operator-issued test email/password → choose the **authorized** personal/organizational workspace → sign in → inspect the real PostgreSQL-backed synthetic TaskRun with MatterACL → sign out. The interface has the same navy/light, flat-block and mobile-first direction as the Owner's R0 preview. IAICT is ONLY an ordinary test organization, not a global root account. SaaS is deferred.

**Implementation:**
- `web/r0-standalone/index.html`, `styles.css`, `app.js`: responsive login/dashboard. Unimplemented legal-workflow cards are explicitly marked **Chưa kết nối**; no simulated AI outputs are misrepresented as real.
- `r0_core/standalone_browser_gateway.py`: Python WSGI browser-to-backend (BFF) test gateway. Browser sends login credentials once through same-origin POST, while the gateway calls R38 authenticated login and holds JWT in **process memory**. Browser only receives an independent **HttpOnly / SameSite=Strict opaque session cookie**; no JWT in JavaScript, DOM, URL or browser storage. Requests for task-run output are forwarded to real R37 API, which revalidates signed identity, PostgreSQL session and MatterACL. Logout calls authenticated R38 revoke and drops gateway session.
- Per-installation data and service images remain isolated. The optional gateway is **bound strictly to `127.0.0.1:18080`** for the synthetic IAICT organization and `127.0.0.1:18081` for the independent organization in CI. Auth and API are **not** published to the host. Login POST requires exact same Origin, and host header is allowlisted. The gateway refuses to start without the explicit nonproduction mode flag.
- The **public workspace picker in R39 is only a synthetic display fixture**. It is NOT how the product discovers memberships. The backend independently validates the requested tenant from real SQL, and a different tenant is rejected. Before customer/staging release, this must be replaced by verified post-authenticated membership listing under the approved SRS IAM flow.
- A browser gateway's cookie table is **ephemeral process memory**, not a durable HA session store. The real R38 signed server session is in PostgreSQL. No production release, no public domain, no actual customer accounts, no MFA, no real document data are authorized here.

**Reproduce real browser testing** in a disposable machine with Docker Compose v2, Python 3.12 and Chromium Playwright (on an OS supported by Playwright, e.g. Ubuntu 24.04):

```bash
python -m pip install -r requirements-r0-auth.txt "argon2-cffi==25.1.0" "playwright==1.55.0"
python -m playwright install --with-deps chromium
R38_ENABLE=1 R39_ENABLE=1 bash deployment/standalone/smoke_api.sh
```

The test creates three ephemeral `.invalid` accounts in two Docker stacks, exercises real browser HTTP and renders at **1440, 390 and 320px**, reload/cookie continuity, authorized/denied matter ACL, sign-out and cross-origin protection; then destroys both stacks/credentials. **No screenshot or test password is uploaded to the public GitHub repository.** The CI status must be observed before claiming PASS.

**Do not use R39 as production authentication:** The unapproved `/api/*` and `/standalone/auth/*` endpoints are internal test integration routes, not new approved SRS public API contracts. Before Owner acceptance, complete durable standalone installation, authenticated workspace selection, real account provisioning, canonical schema/sessions, TLS and browser/mobile acceptance, full R0 legal workflows, backup and rollback.

## R38: isolated LOCAL password accounts and actual HTTP login — NONPRODUCTION ONLY

**Owner delivery order remains dedicated/standalone first.** IAICT is just one ordinary organization test tenant. No IAICT SaaS, Cloudflare Access, shared global login authority, public registration, payment or customer data is required.

An optional test-only Docker Compose extension (`compose.login-test.yaml`) adds a separate, non-root **authentication process** beside the existing R37 read-only API and PostgreSQL 16. It tests actual HTTP email/password login and logout. All passwords are randomly generated for the test run and saved only in a throwaway local directory. Account rows contain **Argon2id hashes, never plaintext passwords**. The auth process issues real RS256-signed 15-minute JWT access tokens after checking real PostgreSQL memberships. The separate API checks the signatures using only a public key; the private signing key is never injected into the API container. Active sessions and their selected tenants are stored in SQL and rechecked on every API request.

`POST /standalone/auth/login` and `POST /standalone/auth/logout` are **test-only local HTTP interfaces**, not newly approved public SRS APIs, an external OIDC IdP or production credentials integration. They have no host-published ports, no long-lived account directory, no MFA/password recovery and no browser login UI. Five consecutive invalid passwords lock the disposable account for 15 minutes. A disabled account automatically revokes its existing SQL sessions, including already signed Bearer credentials. IAICT admin rights do **not** bypass the existing MatterACL.

**Reproduce with Docker Compose and Python on a disposable machine:**

```bash
python -m pip install -r requirements-dev.txt
R38_ENABLE=1 bash deployment/standalone/smoke_api.sh
```

This starts **two separate** auth+API+PostgreSQL16 installations, provisions three fictitious `.invalid` email account records with different roles and isolation boundaries, performs credential-based real HTTP login, selects organizational/personal context, checks GET /v1/runs/{id}, wrong-tenant denial, cross-installation token denial, logout, account-disable revocation, brute-force lockout and SQL privilege isolation, then destroys both instances and their ephemeral secrets. A single principal may use both a personal and organization tenant *only after validating membership*; no account is created in any persistent public environment.

**Current acceptance:** isolated Docker/HTTP/DB integration tests (after successful GitHub Actions run) may be marked PASS only for these specific checks. External production-approved IdP, real-user provisioning, MFA/step-up, browser/mobile test, complete legal AI workflows UC03/04/07, canonical SRS TaskRun/audit, document storage and independent production installation are still **NOT_RUN / NOT_IMPLEMENTED**, with Owner final acceptance pending. No real case documents or production deployment are permitted.

## R37: isolated nonproduction HTTP API + real PostgreSQL16 sessions/RLS

**Now runnable in GitHub Actions:** `deployment/standalone/Dockerfile.nonprod-api` packages the existing SRS `GET /v1/runs/{id}` WSGI endpoint as a real Python service container. The test-only Compose override `compose.api-test.yaml` attaches it to one installation's PostgreSQL16 network, not to any IAICT SaaS service.

- API database role is **read-only, non-superuser, non-BYPASSRLS**, with a different per-installation password from the PostgreSQL migration owner.
- The server verifies genuine RSA-signed `at+jwt` credentials (R34) against a trusted *test-only public* JWKS; **no external IdP HTTPS request or real user login** has been implemented.
- Ephemeral private signing keys never enter API containers or GitHub source. Test sessions, internal identity mappings and queued run snapshots are **persisted in isolated PostgreSQL16** test-only tables. The run fixture uses `FORCE ROW LEVEL SECURITY` requiring the matter's explicit ACL.
- The test runs TWO whole Docker Compose stacks in CI: the IAICT-labeled organization and another independent organization, both with unique keys, secrets, DB/network/volumes, HTTP server process and tenant data. IAICT has no special platform permissions.
- Smoke assertions: **200** authorized lawyer, **404** tenant administrator with no explicit case ACL, **404** nonexistent run, **401** cross-installation JWT, **401** invalid/missing token, **404** after real PostgreSQL ACL/membership revocation, **401** after real session revocation, and database reader cannot write.
- Neither API nor PostgreSQL publishes host ports. **A fixture/test API process is not the accepted standalone legal AI product.** It has no signup/password screen, real IdP, document handling, actual legal AI provider, production TaskRun schema or backup/upgrade acceptance.

Run in a **disposable CI-equivalent** host after installing Docker, Docker Compose v2 and Python dependencies:

```bash
python -m pip install -r requirements-r0-auth.txt
bash deployment/standalone/smoke_api.sh
```

The runner creates randomly signed JWTs and credentials, sends them through in-container localhost HTTP, performs real SQL tests and removes two stacks plus ephemeral keys. **Do not use this script with production or customer data.**

## R36: database-only bootstrap

## Owner priority (2026-11-04)

Build **independent installation first**. The IAICT organization is simply a potential **customer organization/tenant of one standalone installation**, with exactly the same rules as any law firm or other organization. It has no implicit cross-installation control, hidden account access or MatterACL bypass. IAICT-hosted shared SaaS is **deferred until after the standalone track is accepted**, not removed from the long-term scope. Preserve one source core.

## What can actually run now

A private PostgreSQL 16 database container with the **existing R30 test-only IAM/RLS subset migration**, healthcheck, per-installation network and named volume. It is a **nonproduction infrastructure test harness**, not the full standalone AI Law app: no login, IdP, application service, AI model, document store, billing or real case-processing. **Do not feed customer data or expose it to the public.** The migration is expressly *not approved for live production*.

## Isolated local installation

Prerequisites: Docker Engine + Docker Compose v2. From repo root, for a throwaway isolated instance:

```bash
cp deployment/standalone/.env.example deployment/standalone/.env
# Edit the file to replace CHANGE_ME with a freshly generated strong unique
# secret. Never commit/share the resulting file.
docker compose -p ai_law_local --env-file deployment/standalone/.env \
  -f deployment/standalone/compose.yaml up -d --wait
docker compose -p ai_law_local --env-file deployment/standalone/.env \
  -f deployment/standalone/compose.yaml exec db \
  psql -U ai_law_admin -d ai_law -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='ai_law';"
```

Stop without deleting data: `docker compose -p ai_law_local --env-file deployment/standalone/.env -f deployment/standalone/compose.yaml down`. **For disposable tests only**, add `-v` to destroy installation data. SQL init runs only when the database volume is initially empty; future schema upgrades require separately reviewed versioned migrations and rollback. Do not reuse this admin credential as a running application role.

## Actual CI: independent IAICT and outsider installation databases

`bash deployment/standalone/smoke_isolation.sh` launches two Compose projects with different generated secrets. One is labeled `IAICT` as **a test customer installation** and the other represents a separate organization. CI verifies:

- Each has its own real PostgreSQL 16 process, network and data volume, and applies the existing migration.
- No host database ports are published; a secret is mandatory.
- An organization tenant record written in installation A **does not appear** in installation B and vice versa.
- An installation's tenant record persists after its database container restarts.
- Both throwaway projects/volumes and generated secrets are cleaned up automatically after CI.

A positive infrastructure isolation test is **not** proof of user login, document/data access isolation in all app services or an independent production-ready AI Law installation. Those remain separate R0 acceptance gates.

## Next real standalone implementation work

Add the actual app service and independent configured IdP/session/membership/roles for this installation. Test real organization test accounts, tenant selection and case ACL, then R0 legal workflows with real documents prepared expressly for testing. Verify offline/private-network viability if specified by SRS, upgrade/rollback, encrypted storage, backup/restore and security. Do not make SaaS hosting or Cloudflare Access a hidden prerequisite for standalone users.

The approved SRS v1.1.15 remains unchanged; any proposed wording updates are tracked in `srs_changed.md`. The project owner accepts the final functional result.
