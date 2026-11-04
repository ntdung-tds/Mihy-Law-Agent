"""Actual RSA signature verification tests; no fake token verifier or IdP.

Keys are ephemeral process memory and never persisted in GitHub.
Network transport is replaced with local *public* JWKS; actual PyJWT JWK
parsing, key selection, RSA signature verification and claim validation run.
"""
from __future__ import annotations

import time
import unittest

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

from r0_core.jwks_verifier import JWKSAccessTokenVerifier
from r0_core.session_boundary import (
    SessionRejected, SessionDependencyUnavailable, VerifiedBearerIdentity,
    authenticate_bearer_session,
)
from r0_core.tenant_context import AuthenticatedPrincipal

ISSUER = "https://identity.example.invalid/realm"
JWKS_URL = "https://identity.example.invalid/realm/keys"
AUDIENCE = "ai-law-api"
USER = "11111111-1111-4111-8111-111111111111"


class SignedJWKSVerifierTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.first = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.second = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.wrong = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.keys = []
        for key, kid in ((cls.first, "key-1"), (cls.second, "key-2")):
            public = jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key(), as_dict=True)
            public.update({"kid": kid, "use": "sig", "alg": "RS256"})
            cls.keys.append(public)

    def setUp(self):
        self.verifier = JWKSAccessTokenVerifier(
            issuer=ISSUER, audience=AUDIENCE, jwks_url=JWKS_URL,
        )
        # Cryptographic verification stays real; only HTTPS key-set lookup is
        # replaced by two public keys in an isolated deterministic fixture.
        self.verifier._jwks.fetch_data = lambda: {"keys": list(self.keys)}
        now = int(time.time())
        self.claims = dict(iss=ISSUER, sub="external-account-A", aud=AUDIENCE,
                           sid="server-session-A", iat=now - 30,
                           nbf=now - 30, exp=now + 600)

    def sign(self, *, changes=None, key=None, kid="key-1", typ="at+jwt",
             alg="RS256", extras=None):
        data = dict(self.claims)
        if changes:
            data.update(changes)
        headers = {"kid": kid, "typ": typ}
        if extras:
            headers.update(extras)
        return jwt.encode(data, key or self.first, algorithm=alg, headers=headers)

    def test_real_rsa_access_token_resolves_checked_identity(self):
        result = self.verifier(self.sign())
        self.assertIsInstance(result, VerifiedBearerIdentity)
        self.assertEqual(result.issuer, ISSUER)
        self.assertEqual(result.audience, (AUDIENCE,))
        self.assertEqual((result.subject, result.session_id),
                         ("external-account-A", "server-session-A"))

    def test_selects_correct_public_key_from_two_key_jwks(self):
        self.assertEqual(
            self.verifier(self.sign(key=self.second, kid="key-2")).subject,
            "external-account-A",
        )

    def test_forged_signature_and_unknown_kid_rejected(self):
        for token in (self.sign(key=self.wrong, kid="key-1"),
                      self.sign(kid="untrusted-key-id")):
            with self.subTest(case=token[:35]):
                with self.assertRaises(SessionRejected):
                    self.verifier(token)

    def test_wrong_issuer_audience_or_session_rejected(self):
        for change in ({"iss": "https://evil.example.invalid"},
                       {"aud": "other-product"},
                       {"sid": ""},
                       {"sid": None},
                       {"sub": ""}):
            with self.subTest(change=change):
                with self.assertRaises(SessionRejected):
                    self.verifier(self.sign(changes=change))
        unsigned_sid = dict(self.claims)
        del unsigned_sid["sid"]
        with self.assertRaises(SessionRejected):
            self.verifier(jwt.encode(unsigned_sid, self.first,
                algorithm="RS256", headers={"typ": "at+jwt", "kid": "key-1"}))

    def test_expired_future_and_non_integer_time_claims_rejected(self):
        now = int(time.time())
        for change in ({"exp": now - 1}, {"nbf": now + 200},
                       {"iat": now + 100}, {"iat": "not-an-integer"},
                       {"exp": True}):
            with self.subTest(change=change):
                with self.assertRaises(SessionRejected):
                    self.verifier(self.sign(changes=change))

    def test_id_token_and_header_selected_key_sources_rejected(self):
        for typ in ("JWT", "id+jwt", ""):
            with self.subTest(typ=typ):
                with self.assertRaises(SessionRejected):
                    self.verifier(self.sign(typ=typ))
        for extra in ({"jku": "https://evil.example.invalid/jwks"},
                      {"jwk": {"kty": "RSA", "n": "x"}},
                      {"x5u": "https://evil.example.invalid/cert"}):
            with self.subTest(extra=extra):
                with self.assertRaises(SessionRejected):
                    self.verifier(self.sign(extras=extra))

    def test_hs256_and_broken_tokens_are_not_accepted(self):
        hs = jwt.encode(self.claims, "synthetic-test-key-long-enough-32-bytes",
                        algorithm="HS256",
                        headers={"typ": "at+jwt", "kid": "key-1"})
        for token in (hs, "", "invalid.token", "x" * 8193, "😃"):
            with self.subTest(case=token[:30]):
                with self.assertRaises(SessionRejected):
                    self.verifier(token)

    def test_jwks_url_must_be_trusted_https_same_origin(self):
        for issuer, url in (
            ("http://identity.example.invalid/realm", JWKS_URL),
            (ISSUER, "http://identity.example.invalid/keys"),
            (ISSUER, "https://evil.example.invalid/keys"),
            (ISSUER, "https://user:secret@identity.example.invalid/keys"),
        ):
            with self.subTest(url=url):
                with self.assertRaises(ValueError):
                    JWKSAccessTokenVerifier(
                        issuer=issuer, audience=AUDIENCE, jwks_url=url)

    def test_jwks_service_outage_yields_generic_dependency_failure(self):
        from jwt.exceptions import PyJWKClientConnectionError

        def broken():
            raise PyJWKClientConnectionError("sensitive-provider-details")

        self.verifier._jwks.fetch_data = broken
        with self.assertRaises(SessionDependencyUnavailable) as caught:
            self.verifier(self.sign())
        self.assertNotIn("sensitive-provider-details", str(caught.exception))

    def test_signed_jwt_session_boundary_checks_revocation(self):
        now = int(time.time())
        resolver = lambda iss, sub: AuthenticatedPrincipal(USER, "active")
        options = dict(
            authorization_header="Bearer " + self.sign(),
            token_verifier=self.verifier, identity_lookup=resolver,
            session_is_active=lambda uid, sid: sid == "server-session-A",
            expected_issuer=ISSUER, expected_audience=AUDIENCE,
            now_epoch=now,
        )
        verified = authenticate_bearer_session(**options)
        self.assertEqual(verified.principal.user_id, USER)
        self.assertEqual(verified.session_id, "server-session-A")
        options["session_is_active"] = lambda uid, sid: False
        with self.assertRaises(SessionRejected):
            authenticate_bearer_session(**options)

    def test_explicit_wrong_internal_principal_fails_even_with_good_signature(self):
        now = int(time.time())
        with self.assertRaises(SessionRejected):
            authenticate_bearer_session(
                authorization_header="Bearer " + self.sign(),
                token_verifier=self.verifier,
                identity_lookup=lambda iss, sub: None,
                session_is_active=lambda uid, sid: True,
                expected_issuer=ISSUER,
                expected_audience=AUDIENCE,
                now_epoch=now,
            )


if __name__ == "__main__":
    unittest.main()
