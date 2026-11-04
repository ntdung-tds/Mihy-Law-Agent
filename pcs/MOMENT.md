# AI Law — PCS Chat Solo MOMENT

- **Repository:** `ntdung-tds/Mihy-Law-Agent` (public).
- **PCS revision:** `43` (source of truth `pcs/STATE.json`).
- **Updated:** `2026-11-04T08:48:00Z`.
- **Phase:** R0 REAL IMPLEMENTATION. D01 OWNER_APPROVED; the current standalone installation treats IAICT as one ordinary organization customer. IAICT-hosted SaaS is deferred by Owner. R31 static synthetic UI/PG fixtures do not satisfy role-based real customer login acceptance. Actual IdP-backed demo user accounts and TC12A/B app E2E NOT_RUN; production and customer data remain separately gated.
- **SRS:** v1.1.15 remains private and unchanged.

## R43 — first REAL isolated Cloudflare Free Worker+D1 infrastructure with locked-down API

- **Actual resources created:** Cloudflare Worker `ai-law-standalone-cf-qa` was deployed and its workers.dev nonproduction subdomain enabled. Dedicated D1 database `ai-law-standalone-cf-qa` was created without changing existing IAICT Portal or demo databases. **Eight relational metadata tables** applied via actual Cloudflare D1 query API, with no user/customer matter/file data.
- **Actual live HTTP checks:** GitHub Actions `41802685576` `cloudflare-live-qa` successfully called HTTPS /health, got 401 for anonymous read of runs/file metadata/file content, and 404 for forbidden POST. Worker JWKS contains **zero keys** and has no approved IdP, so this is a safe deny-all technical QA server, **not a customer login service**.
- **Code & tests:** `deployment/cloudflare/src/worker.mjs` verifies RS256 at+jwt and joins D1 sessions + active member + application-scoped versioned MatterACL. `deployment/cloudflare/src/google_drive.mjs` guards out-of-folder, trashed and redirected Drive file reads; tests use fake HTTP/credentials and no live Drive OAuth. `deployment/cloudflare/tests/worker.test.mjs` Node real cryptography and `test_sqlite_acl.py` real SQLite query tests passed. The 8-job R41 Docker QA suite remains intact and unmodified.
- **Hard limits:** D1 free account now 10/10 DBs (new AI Law QA consumed last slot); D1/SQLite has no PG FORCE RLS, full SRS v1.1.15 IAM/audit parity is NOT VERIFIED. Real Cloudflare QA accounts and user sign-in, customer Google Drive OAuth, file upload/download, AI legal UC and Owner acceptance NOT_RUN. Do not call the QA /health deployment product-ready or upload real client legal files.
- **R41:** still parked. Same private R40 ten-QA password bundle and Docker host restart kit unchanged until Owner provides server. No SaaS.
- **Next R44:** approved QA identity/token/session issuance and real scoped positive/negative D1 auth on Cloudflare; customer authorized Google Drive OAuth and safe upload/read if permissions granted; repeat actual E2E and record PASS/FAIL/BLOCKED. Baseline SRS unchanged, `srs_changed.md` SC-007.

## DEC-017 / R42 — saved Owner priority: Cloudflare Free + customer Drive NOW, R41 host parked

- **Owner's instruction saved:** Do NOT drop or redo R41. Private Docker/PG16 kit remains at merged PR #57 / main commit `f61e8540cca8947559f03a52eaefa0ffa04f179e`, 8/8 main CI PASS `41794614580`. Save the original owner-only R40 ten-QA credential bundle, and resume R41 exactly if/when Owner supplies a real independent server. No permanent staging exists yet and the saved password bundle is not activated.
- **Current deployment-first direction:** One **isolated organization AI Law installation** on **Cloudflare Workers Free**, with **legal documents stored in that organization's own Google Drive**. **IAICT remains one ordinary customer organization**, not a shared SaaS provider. Shared SaaS delivery remains deferred.
- **Long-term portability** is a design invariant, not delivered integration: Google Drive/OneDrive/NAS/VPS/S3/AWS/Azure/GCP file storage and Cloudflare/VPS/owned servers/private cloud/AWS/Azure/GCP runtime deployments via configurable providers. Never hardcode IAICT or Drive, never share credentials/ACLs across organizations; keep one legal AI product and SRS contracts.
- **Architecture gate:** Workers Free cannot host R41 Docker+PostgreSQL16 unchanged; Cloudflare D1 may be assessed for metadata **only after validating equivalent SRS IAM/tenant/MatterACL/audit constraints** (PostgreSQL RLS has no automatic D1 equivalent). Drive OAuth API permission and ToS must be confirmed; ChatGPT connected Drive is NOT a Worker OAuth credential. Heavy AI tasks need an external model/service; free Workers quotas apply. No Cloudflare production deployment, new legal file API, OAuth, or real AI workflow has been tested or deployed for DEC-017.
- **Checkpoint:** `pcs/STATE.json` DEC-017, `srs_changed.md` SC-006, `deployment/DEC-017-CLOUDFLARE-FREE-PORTABLE-STORAGE.md` and `deployment/modes.json`. Baseline SRS v1.1.15 unchanged.
- **Next actionable bounded task:** evaluate Cloudflare Free/D1 security and build nonproduction adapter proof with authorized test Google Drive, end-to-end file ACL and IAM, without modifying current public IAICT Portal/AI Law demo Workers or publishing customer data. Keep R41 resumable for Owner-provided host.

