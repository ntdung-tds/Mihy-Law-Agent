# AI Law R43–R44 — Cloudflare Workers Free, D1, Google Drive boundary

**Standalone first. IAICT is only an ordinary customer. SaaS deferred.**
SRS v1.1.15 unchanged, R41 Docker/PG16 + saved R40 private QA accounts
parked until Owner supplies a server. No production or real legal case data.

## What this slice does

- The Worker source (src/worker.mjs) only accepts GET. A token must be
  RS256-signed, at+jwt, with fixed HTTPS issuer, audience and signing-key
  profile. User, tenant, installation and sid are NOT trusted from headers.
  The JWT sid is resolved against D1 sessions/active principal/membership.
- D1/SQLite migration (migrations/0001_cf_qa_metadata.sql) defines test-only
  installation, principals, tenants, memberships, sessions, matters, explicit
  MatterACL, queued run snapshots and file pointers. No password, OAuth
  refresh token, actual legal file or production data are in the migration.
- A file read is first authorized in D1, including versioned MatterACL
  allow and deny. The Google Drive read-only adapter checks the file is in
  the explicitly configured organization's root folder and not trashed;
  it does not follow redirects or grant public sharing.
- Without a valid token, D1 binding, approved folder, or Drive grant,
  the Worker FAILS CLOSED. Login, customer OAuth consent, token refresh,
  file upload, delete, indexing and AI legal workflows are NOT implemented.

## R44 — mobile QA login now deployed on Cloudflare Free

Use the real HTTPS QA UI: **https://ai-law-standalone-cf-qa.iaict-platform.workers.dev/**. Owner mobile acceptance instructions are in [QA_R44_MOBILE_LOGIN.md](QA_R44_MOBILE_LOGIN.md). This R44 QA-only implementation includes a server-verified password for the existing synthetic QA-04 user with a **separate Owner-private Cloudflare password**, D1 active session/membership checks, Secure HttpOnly SameSite Strict cookie and logout. It does not reuse or alter the Owner's R40 Docker passwords.

Live GitHub Actions Chromium confirmed 320/390/430/1440 px responsive rendering and QA04 wrong-password **HTTP401**, plus local Node WebCrypto positive login/session/logout tests. Correct-password Owner phone sign-in remains **PENDING Owner acceptance**; no claim that the full mobile product, legal AI workflows or Google Drive OAuth are delivered. No real legal data, production IdP/MFA or production deployment.

## Actual R43 QA deployment status

- **Worker:** `ai-law-standalone-cf-qa` on the existing Cloudflare account, with workers.dev enabled for nonproduction only. Actual technical URL: `https://ai-law-standalone-cf-qa.iaict-platform.workers.dev`.
- **D1 database:** separate `ai-law-standalone-cf-qa` (no IAICT database reuse). Real API migration applied; query of SQLite catalog returned all eight QA metadata table names. No real user/matter/file rows seeded, and JWKS deliberately has empty keys.
- **Live external validation:** GitHub Actions `41802685576` `cloudflare-live-qa` PASS: HTTPS `/health` configured, anonymous `/v1/runs/fixture-run` and file metadata/download return **401**, forbidden POST returns **404**. This does NOT prove valid signed user login or real Google Drive file transfer.
- **Quota:** account had nine D1 databases before R43; this QA DB is the tenth. Cloudflare Free currently limits to ten databases. Further database creation must be reviewed for impact.
- **Preserve security:** Until trusted QA issuer, session data and customer OAuth are approved, leave current JWKS deny-all and Google Drive secret unset. Do not publish a private customer service or disable ACL to make demo pass.

## Verified by tests (not automatically a real Cloudflare deployment)

Local tests using Node.js 22 and Python 3.12, no credentials required:

    node --test deployment/cloudflare/tests/worker.test.mjs
    python -m unittest discover -s deployment/cloudflare/tests -p 'test_sqlite_acl.py' -v

