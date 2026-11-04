# AI Law R40 — QA test accounts: provision and retain on a standalone installation

**Owner decision:** Standalone/dedicated AI Law first; IAICT is an ordinary organization in one independent installation. Shared IAICT SaaS RA-01 is deferred. **SRS v1.1.15 unchanged.** This procedure only provisions fictitious QA users for the existing R37–R39 **nonproduction test-only** login and GET TaskRun endpoints; no production account system, public signup, live client data or new SRS role is added.

## The approved bounded QA matrix

Source of truth: `tests/acceptance/R40_STANDALONE_QA_INVENTORY.json`. All ten emails use `@ai-law.invalid` and are not real mailboxes; these are internally operator-issued identities, not emailed invitations.

| QA ID | Test actor | Installation and workspace | Expected result |
| --- | --- | --- | --- |
| QA-01 | Individual legal professional | Primary: individual workspace | Login + own synthetic case 200 |
| QA-02 | Same person with individual and organization membership | Primary: personal + IAICT ordinary organization | Both authorized; no tenant mixing |
| QA-03 | IAICT organization administrator | Primary: IAICT organization | Login 200, ungranted case 404 |
| QA-04 | IAICT organization lawyer | Primary: IAICT organization | Two explicitly granted matters 200 |
| QA-05 | Authenticated nonmember of IAICT | Primary: own personal workspace | Own case 200, IAICT selection 401 |
| QA-06 | Member revoked from IAICT | Primary: personal active, IAICT revoked | Personal 200, IAICT selection 401 |
| QA-07 | Disabled organization account | Primary: IAICT organization | Password correct yet login 401 |
| QA-08 | Limited-permission lawyer | Primary: IAICT organization | Explicit case A 200, unrelated case B 404 |
| QA-09 | Member of unrelated organization | Primary: separate tenant, same installation | Own case 200, IAICT tenant denied |
| QA-10 | Member of a physically separate standalone installation | Secondary: different database/signing key | Own case 200, foreign JWT 401 |

These are **test actors** using only the existing R0 role keys `lawyer` and `tenant_admin`; case scope is determined by actual SQL `MatterACL`. RA-02..RA-09 are covered **for the bounded login/GET TaskRun QA slice**, while full TC12A/B and real legal AI workflows remain NOT_RUN. IAICT has no platform-root bypass.

## Private credential storage

Owner-only private Drive folder: `AI Law R40 QA Credentials Private` (do not include its ID or link in public repository). It contains `AI Law R40 — QA PRIVATE Credentials Bundle (prepared, not live)`, a full JSON payload including **one-time generated** random passwords and Argon2id hashes. Check Drive permissions before any access: owner-only; sharing/publication prohibited. No credentials or hashes in GitHub, issue/PR body, Actions logs, browser screenshots or test evidence.

**Credentials are PREPARED but not active on a permanent server.** To activate, an authorized operator must copy **only the JSON between BEGIN_PRIVATE_JSON and END_PRIVATE_JSON** to a file *outside this checkout*, set mode `0600`, and explicitly provision to a selected QA PostgreSQL installation. The file must remain unchanged; otherwise the DB refuses implicit password rotation.

## Install into an existing isolated QA PostgreSQL16 instance

Run on a dedicated nonproduction host with Python 3.12, Docker Engine and Compose v2; **never** execute against production or a customer case database.

1. Prepare a private directory OUTSIDE the repository (the generated credentials and signing keys must remain there). Example:

```bash
umask 077
mkdir -p "$HOME/.ai-law-qa/primary"
chmod 700 "$HOME/.ai-law-qa" "$HOME/.ai-law-qa/primary"
# Put the private JSON copied from the owner-only Drive document here:
chmod 600 "$HOME/.ai-law-qa/qa-credentials.json"
```

2. Prepare the existing R37/R38 test-only DB/API/auth environment once (or reuse its original secret files if already provisioned). The helper uses the existing **test-only** key pair and writes separate DB credentials into a secret environment file; the helper's three older R38 throwaway account SQL records **must not be applied** alongside this R40 matrix:

```bash
python -m pip install -r requirements-r0-auth.txt "argon2-cffi==25.1.0"
python tools/r37_fixture_crypto.py init "$HOME/.ai-law-qa/primary"
python tools/r38_fixture_prep.py init "$HOME/.ai-law-qa/primary" iaict

AI_LAW_NONPROD_QA=explicitly-approved-qa-only \
  python -m tools.r40_qa_provision render \
    --credentials "$HOME/.ai-law-qa/qa-credentials.json" \
    --installation primary \
    --output "$HOME/.ai-law-qa/primary/qa-seed.sql"
```

3. Build/launch only the **local** per-installation QA containers, with NO host-published auth/API/database ports, and apply the privileged QA SQL via stdin; `qa-seed.sql` contains Argon2id hashes (not plaintext passwords) and must remain private:

```bash
docker build -t ai-law-r37-nonprod:local \
  -f deployment/standalone/Dockerfile.nonprod-api .

docker compose -p ai_law_qa_primary \
  --env-file "$HOME/.ai-law-qa/primary/installation.env" \
  -f deployment/standalone/compose.yaml \
  -f deployment/standalone/compose.api-test.yaml \
  -f deployment/standalone/compose.login-test.yaml \
  up -d --wait

docker compose -p ai_law_qa_primary \
  --env-file "$HOME/.ai-law-qa/primary/installation.env" \
  -f deployment/standalone/compose.yaml \
  -f deployment/standalone/compose.api-test.yaml \
  -f deployment/standalone/compose.login-test.yaml \
  exec -T db psql -X -v ON_ERROR_STOP=1 -U ai_law_admin -d ai_law \
  < "$HOME/.ai-law-qa/primary/qa-seed.sql"
```

4. To retain accounts across restart, do **not** use `down -v`. Docker Compose named PostgreSQL volumes keep the QA table, password hashes, role membership and MatterACL on `down` / `up` as proven in R40 CI. Persist the private `installation.env`, the private JSON and the associated PostgreSQL named volume. A fresh DB volume is **not** a restore of existing QA users; it requires an authorized repeat provisioning. A wrong private bundle is rejected by the `qa_install_registration` fingerprint, not silently accepted.

5. For a **second fully separate** installation, use a distinct Compose project name, a separate private env key/directory, and `--installation secondary` when rendering. Never share database credentials, the private signing key or volumes between installations.

To test the full role matrix *without retaining any generated test resources*, run:

```bash
bash deployment/standalone/smoke_qa.sh
```

The R40 CI smoke creates 10 actual PostgreSQL QA password accounts across two independent instances, performs signed HTTP login/authorization/denial, reapplies SQL idempotently, verifies persistence after **Docker Compose down/up without -v**, rejects a different private credential bundle, then **intentionally deletes its CI test volumes and credentials**.

## Incomplete product acceptance

The QA inventory and private saved credentials do not mean that a live staging URL or permanent SQL database has been provisioned. The connected runtime in GitHub Actions is disposable. Operator-controlled, durable owner-accessible standalone staging remains **NOT_DEPLOYED**; user-facing permanent browser workspace discovery, production-approved IdP/MFA, real legal AI workflows/attachments, backup/restore and full RA/TC12 E2E remain separately gated. Do not publish QA services publicly or mark product ready. The project Owner performs final acceptance.