## R41 — private persistent-style QA installation kit; connected host still blocked

- **Operator package:** `tools/r41_staging_config.py` creates each installation's private env, distinct RSA/DB keys and QA workspace labels ONE TIME with strict owner-only 0600/0700 and no accidental rekey. `deployment/standalone/qa_staging.sh` offers `init/up/provision/verify/status/stop/preflight` for 2 separate local Compose apps, with PostgreSQL16 named volumes, non-root private auth/API and localhost-only UI. Operator stop does not erase volumes. R40 private credential bundle remains in Owner-only Drive; no new roles or passwords in GitHub.
- **Real CI proof:** `deployment/standalone/smoke_staging_kit.sh` used **the same ten CI-generated QA passwords** for both 2 installations and repeated full actual HTTP login/Argon2id/JWT/MatterACL/Chromium browser checks before AND after stopping/restarting services; private keys, DB data and credential file unchanged. Playwright 1440/390/320, QA-02/03/04/05/07/08/10 including denial, refresh, CSRF and logout PASS. **8/8 CI jobs PASS** run `41793096574`, including the new staging-kit job; `tests/evidence/AL-R0-R41-STANDALONE-STAGING-KIT-2026-11-04.json`.
- **Actual infrastructure block:** Cloudflare connection confirmed, but Containers access HTTP401 and zero available Cloudflare Tunnels. There is no authorized persistent standalone Docker/PG16 host connected; user-saved R40 credential file NOT applied to any permanent staging server. No owner-accessible QA URL, production-approved IAM/MFA, real legal AI UC functions, full TC12, backup/rollback, physical mobile or Owner final acceptance.
- **Runbook:** `deployment/standalone/QA_R41_OPERATIONS.md` documents how an authorized QA host operator uses the original R40 owner-private bundle and SSH tunnel. Do not use R41 test-only auth as production or public SaaS. IAICT ordinary organization on standalone; SaaS deferred; SRS baseline v1.1.15 unchanged.
- **Next:** connect an approved nonproduction standalone Linux Docker host for actual persistent staging and Owner browser acceptance; until then advance the real core legal AI workflows and remaining security gates in isolation.

## R40 — reusable 10-account QA matrix saved privately, actual SQL/HTTP CI verification

- **User request fulfilled within accessible capabilities:** 10 named fictitious QA accounts QA-01..QA-10 for approved SRS actor cases RA-02..RA-09, with roles limited to `lawyer`/`tenant_admin`. Nine in primary standalone (IAICT ordinary organization, a separate organization and personal workspaces) and one on a separate installation. Includes disabled/revoked, tenant outsider, personal+org membership same principal and two-case limited MatterACL scenarios. No future SaaS RA-01.
- **Credentials saved for reuse:** Owner-only, unshared private Google Drive folder holds a full R40 10-account password+Argon2id-hash credential JSON bundle; the same JSON exists as a local owner-download artifact. **No passwords, private hashes, JWT or Drive secret links in this public repository.** The bundle is prepared, but not installed on a long-lived server.
- **Actual PostgreSQL16 tests:** `tools/r40_qa_provision.py` creates private credentials once and renders atomic idempotent SQL, with registration fingerprint preventing accidental rotation. `deployment/standalone/smoke_qa.sh` applied the seed to two real Docker Compose auth/API/DB stacks, tested 10 actor logins, access/denials, ACL scope and cross-install signed JWT. SQL reapplication preserves original password hashes and ACL version. Docker Compose DOWN/UP without `-v` preserves accounts and sessions; different bundle is rejected. GitHub Actions `41788819557` 7/7 CI jobs PASS.
- **Limits:** These CI accounts lived in *disposable* installations and were deleted after the CI run. Specific Owner-saved password bundle is **NOT ACTIVE** on long-lived owner-accessible standalone staging. External IdP/MFA, real legal AI services, full TC12A/B and Owner final acceptance remain blocked; production unauthorized. D01 policy approved, unchanged.
- **Files:** `tests/acceptance/R40_STANDALONE_QA_INVENTORY.json` (public non-secret), `deployment/standalone/QA_R40_PROVISION.md`, `tools/r40_qa_provision.py`, `tests/evidence/AL-R0-R40-QA-ACCOUNTS-2026-11-04.json`. SRS v1.1.15 unchanged.
- **Next:** authorized operator applies saved credentials to a real long-lived private QA PostgreSQL16 host, confirms security/role smoke, and makes Owner-accessible staging available before full TC12/legal AI flows. Shared IAICT SaaS later.

## R39 — actual Chromium browser against standalone auth/API/PostgreSQL16

