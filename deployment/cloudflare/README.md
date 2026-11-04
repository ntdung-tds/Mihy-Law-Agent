# AI Law R43 — Cloudflare Workers Free, D1, Google Drive boundary

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
