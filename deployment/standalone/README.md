# AI Law R36–R37 — standalone-first local deployment bootstrap

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