- **Real UI + gateway:** `web/r0-standalone/` is the live responsive nonproduction login/dashboard (navy/light flat R0 style), not the old static R31 role selector. A private `r0_core/standalone_browser_gateway.py` only binds loopback `127.0.0.1` via Compose, proxies signed R38 login/logout and R37 GET run via HttpOnly SameSite session cookie, never exposing JWT to browser storage/JS; checks Host and Origin. The backend still verifies JWT, SQL session, membership and MatterACL on every use.
- **Real desktop/mobile browser test:** `tests/browser/test_r39_browser_e2e.py` Playwright Chromium test at 1440 desktop, 390/320 mobile, signed password login, personal and organization tenant selection, read allowed/denied, reload persistence, logout revocation and CSRF. Two full independent `gateway+auth+API+PostgreSQL16` Docker instances use throwaway .invalid accounts and unique keys. **PASS** at GitHub Actions `41784653735` (six successful unit/PG/DB/API/login/browser jobs).
- **Scope boundary:** The real UI returns a **synthetic queued run fixture** from PostgreSQL, and shows other legal service blocks as `Chưa kết nối`. Synthetic public workspace choices are display-only and authorizations are enforced server-side. No approved provider, no permanent owner-accessible staging URL, actual customer accounts, real legal case files, complete R0 AI functions, physical-device test or production.
- **Evidence:** `tests/evidence/AL-R0-R39-STANDALONE-BROWSER-2026-11-04.json` + private Drive R39 test run (do not store sensitive URLs/credentials in this public PCS).
- **Next:** R40 persistent standalone nonprod installation with operator-provisioned approved QA identities, real browser owner test, first approved R0 legal workflow. SaaS remains deferred; SRS v1.1.15 unchanged; Owner final acceptance pending.

## R38 — real standalone local password login (test-only account service)

- **Actual code:** `r0_core/standalone_password_auth.py` implements real HTTP credential checks using Argon2id password hashes stored in dedicated nonproduction PostgreSQL16 account rows, a separate least-privilege auth DB role, an ephemeral RSA private signing key held only by the auth container, and actual short-lived access JWTs bound to revocable SQL sessions. The read-only app independently validates the signature and tenant MatterACL. Same person may select personal/organization membership after verified SQL checks.
- **Actual Docker CI:** two independent real `auth + API + PostgreSQL16` Compose installations, IAICT a *fictional ordinary customer organization* in installation A and separate organization B. Checks 200 valid credential/Bearer, 401 wrong password, wrong tenant and cross-installation JWT, 404 admin without MatterACL, sign-out revokes a real SQL session, disabling account revokes existing sessions, 5 consecutive invalid passwords lock account for 15 minutes, auth SQL identity cannot read customer matters. **PASS** GitHub Actions `41781535393`: `unit`, `postgres-rls`, `standalone-db`, `standalone-api`, `standalone-login`.
- **Evidence:** `tests/evidence/AL-R0-R38-STANDALONE-LOGIN-2026-11-04.json`. Synthetic temporary passwords/keys/account rows are created at test run and destroyed; no real customer email or legal data; no public login port; `/standalone/auth/login` and `/standalone/auth/logout` are NOT SRS public production endpoints.
- **Outstanding:** persistent real customer account provisioning, approved production identity/MFA, browser/UI sign-in, canonical SRS account/session/TaskRun migrations, full legal AI UC03/04/07 and real document workflow, durable private installation backup/upgrade/rollback, Owner final acceptance. Both standalone product and SaaS remain NOT_READY; SaaS implementation intentionally deferred.
- **Next:** build standalone login UI and actual approved nonproduction account provisioning/integration; perform browser + API TC12A/B with isolated roles. Continue core functions without changing approved private SRS v1.1.15.

## R37 — real standalone API + persisted PostgreSQL16 auth/run test fixtures

- **Implementation:** Containerized Python WSGI GET /v1/runs/{id} from approved SRS, connected to separate PostgreSQL16 instance using SELECT-only NO BYPASSRLS role. Synthetic external-to-internal identity mapping, session active tenant/revocation and queued TaskRun payload are actually persisted in `ai_law_nonprod` test-only schema. JWT RS256 signature validation is cryptographic; only public JWKS transport is injected from local nonprod config (real HTTPS IdP still not integrated). Fresh DB RLS/MatterACL checks protect the run snapshot.
- **Two real Docker stacks:** isolated API+DB in CI, "IAICT" just one ordinary synthetic organization and a separate unrelated installation. Real HTTP 200 for permitted lawyer, 404 for admin with no MatterACL, 401 for wrong cross-install JWT or revoked session, 404 when matter or membership ACL revoked, database app account cannot insert; independent keys/data/port isolation.
- **CI evidence:** GitHub Actions `41774950797` **completed/success** for `unit`, `postgres-rls`, `standalone-db`, `standalone-api`; `tests/evidence/AL-R0-R37-STANDALONE-HTTP-2026-11-04.json`.
- **Limit:** This is *a real deployed Docker test API* for one existing read endpoint, **not** actual user login, a customer-ready AI Law app, or real legal AI workflows. Fixture sessions and runs explicitly NOT canonical SRS production schema. All real user accounts and external IdP, app/browser E2E, storage, backup and Owner final acceptance NOT_RUN.
- **Owner priorities:** Standalone FIRST; IAICT ordinary organization; SaaS later. SRS v1.1.15 unchanged; no production deploy.

