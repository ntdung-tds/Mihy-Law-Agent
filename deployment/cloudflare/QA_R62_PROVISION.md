# R62 — Nonproduction QA account activation (private operator procedure)

**Scope:** the *existing* isolated Cloudflare D1 `ai-law-standalone-cf-qa` only. This is not a production IAM/IdP, customer consent, real-client data migration, or SRS baseline change. IAICT remains an ordinary organization, hosted SaaS is deferred.

## Safe preparation

- The 10-account R40 password bundle lives in **Owner-private Google Drive**. Export only its `BEGIN_PRIVATE_JSON` … `END_PRIVATE_JSON` object as a plain JSON file outside the public GitHub checkout, with mode `0600`. Do not put this bundle in an issue, PR, shell history, CI secretless job, browser console or debug log.
- Use an authorized, trusted operator computer, with `wrangler` authenticated to the expected Cloudflare account. Do not import the saved R40 Argon2id hash into D1: Cloudflare QA uses PBKDF2-SHA256 (100,000 iterations), different from the standalone PostgreSQL verifier.
- On that operator machine, run (paths are examples; select a private directory outside the repository):

```sh
chmod 600 /private/qa_r40_bundle.json
python deployment/cloudflare/tools/render_r62_qa_verifiers.py \
  --bundle /private/qa_r40_bundle.json \
  --output /private/r62_cf_qa_verifiers.sql
# Review destination/account before executing any write:
npx wrangler d1 execute ai-law-standalone-cf-qa --remote \
  --file=/private/r62_cf_qa_verifiers.sql
```

The renderer never prints or writes plaintext passwords to SQL, writes a new `0600` file using exclusive creation, rejects symlink/checkout paths and mismatched identities, requires all eight approved inputs, and fails before producing SQL when validation fails. Do not print the generated SQL in public logs. Treat even salted hashes as restricted QA infrastructure material.

## Exact expected QA behavior

- **QA-01, QA-02, QA-03, QA-05, QA-06, QA-08, QA-09**: seven new **active** login verifiers, only where the already-created principal has the matching installation/user/status.
- **QA-07**: one **disabled** verifier and disabled principal: login must fail.
- **QA-04**: preserve the existing Cloudflare QA verifier and **its different R44 private password**. Never overwrite it or replace it with the R40 Docker password.
- **QA-10**: belongs to an **independent installation**. Do not add its verifier to the current shared D1. This is why the correct expected D1 count is **9 verifiers**, of which **8 active and 1 disabled**, not 10 active logins.

The helper uses SQL `INSERT ... WHERE EXISTS(principal) AND NOT EXISTS(verifier)`, so re-running does not overwrite existing verifiers or mutate account status. Activation is a separate, privileged operation and is **NOT implied by creating this helper**.

## Operator verification and real E2E gate

1. Read-only query in the chosen D1: count `qa_principals`, `qa_memberships`, `qa_login_verifiers` by status. After successful activation: 10 principal rows, 12 memberships, **8 active + 1 disabled verifiers**; no changes to QA04.
2. Use the existing private R40 credentials for the newly activated QA actors and existing R44 credentials for QA04, with the same-origin login on the nonproduction website. Test valid login, bad password, locked session, logout, 30-minute expiry and disabled QA07.
3. For dual-member QA02, verify both authorized tenants are listed, the server accepts only an active membership, rotates the cookie on switch and rejects the old SID. Test revoked QA06 and other-tenant QA09 negative cases.
4. In real Chromium 320/390/430/1440 and signed backend API tests, verify a tenant administrator cannot read any matter without explicit MatterACL, denial overrides grants, and unrelated tenants cannot enumerate matter titles.
5. Archive test-run reference, PASS/FAIL/BLOCKED/NOT_RUN and screenshots **only** in Owner-private Google Drive. No secret/cookie or customer content in public artifacts. The Owner retains final acceptance.

**Control:** If the private bundle cannot be safely provided to the authorized operator or connector safety blocks its transfer, STOP. Do not invent or reuse a public/default password or label simulated-browser tests as real IdP login.