Node tests use real RSA public/private cryptography, mocked D1 binding,
and synthetic fake Google Drive HTTP responses. Python tests execute the
EXACT Worker's SQL in actual SQLite (two installations/tenants, revocation,
suspension, DENY precedence, ACL version and file pointers).

Actual Cloudflare D1 is a DIFFERENT environment and needs separately
recorded real-world E2E, not just these tests.

## Deploying separately as authorized QA (not public production)

1. Review Cloudflare Free quota: 10 D1 DBs/account, 500 MB maximum for each
   Free D1 database (current limits); do not reuse another app's database.
2. Create a *new* independent AI Law QA D1 if quota allows, apply the
   migration, and bind it as DB. Never overwrite any IAICT Portal DB.
3. Copy wrangler.toml.example to a non-secret deployment configuration and
   replace the placeholder D1 UUID. Deploy a separate ai-law-standalone-cf-qa
   Worker. The example's JWKS has ZERO keys, so all private endpoints deny.
4. Before actual QA sign-in, integrate a vetted per-installation identity
   provider, session lifecycle and R40 account mapping under SRS.
   The current Worker is not an IdP and issues no bearer token.
5. Customer-owned Google Drive OAuth 2.0 must be granted for this application,
   preferably the narrow drive.file scope when appropriate. Store any
   access/refresh tokens only in protected server-side storage and design
   renewal, expiration, revocation, consent and Drive API policy checks.
   ChatGPT's connected Drive credential is NOT available to a Worker.
6. Test actual tenant/matter access and revoked privileges on Cloudflare,
   Google Drive real authorized file read, failed OAuth, deleted and
   out-of-folder file, quota/size, browser and audit before Owner acceptance.

## Security/architecture warning

Cloudflare D1 has no PostgreSQL FORCE RLS. These D1 SQL statements enforce
per-request tenant/matter ACL within the Worker; they are an experimental
candidate, not proven parity with the full SRS v1.1.15. Session creation,
role registry, audit completeness, protected user provisioning, legal AI
workflows, file writing and backup/restore require later bounded tasks.
The adapter is intentionally not a universal storage implementation yet.
Future providers include OneDrive, NAS/VPS/S3-compatible, AWS, Azure and
Google Cloud Storage as integration targets, not completed integrations.

Sources:
https://developers.cloudflare.com/workers/platform/limits/
https://developers.cloudflare.com/d1/platform/limits/
https://developers.cloudflare.com/d1/worker-api/d1-database/
https://developers.google.com/workspace/drive/api/guides/api-specific-auth

## R46 — QA-only durable matter register (real metadata)

Apply additive `migrations/0003_cf_qa_matter_catalog.sql` to the *existing isolated AI Law D1 only*. Deploy `src/matter_workspace.mjs` alongside the existing backend Worker modules; preserve ALL preexisting D1/plain-text/secret bindings (never print a secret in logs). Preview has `QA_AUTH` private service binding and eight build modules including `preview_matters.mjs`. API `GET/POST /api/qa/matters` uses the R44 HttpOnly QA cookie, active tenant session, CSRF Origin for writes and explicit versioned MatterACL allow-minus-deny for reads. POST atomically writes matter, creator read/write grants, catalog and creation event. All R46 content is synthetic QA metadata. Real Drive file storage, virus scanning, approved IdP/MFA, production security and full legal SRS functions are **not implemented**; production is BLOCKED.

## R47 — unified professional public website (QA only)

Primary Worker is now `ai-law-web` (not `preview`) at https://ai-law-web.iaict-platform.workers.dev/ . Public homepage and `/login` are separated from protected `/app`; existing R44 QA authentication and R46 D1 matter register continue unchanged through private `QA_AUTH` Service Binding. Source: `deployment/cloudflare/src/site_worker.mjs`, canonical public HTML/CSS/JS: `web/website/`, generated modules: `node tools/build_cf_site.mjs /tmp/ai-law-web-build`. Legacy `ai-law-r0-preview` only redirects to the new host; no secrets, data bindings or API forwarding on that old Worker. All feature/operations/legal-data production gates remain blocked. Do not conflate professional presentation with production-ready legal AI.