## R36 — Owner standalone-first execution, IAICT ordinary customer

- **DEC-016:** Independent AI Law standalone implementation and acceptance is first. IAICT is **one ordinary organization tenant in standalone**, with no special cross-installation authority and no implicit MatterACL read. Shared IAICT SaaS is deferred until standalone acceptance, not cancelled.
- **Real implementation:** `deployment/standalone/compose.yaml` launches one isolated PostgreSQL16 environment with a per-installation volume and secret, no publicly published DB port, and the existing R30 test-only IAM/RLS migration. `deployment/standalone/smoke_isolation.sh` creates two independent Compose projects (synthetic IAICT customer and an unrelated organization) with distinct secrets and records, verifies cross-instance isolation, DB restart durability and cleans up after CI.
- **Actual CI:** R36 `standalone-db` job first PASS in GitHub Actions `41771766696`, alongside unit and postgres-rls jobs. This proves nonprod isolated DB bootstrapping only; NOT a full AI Law app, not real role login, not complete doc/AI workflow, not production-grade migrations.
- **Dedicated release gate independent of deferred SaaS:** `tools/check_product_readiness.py` reports `standalone_release_ready` using legal/security/functionality, actual dedicated E2E evidence, specific owner acceptance and dedicated deployment authorization. Future SaaS is **not** a prerequisite for standalone acceptance, though full dual-delivery product readiness still requires both.
- **Baseline:** SRS v1.1.15 unchanged. `srs_changed.md` SC-002 records Owner rollout priority without overwriting approved SRS. `AL-R0-DEPLOY-001` active; application, IdP, account provisioning, document store, UC03/04/07 and browser E2E next.
- **Product safety:** D01 approved, Owner final acceptance pending, production unauthorized, no real case data used.

## R35 — Owner: dedicated delivery must be implemented, not deferred

- **DEC-015 (Owner 2026-11-04):** both delivery modes are **required** for the AI Law product: (1) IAICT-operated multi-tenant SaaS and (2) isolated customer deployment, including private cloud/on-premises when agreed. One product, same source, migrations, authorization logic, legal functions and tests. Only environment/infrastructure operations differ. This directly corrects the earlier assistant's incorrect suggestion to defer dedicated delivery.
- **Recorded implementation path:** `deployment/modes.json` and `deployment/README.md` specify two required mode targets, safety invariants, independent real-acceptance tests and honest current NOT_RUN statuses. `AL-R0-DEPLOY-001` is IN_PROGRESS, not an imaginary future task.
- **Release enforcement:** `tools/check_product_readiness.py` blocks final product readiness unless both SaaS and dedicated modes have real deployment E2E `PASS` and non-empty verified evidence. `release/product_readiness.json` has both unfinished profiles.
- **Baseline control:** SRS v1.1.15 remains unchanged. `srs_changed.md` SC-001 records whether deployment wording requires synchronization; only Owner decides final baseline sync.
- **No false installation claims:** actual dedicated package / private instance / accounts / UI / backup-rollback E2E NOT_RUN; SaaS real customer login E2E also NOT_RUN. No production or real customer data authorized.
- **Next implementation:** continue real IAM work and deliver reproducible dedicated nonprod packaging in bounded tasks in parallel. Actual authenticated browser/API R0 workflows must be tested in **each** mode before final product acceptance.

## R34 — Concrete signed JWT + real PostgreSQL16 HTTP integration

- **Owner-directed R0 implementation:** `r0_core/jwks_verifier.py` now implements an actual cryptographic RS256 JWKS verifier for trusted `at+jwt` access tokens and verified `sid`, using server-controlled issuer/audience and HTTPS JWKS URL. This is not a Cloudflare Access/customer login integration or a persisted session.
- **Signed JWT real code tests:** RSA keys created ephemeral in CI; real RSA signature, kid/key selection, tampered signature, token-confusion, issuer/audience/expiry checks; revoked or missing session/principal fails closed.
- **Signed HTTP + actual disposable PostgreSQL16:** Existing GET /v1/runs/{id} test now uses cryptographically signed token at real local HTTP; PostgreSQL 16 RLS/MatterACL checks for authorization, tenant switch, membership revocation, forged token 401. Run content and key-server lookup remain in-memory test fixtures.
- **CI evidence (pre-checkpoint):** runs `41766637661` and `41766669235` on source head `5eb958ecdc37be6524e9dbe8e0bb690665c61548` **completed/success**; unit 245 tests (23 DB-only skipped), postgres-rls 19 + R31 17 tests PASS. Evidence `tests/evidence/AL-R0-R34-JWKS-2026-11-04.json`.
- **Readiness:** REAL_IDP_JWT_MFA PARTIAL_TESTED only (crypto implementation), actual IdP/account login/JWKS network fetch/real session/MFA/browser TC12A/B NOT_RUN or NOT_IMPLEMENTED, D01 policy already APPROVED, production still NOT_AUTHORIZED, Owner final approval PENDING.
- **Next:** `AL-R0-IAM-REAL-001` remains IN_PROGRESS; approved actual identity provider connection, secure account provisioning under IAICT and isolated staging real-role E2E. No private SRS edit.

