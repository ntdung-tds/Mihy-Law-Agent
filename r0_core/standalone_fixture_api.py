"""R37 runnable standalone read-only API with real SQL and signed JWT.

Nonproduction fixture ONLY. The sole operation is the approved
GET /v1/runs/{id}. Runtime uses PostgreSQL persisted fixture
identities/sessions/run payload and FORCE RLS; issuer signing private keys
are NEVER inside this container or repository.

A real IdP, signup/login UX, canonical TaskRun persistence and legal AI
functions are NOT provided by this module.
"""
from __future__ import annotations

import base64
from contextlib import closing
from dataclasses import dataclass
import json
import os
import time
from wsgiref.simple_server import make_server

import psycopg

from .jwks_verifier import JWKSAccessTokenVerifier
from .membership_repository import PostgresMembershipRepository
from .postgres_acl import PostgresMatterRead
from .postgres_scope import ScopedPostgresFactory, VerifiedDatabaseScope
from .run_read_wsgi import GetRunWSGI, RunSnapshot
from .session_boundary import SessionDependencyUnavailable
from .tenant_context import AuthenticatedPrincipal, _canonical_uuid


@dataclass(frozen=True)
class ReadOnlyStandaloneFixtureStore:
    """Trusted server-side Postgres adapters; the runtime SQL role is SELECT-only."""

    dsn: str

    def open_connection(self):
        return psycopg.connect(self.dsn, options="-c search_path=ai_law,pg_catalog")

    def _read(self, query: str, values: tuple):
        with closing(self.open_connection()) as conn:
            with closing(conn.cursor()) as cur:
                cur.execute(query, values)
                return cur.fetchone()

    def identity_lookup(self, issuer: str, subject: str):
        try:
            row = self._read(
                """SELECT user_id FROM ai_law_nonprod.identities
                   WHERE issuer=%s AND subject=%s AND status='active'""",
                (issuer, subject),
            )
            return AuthenticatedPrincipal(str(row[0]), "active") if row else None
        except Exception:
            raise SessionDependencyUnavailable("Identity store unavailable") from None

    def session_is_active(self, user_id: str, session_id: str) -> bool:
        try:
            return self._read(
                """SELECT 1 FROM ai_law_nonprod.sessions
                   WHERE user_id=CAST(%s AS uuid) AND session_id=%s
                     AND revoked_at IS NULL AND expires_at>now()""",
                (_canonical_uuid(user_id), session_id),
            ) is not None
        except Exception:
            raise SessionDependencyUnavailable("Session store unavailable") from None

    def active_tenant_for_session(self, user_id: str, session_id: str):
        row = self._read(
            """SELECT active_tenant_id FROM ai_law_nonprod.sessions
               WHERE user_id=CAST(%s AS uuid) AND session_id=%s
                 AND revoked_at IS NULL AND expires_at>now()""",
            (_canonical_uuid(user_id), session_id),
        )
        return str(row[0]) if row else None

    def scoped(self, user_id: str, tenant_id: str):
        return ScopedPostgresFactory(
            open_connection=self.open_connection,
            scope=VerifiedDatabaseScope(user_id=user_id, tenant_id=tenant_id),
        )

    def membership_for_scope(self, user_id: str, tenant_id: str):
        return PostgresMembershipRepository(
            open_connection=self.scoped(user_id, tenant_id),
            approved_registry_version="1.1.15",
        )

    def authorize_run_read(self, tenant_id: str, user_id: str, run_id: str):
        # RLS on the persisted run row enforces its underlying MatterACL.
        # Then PostgresMatterRead independently rechecks matter access.
        factory = self.scoped(user_id, tenant_id)
        with closing(factory()) as conn:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    """SELECT matter_id FROM ai_law_nonprod.run_snapshots
                       WHERE tenant_id=CAST(%s AS uuid) AND run_id=%s""",
                    (_canonical_uuid(tenant_id), run_id),
                )
                row = cur.fetchone()
        return bool(row and PostgresMatterRead(factory)(
            tenant_id, user_id, str(row[0]),
        ))

    def load_run_for_scope(self, tenant_id: str, user_id: str, run_id: str):
        # A *fresh* transaction prevents bypassing ACL on the run payload
        # after authorization, including if grant was revoked between checks.
        with closing(self.scoped(user_id, tenant_id)()) as conn:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    """SELECT payload FROM ai_law_nonprod.run_snapshots
                       WHERE tenant_id=CAST(%s AS uuid) AND run_id=%s""",
                    (_canonical_uuid(tenant_id), run_id),
                )
                row = cur.fetchone()
        return (RunSnapshot(tenant_id=tenant_id, run_id=run_id, data=row[0])
                if row else None)


def create_fixture_app():
    """Explicit opt-in test profile; never fallback to unverified login."""
    if os.environ.get("AI_LAW_NONPROD_R37") != "isolated-fixture-only":
        raise RuntimeError("R37 app only starts in isolated nonproduction test mode")
    names = ("AI_LAW_READER_DSN", "AI_LAW_TEST_ISSUER",
             "AI_LAW_TEST_AUDIENCE", "AI_LAW_TEST_JWKS_B64")
    if any(not os.environ.get(name) for name in names):
        raise RuntimeError("Trusted R37 test configuration missing")
    data = base64.b64decode(os.environ["AI_LAW_TEST_JWKS_B64"], validate=True)
    jwks = json.loads(data)
    keys = jwks.get("keys") if isinstance(jwks, dict) else None
    private_fields = {"d", "p", "q", "dp", "dq", "qi", "oth"}
    if (not isinstance(keys, list) or not 1 <= len(keys) <= 4 or
            any(not isinstance(k, dict) or k.get("kty") != "RSA"
                or k.get("alg") != "RS256" or k.get("use") != "sig"
                or (set(k) & private_fields) for k in keys)):
        raise RuntimeError("Only public RSA JWKS in fixture mode")
    issuer = os.environ["AI_LAW_TEST_ISSUER"]
    audience = os.environ["AI_LAW_TEST_AUDIENCE"]
    verifier = JWKSAccessTokenVerifier(
        issuer=issuer, audience=audience,
        jwks_url=issuer.rstrip("/") + "/keys",
    )
    # Fixture-only public-key transport. Cryptographic RS256 signature
    # verification is still real. External HTTPS IdP/JWKS NOT_RUN.
    verifier._jwks.fetch_data = lambda: jwks

    store = ReadOnlyStandaloneFixtureStore(os.environ["AI_LAW_READER_DSN"])
    return GetRunWSGI(
        token_verifier=verifier,
        identity_lookup=store.identity_lookup,
        session_is_active=store.session_is_active,
        active_tenant_for_session=store.active_tenant_for_session,
        membership_repository=PostgresMembershipRepository(
            open_connection=store.open_connection,
            approved_registry_version="1.1.15",
        ),  # unscoped fallback fails closed due to PostgreSQL RLS
        membership_repository_for_scope=store.membership_for_scope,
        authorize_run_read=store.authorize_run_read,
        load_run=lambda _tenant_id, _run_id: None,
        load_run_for_scope=store.load_run_for_scope,
        expected_issuer=issuer,
        expected_audience=audience,
        now_epoch=lambda: int(time.time()),
    )


if __name__ == "__main__":
    with make_server("0.0.0.0", 8080, create_fixture_app()) as server:
        server.serve_forever()
