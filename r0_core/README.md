# R0 tenant context — read-only membership adapter

Scope: `FR12-01` / `TC12A`, plus an internal guard for `IF01-01` in the **private SRS v1.1.15**. This is a server-side application-core seam, **not a login feature, HTTP API route or a deployed IAM service**.

`r0_core.tenant_context.select_tenant` already handles context resets. `r0_core.membership_repository.PostgresMembershipRepository` supplies its fresh `Membership` from one parameterized DB-API read that checks the current user, selected tenant, active membership, active principal, role registry version, allowed roles, join time and absence of revocation timestamp. Use `select_tenant_from_store` only after **trusted authentication middleware** has verified the session and issued `AuthenticatedPrincipal`; never construct that principal or the connection factory from request JSON.

The SQL uses the proposed `principals`, `tenants`, `memberships`, `membership_roles` and `role_catalog` schema from the SRS contract. `approved_registry_version` must come from controlled server configuration after approval, not client input. `open_connection` must produce a new least-privilege read-only connection using application credentials, without bypassing PostgreSQL RLS. The adapter closes the connection per lookup. Unknown, revoked, future-effective or roleless membership is denied. A new request performs a new DB lookup.

**Not proven or deployed:** actual identity-provider verification, session invalidation and MFA; PostgreSQL schema migrations, triggers, role catalog approval/seed parity, tenant-scoped RLS, audit, MatterACL, document ACL, API binding, concurrent revocation during content access, real database integration, production. The synthetic unit tests execute the relational SELECT against isolated SQLite with a test-only placeholder translator. They do not substitute for PostgreSQL/RLS and browser/API E2E tests. RLS and ACL must be rechecked on all retrieval/job/export operations at point of use. Do not enable this adapter as a live auth boundary until these gates are satisfied.

No new HTTP endpoint was added because the approved OpenAPI lists its own `/v1` resources; an unsupported tenant-switch endpoint must not be invented without SRS change approval. The R25 UI preview remains static, uses only synthetic data and does not call this module.

## R27: trusted Bearer session boundary (not an IdP)

The internal `r0_core.session_boundary.authenticate_bearer_principal` function receives an Authorization Bearer credential, **passes it to an injected trusted signature-verifying provider implementation**, validates the server's expected issuer/audience and token timing, maps the external provider subject to a **server-owned internal UUID** via `identity_lookup`, and checks the current session status via `session_is_active`. Only this verified `AuthenticatedPrincipal` may enter `select_tenant_for_bearer_request`, which invokes the R26 membership adapter with a fresh lookup. The client-provided tenant ID is a selection request, never proof of rights.

Production requirements for the injected verifier (not implemented): correctly validate JWT signature, permitted algorithms/keys and trusted key rotation, token type/claims/expiry and applicable audience/issuer rules; enforce session revocation and MFA/step-up policies for authorized sensitive operations. `expected_issuer`, `expected_audience`, the clock, verifier, identity mapping, session-status provider and database connector must all be configured by trusted server code. **Never pass HTTP JSON fields, unverified JWT payloads or a user-controlled verification callback as trusted inputs.** Generic errors avoid exposing token, user or tenant existence.

No OAuth/OIDC/SAML provider, JWT signing-key management, actual HTTP handler, IAM session database, MFA, entitlement auditing, PostgreSQL RLS, real login, deployment or external request was introduced. The tests inject synthetic verifiers/stores; **161/161** initial green CI included 12 new session-boundary tests. Do not enable the seam for client requests before authorized provider configuration, production-grade tests and required Owner/SEC gates.


## R28: Approved GET /v1/runs/{id} — grouped synthetic API integration

The locked SRS v1.1.15 OpenAPI lists a bearer-protected GET **/v1/runs/{id}** operation (operationId \`getRun\`). R28 implements an isolated WSGI handler in \`r0_core/run_read_wsgi.py\` only for this existing operation. No new tenant-switch endpoint, upload API, AI service or production endpoint has been added.

One bounded batch contains:
1. \`authenticate_bearer_session\` exposes the verified session identifier **only after** the injected trusted verifier, internal principal lookup and active-session check pass. The existing \`authenticate_bearer_principal\` contract is unchanged for existing users.
2. The session's active tenant is resolved by a **trusted server-owned** \`active_tenant_for_session(user_id, session_id)\` callback. Untrusted request/body/header tenant values are ignored. The R26 adapter rechecks current membership on each request; no cross-tenant session data is reused.
3. A server-owned \`authorize_run_read(tenant,user,run)\` predicate must explicitly return boolean \`True\`, and a tenant-scoped \`load_run\` reader must return a matching tenant/run ID. The handler performs defensive TaskRun response-shape checks and emits only contract fields. Actual run ACL and run storage **are not implemented here**.
4. A Python standard-library WSGI loopback HTTP test makes real local GET requests with synthetic JWT verification, membership and run stores, covering 200, 401 and 404; the unit suite also checks 400, 503, error envelopes, invalid run payloads, revocation and dependency failures. Tests do not establish live authorization, real PostgreSQL RLS or real signature verification.

Review-loop corrections: database membership failures now use a narrowly typed \`TenantMembershipUnavailable\` error, mapped to retryable HTTP 503 instead of conflating it with 404; explicitly classified trusted IdP/session-service outages use \`SessionDependencyUnavailable\` and also map to 503 while invalid credentials remain 401. Errors reveal no raw diagnostics. An arbitrary maximum run-ID length absent from OpenAPI was removed. For security, the injected dependencies are server-owned and **must never** be instantiated from client data.

**Nonproduction test-only gate:** The WSGI component requires configured JWT issuer/keys/algorithm verification and session store, an approved active-tenant mapping, real relational membership + RLS, MatterACL/run ACL and run store, audit, source-of-truth authorization before every content access, integration with the approved web stack, production-like load/negative E2E tests and Owner acceptance. None is available in this R28 package. Do not publish it as a live login or legal-product API.

## R30: actual PostgreSQL 16 integration in isolated CI

R30 supplies `r0_core.postgres_scope.ScopedPostgresFactory` (server-verified identity and active-tenant transaction-local PostgreSQL scope), `r0_core.postgres_acl.PostgresMatterRead` (real MatterACL read via FORCE RLS), and a backward-compatible per-request `membership_repository_for_scope` seam for the existing `GetRunWSGI` operation. **No new HTTP operation is introduced.** CI exercises PostgreSQL 16, role without BYPASSRLS, direct SQL tenant/ACL denials and actual loopback HTTP with synthetic bearer verifier and in-memory run payload. See `db/README.md` for migration, security caveats and reproduction steps.

**Not connected to a live product:** IdP/JWT, real run-to-matter storage, immutable audit/outbox, tenant/session cache propagation and production-equivalent security review. D01 and real-data release gates remain locked. No production/staging deployment and no changes to SRS v1.1.15 or R25 visual preview.