## R33 — Owner clarification: actual product with IAICT-managed real test accounts

- **DEC-014:** Owner clarified D01 has already been approved. Treat D01 policy as **APPROVED**, not awaiting another policy decision. IAICT is designated operator/manager of the entire AI Law platform; neither platform operator nor tenant admin has implicit MatterACL-protected customer-file read rights. Exact legal registration/signature and real-data processing authorizations are separate evidence questions.
- **True "demo" target:** create different **real IdP-backed customer test accounts** (IAICT platform operator, personal professional, same principal in two tenants, organization administrator, permitted organization lawyer, outsider/revoked actor), connect to real isolated app/database and execute TC12A/B/browser/API/security negative E2E. Existing R31 static UI and PostgreSQL fixture remain only synthetic tests. These real accounts and E2E have **NOT_RUN**.
- **Docs and tests:** `pcs/decisions/D01_POLICY_R29.{md,json}`, `release/product_readiness.json` (D01_APPROVAL PASS, separate product/legal gates still closed), `tests/acceptance/R0_REAL_ROLE_ACCOUNTS.md` and D01 regression checks.
- **Next task:** `AL-R0-IAM-REAL-001` implement real approved IdP/JWT/JWKS/session and provision authorized role-specific nonproduction test accounts. Continue to persistent case/TaskRun and R0 UC03/04/07; no private SRS change or unapproved production deployment.
- **Owner acceptance:** Final product approval remains with the Owner, independent of approval of D01.

## R32 checkpoint — merged synthetic customer UI and release gate evidence

- **PR #46 merged to main:** `aebf8f40e22737865d5ef485d90f88591bb53ef8`; main CI `41763166002` **completed/success**. Premerge latest head also passed 2 separate GitHub Actions runs. `web/r0-demo/` shows 5 clearly labeled fake personas over 2 tenants, no passwords, file upload, real AI output or authentication.
- **Existing PR #47 merged earlier:** independent negative PostgreSQL fixture `db/demo/` is different from UI `demo/customers.json`. README now warns these are two independent test datasets and must not be treated as synced customer records or seeded together. Main after #46 contains both without file conflict.
- **Nonproduction preview:** https://ai-law-r31-demo.iaict-platform.workers.dev/ exists and browser-rendered at 320px (5 persona buttons and 2 initial synthetic document cards) and 390px (5 persona DOM elements). Full scripted persona-switch/revoke/dialog E2E, desktop 1280px and physical-device acceptance remain NOT_RUN; further browser API calls returned HTTP 429 rate limit. No raw screenshots uploaded.
- **Readiness checker:** `tools/check_product_readiness.py` + `release/product_readiness.json` records `DEMO_FIXTURE=PASS`, `DEMO_POSTGRES=PASS`, `DEMO_NONPROD=PASS`, `DEMO_BROWSER=PARTIAL_TESTED`. Product readiness remains **false**, release authorization **NOT_AUTHORIZED**, Owner acceptance **PENDING**. This advisory checklist does not authorize deployment.
- **Tasks:** `AL-R0-DEMO-002` and `AL-R0-RELEASE-002` are **TECH_DONE only** for synthetic UI/source/readiness, not real product acceptance. SRS v1.1.15, saved R20 UI reference, R25 flat preview and real-data gates unchanged. Next is approved identity + persistent run/document workflows and full actual E2E after prerequisites.

## R31 — synthetic customer and product readiness

- **DEC-013 / AL-R0-DEMO-001:** Seeded a fictional “Công ty Luật Minh Họa (DEMO)” organization with two synthetic principal records and a separate outsider tenant in `db/demo/seed_r31_synthetic.sql`. No passwords, external accounts, client records or live login.
- **Real test:** GitHub Actions `41762583625` both jobs PASS, including PostgreSQL 16 tests verifying the synthetic lawyer's explicit read grant, tenant admin's lack of implicit MatterACL, and cross-tenant isolation.
- **AL-R0-RELEASE-001:** `db/demo/README.md` lists production release gates and missing capabilities. Not yet delivered: approved real IdP/JWKS/session, persisted TaskRun, R0 workflows, independent security audit, audit/outbox, complete browser/Word E2E and D01/legal-data approvals. No staging/production deployment; Owner final acceptance PENDING.
- **Next:** approved identity and persistent run store in isolated staging, then full SRS acceptance and separate explicit production approval.

## R30 — one-batch PostgreSQL16 IAM/RLS and synthetic getRun integration

