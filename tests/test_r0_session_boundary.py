"""R27: server-controlled bearer identity boundary, synthetic tests only.

A fake verifier and fake membership DB-API connection are used. These tests
DO NOT verify JWT signatures, deploy a real identity provider, or test RLS.
"""
from dataclasses import replace
import unittest

from r0_core.tenant_context import AuthenticatedPrincipal, TenantContextDenied, TenantView
from r0_core.membership_repository import PostgresMembershipRepository
from r0_core.session_boundary import (
    VerifiedBearerIdentity,
    SessionRejected,
    authenticate_bearer_principal,
    select_tenant_for_bearer_request,
)

USER = "11111111-1111-4111-8111-111111111111"
TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
ISSUER = "https://idp.example.invalid/tenant"
AUDIENCE = "ai-law-api"
NOW = 1800000000
TOKEN = "synthetic.signed.fixture"


class StubCursor:
    def __init__(self, rows):
        self.rows = rows
        self.query = None
        self.params = None
        self.closed = False

    def execute(self, query, params):
        self.query = query
        self.params = params

    def fetchall(self):
        return self.rows

    def close(self):
        self.closed = True


class StubConnection:
    def __init__(self, rows):
        self.cur = StubCursor(rows)
        self.closed = False

    def cursor(self):
        return self.cur

    def close(self):
        self.closed = True


class SessionBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.verified = VerifiedBearerIdentity(
            issuer=ISSUER,
            subject="external-provider-subject",
            audience=(AUDIENCE,),
            session_id="idp-session-123",
            issued_at=NOW - 100,
            not_before=NOW - 100,
            expires_at=NOW + 600,
        )
        self.calls = []
        self.principal = AuthenticatedPrincipal(user_id=USER, status="active")
        self.session_active = True
        self.rows_by_tenant = {
            TENANT_A: [(USER, TENANT_A, "active", 1, "1.1.15", "personal", "lawyer")],
            TENANT_B: [(USER, TENANT_B, "active", 2, "1.1.15", "organization", "lawyer")],
        }
        self.connection = None

    def verify(self, token):
        self.calls.append(("verify", token))
        return self.verified

    def resolve(self, issuer, subject):
        self.calls.append(("resolve", issuer, subject))
        return self.principal

    def active(self, user_id, session_id):
        self.calls.append(("session", user_id, session_id))
        return self.session_active

    def repo(self):
        def open_conn():
            # Repository binds the tenant in params; this stub returns a row only for
            # the requested tenant, allowing the real adapter to check all fields.
            return self.connection

        return PostgresMembershipRepository(open_conn, "1.1.15")

    def login(self, header="Bearer " + TOKEN):
        return authenticate_bearer_principal(
            authorization_header=header,
            token_verifier=self.verify,
            identity_lookup=self.resolve,
            session_is_active=self.active,
            expected_issuer=ISSUER,
            expected_audience=AUDIENCE,
            now_epoch=NOW,
        )

    def test_verified_request_maps_external_identity_to_internal_principal(self):
        p = self.login()
        self.assertEqual(p, self.principal)
        self.assertEqual(self.calls, [
            ("verify", TOKEN),
            ("resolve", ISSUER, "external-provider-subject"),
            ("session", USER, "idp-session-123"),
        ])

    def test_missing_or_malformed_bearer_is_rejected_before_verifier(self):
        for h in (None, "", TOKEN, "Basic a", "Bearer", "Bearer ",
                  "Bearer abc def", "Bearer a\nb", "Bearer " + "a" * 9000):
            with self.subTest(header=repr(h)[:60]):
                self.calls.clear()
                with self.assertRaises(SessionRejected):
                    self.login(h)
                self.assertEqual(self.calls, [])

    def test_external_claims_cannot_override_internal_principal(self):
        self.assertEqual(self.login().user_id, USER)
        self.assertNotEqual(self.verified.subject, USER)
        self.assertNotIn(("resolve", ISSUER, USER), self.calls)

    def test_issuer_and_audience_mismatch_denied(self):
        for changed in (
            {"issuer": "https://evil.example.invalid"},
            {"audience": ("other-service",)},
            {"audience": ()},
        ):
            with self.subTest(changed=changed):
                self.verified = replace(self.verified, **changed)
                with self.assertRaises(SessionRejected):
                    self.login()
                self.assertFalse(any(c[0] == "resolve" for c in self.calls))
                self.calls.clear()
                self.verified = replace(self.verified, issuer=ISSUER, audience=(AUDIENCE,))

    def test_expired_future_or_invalid_time_claims_denied(self):
        for changed in (
            {"expires_at": NOW},
            {"not_before": NOW + 1},
            {"issued_at": NOW + 1},
            {"expires_at": NOW - 1},
            {"expires_at": True},
            {"not_before": NOW + 700},
        ):
            with self.subTest(changed=changed):
                self.verified = replace(self.verified, **changed)
                with self.assertRaises(SessionRejected):
                    self.login()
                self.verified = replace(
                    self.verified, expires_at=NOW + 600,
                    not_before=NOW - 100, issued_at=NOW - 100,
                )

    def test_blank_identity_or_session_id_denied(self):
        for changed in ({"subject": ""}, {"session_id": ""}, {"subject": " " }):
            with self.subTest(changed=changed):
                self.verified = replace(self.verified, **changed)
                with self.assertRaises(SessionRejected):
                    self.login()
                self.verified = replace(
                    self.verified, subject="external-provider-subject", session_id="idp-session-123",
                )

    def test_revoked_session_denied_even_if_crypto_verifier_accepts_token(self):
        self.session_active = False
        with self.assertRaises(SessionRejected):
            self.login()

    def test_disabled_or_missing_internal_principal_denied(self):
        for principal in (None, AuthenticatedPrincipal(user_id=USER, status="disabled")):
            with self.subTest(principal=principal):
                self.principal = principal
                with self.assertRaises(SessionRejected):
                    self.login()

    def test_verifier_lookup_and_session_outages_fail_closed_without_leak(self):
        def err(*_):
            raise RuntimeError("provider-secret-key")
        for key in ("token_verifier", "identity_lookup", "session_is_active"):
            with self.subTest(callback=key):
                args = dict(
                    authorization_header="Bearer " + TOKEN, token_verifier=self.verify,
                    identity_lookup=self.resolve, session_is_active=self.active,
                    expected_issuer=ISSUER, expected_audience=AUDIENCE, now_epoch=NOW,
                )
                args[key] = err
                with self.assertRaises(SessionRejected) as caught:
                    authenticate_bearer_principal(**args)
                self.assertNotIn("provider-secret-key", str(caught.exception))

    def test_full_boundary_verified_identity_then_membership_recheck(self):
        self.connection = StubConnection(self.rows_by_tenant[TENANT_A])
        a = select_tenant_for_bearer_request(
            authorization_header="Bearer " + TOKEN, token_verifier=self.verify,
            identity_lookup=self.resolve, session_is_active=self.active,
            expected_issuer=ISSUER, expected_audience=AUDIENCE, now_epoch=NOW,
            target_tenant_id=TENANT_A, current=None, membership_repository=self.repo(),
        )
        self.assertEqual((a.user_id, a.tenant_id), (USER, TENANT_A))
        self.assertEqual(self.connection.cur.params[:2], (USER, TENANT_A))
        self.assertTrue(self.connection.closed)
        old = TenantView(USER, TENANT_A, "personal", 1,
                         selected_document_ids=("A-private",), chat_turns=("A-secret",))
        self.connection = StubConnection(self.rows_by_tenant[TENANT_B])
        b = select_tenant_for_bearer_request(
            authorization_header="Bearer " + TOKEN, token_verifier=self.verify,
            identity_lookup=self.resolve, session_is_active=self.active,
            expected_issuer=ISSUER, expected_audience=AUDIENCE, now_epoch=NOW,
            target_tenant_id=TENANT_B, current=old, membership_repository=self.repo(),
        )
        self.assertEqual((b.tenant_id, b.authz_version), (TENANT_B, 2))
        self.assertEqual(b.selected_document_ids, ())
        self.assertEqual(b.chat_turns, ())

    def test_session_revoked_prevents_membership_lookup(self):
        self.session_active = False
        self.connection = StubConnection(self.rows_by_tenant[TENANT_A])
        with self.assertRaises(SessionRejected):
            select_tenant_for_bearer_request(
                authorization_header="Bearer " + TOKEN, token_verifier=self.verify,
                identity_lookup=self.resolve, session_is_active=self.active,
                expected_issuer=ISSUER, expected_audience=AUDIENCE, now_epoch=NOW,
                target_tenant_id=TENANT_A, current=None, membership_repository=self.repo(),
            )
        self.assertFalse(self.connection.closed)

    def test_no_membership_after_verified_session_is_denied(self):
        self.connection = StubConnection([])
        with self.assertRaises(TenantContextDenied):
            select_tenant_for_bearer_request(
                authorization_header="Bearer " + TOKEN, token_verifier=self.verify,
                identity_lookup=self.resolve, session_is_active=self.active,
                expected_issuer=ISSUER, expected_audience=AUDIENCE, now_epoch=NOW,
                target_tenant_id=TENANT_B, current=None, membership_repository=self.repo(),
            )


if __name__ == "__main__":
    unittest.main()