- **DEC-012 / AL-R0-DB-001..004**: Owner approved a single grouped R30. Added isolated versioned `db/migrations/0001_r0_iam_rls.sql` with IAM tables, FK constraints, deferred active-role rule, membership audit metadata, FORCE RLS and read MatterACL with deny precedence. A nonowner and non-BYPASSRLS runtime role in CI cannot read other-tenant records or write data.
- **Authorization state:** trusted per-transaction database scope; role or matter-group change bumps `authz_version`, MatterACL changes bump `acl_version`; revoked membership cannot silently reactivate. Security-invoker `matter_acl` view does not bypass RLS. Existing R26 PostgresMembershipRepository and R28 `GET /v1/runs/{id}` use actual PostgreSQL for membership+MatterACL with an in-memory fake run store and fake bearer verifier.
- **Real CI evidence:** GitHub Actions run `41750910297` on R30 code branch: real PostgreSQL16 job **18/18 PASS** and separate standard unit job **195 PASS, 18 DB-only tests SKIPPED by design** (all executed in DB job). Verified local HTTP 200 when allowed and 404 after changing tenant/revoking. Earlier failed review cases—fixture setup, missing version triggers, active-role guard assertion—were fixed and retested. See `tests/evidence/AL-R0-R30-POSTGRES-2026-11-04.json`.
- **Not yet accepted as live IAM:** D01 formal signed evidence and legal-data Pilot approval pending; production JWT/IdP/MFA, persisted session and TaskRun store, full audit/outbox, SQL-injection/role/pool independent assessment, application TC12A/B E2E and actual customer data NOT_RUN. No staging/production deployed and baseline SRS v1.1.15 unchanged.
- **Next:** verify and approve real external identity + controlled isolated staging, production-equivalent DB/service roles, real run authorization storage and full app E2E before any gate change. Owner final acceptance pending.

## R29 — D01 Owner policy approval, formal/legal/security evidence still open

- **DEC-011 / AL-D01-GOV-001:** Owner explicitly approved the D01 multi-tenant customer/data-control policy on 2026-11-04. Personal and organization tenants; multiple membership; no silent cross-tenant files, no implicit tenant_admin/platform_operator matter read, no default client document model training or vendor processing. Per-flow legal roles require actual assessment. Policy approval does **not** equal a signed legal decision, certificate, data processing agreement, or production approval.
- **Source-of-truth:** Locked SRS v1.1.15 baseline has two relevant decisions: `GATE-D01-R0=PENDING_EVIDENCE` for activation of real identity/tenant, and `GATE-LEGAL-DATA=PENDING_APPROVAL` for Pilot with customer data. Synthetic R0 fixture work may proceed. D03/D05/D07 and scope-dependent D02/D04 remain separate.
- **Factual gates:** Named supplier legal entity not provided; written determination of Decree 356/2025/NĐ-CP Articles 21–25 applicability pending; DPA, actual data-flow role mapping and signed Owner evidence absent. Actual PostgreSQL RLS, MatterACL, verified identity and TC12 E2E NOT_RUN.
- **Artifacts:** Public-safe `pcs/decisions/D01_POLICY_R29.{json,md}`, D01 governance unit tests **9/9 PASS** and full repo **195/195 PASS** (CI `41747231230`); private Word/role/flow/gate/QA dossier rendered and its archive checksum verified. Private SRS was read only; source file, OpenAPI, release decision register and production unaffected.
- **Next:** Obtain formal evidence, legal conclusions, contract/vendor approvals and actual E2E before opening either release gate.

## R28 — grouped 3-task GET /v1/runs/{id} implementation, 4 review loops

- **One batch, three tasks:** AL-R0-FN-004 verified session ID after R27 checks; AL-R0-FN-005 SRS-approved `GET /v1/runs/{id}` WSGI ErrorResponse/TaskRun handler; AL-R0-FN-006 session-owned tenant, fresh membership, run ACL and cross-tenant masking. **PR #42 merged** `46a284940c624d0fba4ab69b45699e61a19d770f`. No new endpoint outside the SRS.
- **Four red→repair→green review loops:** initial missing handler, dependency failure HTTP 503 vs access 404 and unsupported run-ID maximum, typed IdP/service outage vs invalid token, and nullable TaskRun coverage/usage inconsistency. Synthetic test count grew to **186/186 PASS** at final PR-head GitHub Actions `41741449670`. See `tests/evidence/AL-R0-R28-GETRUN-TR-2026-11-04.json` for actual test-run history.
- **Real HTTP evidence:** standard-library WSGI ran on an ephemeral **127.0.0.1 loopback server** with fake signed verifier, principal, membership, ACL and run store; returned synthetic 200/401/404 as asserted. Additional direct WSGI unit cases exercise 400 and 503. No cloud API, JWT cryptography, user data, browser E2E or production deployment.
- **Unverified:** D01 security approvals, real IdP/JWKS/MFA, persistent session/active-tenant store, actual PostgreSQL FORCE RLS/MatterACL and real run repositories. Owner final functional acceptance PENDING. SRS v1.1.15 unchanged and immutable R20/R25 previews untouched.
- **Next:** provision security approvals and isolated real dependencies before staging integration and E2E; never describe synthetic WSGI as deployed R0 product.

## R27 — trusted bearer request boundary, unit-tested only

- **PR #40 merged** at `b797e9e94fae24ff9d9fd13458e2593828ea3917`. `r0_core/session_boundary.py` consumes Authorization Bearer through **injected external trusted verifier**, maps provider subject through authoritative internal identity store, rechecks active session, and invokes existing R26 tenant membership adapter. There is no new HTTP route, runtime token-verifier implementation or real IdP.
- **Test-first:** missing-module regression was an expected RED in run `41738147905`; final PR-head GitHub Actions run `41738492253` **161/161 PASS**, including **12 synthetic** auth/tenant boundary unit cases. This proves in-process adapter behavior, not JWT cryptography, MFA, HTTP 401/403 behavior, PostgreSQL RLS or actual logged-in UI.
- **Boundaries:** SRS v1.1.15 stays private/unchanged, D01 PENDING_APPROVAL. Do not use client-supplied claim objects as verified identities. No real data or production; immutable R20 snapshot and R25 live UI not touched. Private Drive test folder prepared, raw logs not uploaded.
- **Next:** implement a small approved /v1 request handler after trusted verification, configured session source and tenant/ACL gate are available; run isolated actual PostgreSQL/RLS and browser E2E before claiming IAM readiness.

## R26 — read-only relational membership adapter (FR12-01)

- **PR #38 merged** at `a638d73d09e96c279e4705ea8e52e7c761772376`: `r0_core/membership_repository.py` reads tenant, active principal, current membership and approved role registry using one parameter-bound DB-API query; existing core clears tenant-sensitive context on switch. No new HTTP endpoint introduced; R25 UI remains unchanged.
- **Tests:** expected initial red CI `41736074780`; two additional timestamp/revocation tests red in `41736459846`; fixed and rerun full GitHub Actions **149/149 PASS** on PR final head `41736855153`. 12 cases use isolated **synthetic SQLite** with a PostgreSQL placeholder translator; this is *not* actual PostgreSQL, RLS, live auth or browser E2E.
- **Gates remaining:** D01 security/role/owner approval is pending; do not use real customer data or enable real login/production. PostgreSQL migrations/RLS, actual IdP, session revocation, MatterACL, endpoint integration and E2E are NOT_RUN. A private Drive run folder exists but no raw test artifact was uploaded.
- **Next:** verify authenticated principal at a request boundary with SRS-aligned API workflow without inventing an unauthorized tenant-switch endpoint; test real PostgreSQL/RLS separately when available.

## R25 — flat 11-UC blocks, informational modal click repaired

- **Owner direction DEC-010:** Approved styling refinement, not expansion. Same 11 UCs in three A/B/C categories; UC03/04/07 remain R0 developing, eight remain R1 planned. No private SRS v1.1.15 baseline edits, no backend or production.
- **PR #36 merged** at `3cecb226632121fb4eb709aa2d922fe1e451d0fc`. Minimal catalog CSS creates flat section/block grids, stronger border, stable hover/focus, highlighted R0 stripe; one-line JS selector fix lets all 11 info-only buttons function. Immutable R20 snapshot intact.
- **Tests:** pre-fix CSS red CI run `41732615109`; final code CI `41734140720` **137/137 PASS**. Source-branch actual Chromium verified **11/11** information-modal open/close; 390px group A and 1280px group B screenshots visually checked. 320px source Chromium: clientWidth=scrollWidth=320, box shadow none, single-column catalog. Deployed 320px Chromium: all 11 accessible labels in correct 3 R0 + 8 R1 split, group A screenshot visually checked.
- **Preview:** isolated `ai-law-r0-preview` Worker deployed with source readback of HTML/CSS/JS exactly matching merged main; production unaffected. Private Drive test-run folder prepared, but raw screenshots were not uploaded.
- **Open gates:** physical Owner visual acceptance NOT_RUN; live Worker click script-injection probe NOT_VERIFIED (source-equivalent Chromium interaction did PASS); actual AI/document/backend E2E NOT_RUN. No screenshot bytes in public GitHub.
- **Next:** Owner reviews R25 visual preview; then proceed to small SRS-aligned R0 authenticated principal/membership/API integration without expanding R1 workflows.

## R24 — 11 UC catalog on R0 nonproduction preview

- **Owner direction DEC-009:** Approved grouped display of 11 legal workflows as status-only entries. UC03 translation, UC04 summarization and UC07 grammar correction are shown as **R0 · Đang triển khai**; remaining 8 are **R1 · Sắp triển khai**. Nothing is marked usable. Private SRS v1.1.15 and actual release scope remain unchanged.
- **PR #34 merged:** `332e7cf345d4750bc3403d478d1abc8c6044bc79`. Changes limited to Overview HTML/CSS/preview modal info, README and 3 regressions. Saved `snapshot/r0-ui-mobile-r20-20261103` intact. Isolated `ai-law-r0-preview` Worker updated; all 3 assets read back equal merged main; production untouched.
- **Tests:** Expected preimplementation red CI `41729224471`; final green **133/133** run `41730222478`. Actual deployed Chromium 320px accessibility tree exposes **11 unique buttons** (3 R0, 8 R1); visual screenshots source group A 390px and live group B 390px passed scoped layout checks.
- **Still open:** Full live click/close-modal E2E not verified; 320px group C tall-element screenshot partial; physical Owner device testing NOT_RUN; private Drive test-run folder prepared but raw screenshot bytes not uploaded. Real AI/legal workflows and backend E2E remain NOT_RUN.
- **Next:** Owner checks current 11-UC preview. Continue smallest authenticated principal/membership/API integration task before connecting UC03/04/07. POC1 stays ON_HOLD.

## R23 — first R0 functional core slice (FR12-01 / TC12A)

- **Owner direction DEC-008:** R0 visual design is accepted as reference; start real functionality in small bounded tasks. This is not approval of production or authenticated end-to-end workflows.
- **PR #32 merged** at `0ed8da7bfc08822091a588ff6f99a737d950e7c4`: internal `r0_core/tenant_context.py` selects tenant only after checking trusted active principal/membership. Cross-tenant switches and authz_version changes reset document, matter, chat, search, suggestions and result references; unauthorized cases fail closed.
- **Actual CI:** 14 focused synthetic unit tests PASS; repository suite **130/130 PASS** in GitHub Actions run `41726706712` on PR final head. Evidence: `tests/evidence/AL-R0-FR12-01-TR-20261104-01.json`.
- **Not implemented:** actual authentication provider/session verification, API route, persistent tenant membership store, PostgreSQL RLS, document ACL or user login. The full SRS TC12A and browser functional E2E are **NOT_RUN**. Unit-only TECH_DONE does not mean application or security acceptance.
- **Next bounded task:** authenticated principal + membership adapter and API integration in nonproduction, with cross-tenant denial tests. Keep private SRS v1.1.15 unchanged, POC1 ON_HOLD, saved R20 UI snapshot intact; no production.

## R22 — document filter visibility repair, live preview verified

- **PR #30 merged:** `94c5fdc75b1ed68064db7bc483d75f90d0d2501a`. R22 targets only 320–390px document filter strip clipping and its unittest; 2×2 buttons at <=620px. Main CSS was deployed to isolated `ai-law-r0-preview` Worker; HTML and JavaScript unchanged.
- **Test-first:** initial new regression test intentionally failed CI run `41672607713`; final PR-head CI `41673660703` passed **116/116 tests** and JS syntax. Cloudflare Chromium branch static render and actual live preview at **320px** and **390px** show all four filter choices without clipping, with synthetic document rows in live render. Live Worker CSS readback exactly equals main.
- **Screenshot evidence:** images were inspected during tool execution, but raw bytes have **not** been uploaded to Drive. Private Drive test-run folder was created, but must not be linked from this public repo.
- **Not verified:** physical mobile Owner visual acceptance, full authenticated app/AI/legal workflows, exhaustive accessibility and interaction E2E. User-selected R20 snapshot `snapshot/r0-ui-mobile-r20-20261103` is untouched; SRS v1.1.15 remains private/unchanged.
- **Next:** Owner reviews `https://ai-law-r0-preview.iaict-platform.workers.dev/#documents` on physical mobile. Do not treat this as R0 application or design final acceptance.

## R21 — saved R0 UI visual reference

- **Owner request DEC-007:** “Lưu giao diện này lại.”
- **Immutable source commit:** `19f02b9e53ce9a2db733d2cfeb92c62eac01b26f`, merged in PR #28 after the R20 mobile typography/contrast/touch-target review.
- **Recovery branch:** `snapshot/r0-ui-mobile-r20-20261103`, created at the exact source commit above; confirmed `web/r0-preview/styles.css` includes R20 mobile legibility/touch adjustments. Branch URL: `https://github.com/ntdung-tds/Mihy-Law-Agent/tree/snapshot/r0-ui-mobile-r20-20261103/web/r0-preview`.
- **UI code:** `web/r0-preview/index.html`, `web/r0-preview/styles.css`, `web/r0-preview/app.js`. These code files remain **unchanged** by R21.
- **Live preview:** `https://ai-law-r0-preview.iaict-platform.workers.dev/` serves the later R22 mobile filter refinement; immutable R20 reference remains at the snapshot branch.
- **R20 verified baseline:** 115/115 CI PASS; scoped Chromium widths 320, 390 and 768px PASS. Physical-device review and actual app/backend E2E remain unverified.
- **Owner intent:** save a design checkpoint for reference / rollback, not to approve R0 functionality, release to production, authorize true client data or alter the SRS.

## Follow-up

Continue functional R0 slices on separate task branches while retaining the saved R20 design and R25 preview (unchanged by R26/R27). Owner is final project acceptor; POC1 stays ON_HOLD, POC2 and POC3 remain PLANNED.

## Publication boundary

Synthetic preview source and public-safe PCS notes only. No internal SRS, genuine legal/client data, secrets, screenshots or private Drive identifiers.
