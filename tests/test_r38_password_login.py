"""R38 nonproduction isolated password login and JWT interface regression tests.

This unit suite uses a fake *storage* callback to isolate request validation;
the GitHub Actions standalone-login job separately performs actual Argon2id,
PostgreSQL16, Docker HTTP and signed-JWT E2E. No secrets are printed.
"""
from __future__ import annotations

from io import BytesIO
import json
import os
import unittest
from unittest.mock import patch

from argon2 import PasswordHasher
from cryptography.hazmat.primitives.asymmetric import rsa
import jwt

from r0_core.jwks_verifier import JWKSAccessTokenVerifier
from r0_core.standalone_password_auth import (
    AccountStoreUnavailable, CredentialsDenied,
    LocalPasswordAuthStore, StandaloneAuthApp, create_auth_app,
)

ISSUER = "https://idp.example.invalid"
AUDIENCE = "ai-law-api"
USER_ID = "11111111-1111-4111-8111-111111111111"
TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


class FakeAccountStore:
    def __init__(self):
        self.sessions = []
        self.logged_out = []
        self.password_resets = []
        self.unavailable = False

    def verify(self, email, password):
        if self.unavailable:
            raise AccountStoreUnavailable("internal SQL error must not leak")
        if (email != "lawyer@example.invalid"
                or password != "synthetic-only-strong-password"):
            raise CredentialsDenied("generic")
        return USER_ID, "fixture-lawyer"

    def membership(self, uid, tenant):
        if uid != USER_ID or tenant != TENANT_ID:
            raise CredentialsDenied("No tenant")
        return object()

    def start_session(self, *, user_id, tenant_id, session_id):
        self.sessions.append((user_id, tenant_id, session_id))

    def clear_password_failures(self, email):
        self.password_resets.append(email)

    def logout(self, issuer, subject, sid):
        self.logged_out.append((issuer, subject, sid))


class PasswordLoginWSGITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.private = rsa.generate_private_key(public_exponent=65537,
                                               key_size=2048)
        public = jwt.algorithms.RSAAlgorithm.to_jwk(
            cls.private.public_key(), as_dict=True,
        )
        public.update(kid="test-key-1", alg="RS256", use="sig")
        cls.verifier = JWKSAccessTokenVerifier(
            issuer=ISSUER, audience=AUDIENCE, jwks_url=ISSUER + "/keys",
        )
        cls.verifier._jwks.fetch_data = lambda: {"keys": [public]}

    def setUp(self):
        self.store = FakeAccountStore()
        self.app = StandaloneAuthApp(
            store=self.store, private_key=self.private,
            verifier=self.verifier, kid="test-key-1",
        )
        self.data = {"email": "lawyer@example.invalid",
                     "password": "synthetic-only-strong-password",
                     "tenant_id": TENANT_ID}

    def invoke(self, *, path="/standalone/auth/login", content=None,
               authorization=None, method="POST", content_type="application/json"):
        payload = json.dumps(self.data).encode() if content is None else content
        status = []
        headers = []
        environ = {
            "REQUEST_METHOD": method, "PATH_INFO": path,
            "CONTENT_TYPE": content_type, "CONTENT_LENGTH": str(len(payload)),
            "wsgi.input": BytesIO(payload),
            "HTTP_AUTHORIZATION": authorization,
        }
        def started(code, output):
            status.append(int(code[:3]))
            headers.extend(output)
        body = b"".join(self.app(environ, started))
        return status[0], json.loads(body), dict(headers)

    def test_real_rsa_signing_after_successful_credentials_and_tenant(self):
        status, body, headers = self.invoke()
        self.assertEqual(status, 200)
        self.assertEqual(body["token_type"], "Bearer")
        self.assertEqual(body["expires_in"], 900)
        self.assertEqual(body["tenant_id"], TENANT_ID)
        token = body["access_token"]
        self.assertEqual(jwt.get_unverified_header(token)["typ"], "at+jwt")
        claims = jwt.decode(token, self.private.public_key(),
                            algorithms=["RS256"], issuer=ISSUER,
                            audience=AUDIENCE)
        self.assertEqual(claims["sub"], "fixture-lawyer")
        self.assertEqual(claims["sid"], self.store.sessions[0][2])
        self.assertEqual((self.store.sessions[0][0], self.store.sessions[0][1]),
                         (USER_ID, TENANT_ID))
        self.assertEqual(self.store.password_resets, ["lawyer@example.invalid"])
        self.assertEqual(headers["Cache-Control"], "no-store")

    def test_bad_password_and_requested_unauthorized_tenant_fail_closed(self):
        self.data["password"] = "bad-password-123"
        status, body, _ = self.invoke()
        self.assertEqual((status, body), (401, {"code": "UNAUTHENTICATED"}))
        self.assertFalse(self.store.sessions)
        self.data["password"] = "synthetic-only-strong-password"
        self.data["tenant_id"] = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        status, body, _ = self.invoke()
        self.assertEqual((status, body), (401, {"code": "UNAUTHENTICATED"}))
        self.assertFalse(self.store.sessions)

    def test_invalid_json_body_schema_and_content_type_are_400(self):
        for content, ctype in (
            (b"{", "application/json"),
            (b"[]", "application/json"),
            (b"{}", "application/json"),
            (json.dumps(self.data).encode(), "text/plain"),
            (b"x"*2049, "application/json"),
        ):
            with self.subTest(ctype=ctype, length=len(content)):
                status, data, _ = self.invoke(content=content, content_type=ctype)
                self.assertEqual((status, data), (400, {"code": "INVALID_REQUEST"}))
        self.assertFalse(self.store.sessions)

    def test_logout_only_with_valid_signed_bearer(self):
        _, response, _ = self.invoke()
        bearer = response["access_token"]
        status, data, _ = self.invoke(path="/standalone/auth/logout",
                                      content=b"",
                                      authorization="Bearer " + bearer)
        self.assertEqual((status, data), (200, {"ok": True}))
        self.assertEqual(self.store.logged_out[0][0:2],
                         (ISSUER, "fixture-lawyer"))
        for auth in (None, "Bearer invalid.token.value"):
            status, data, _ = self.invoke(path="/standalone/auth/logout",
                                          content=b"", authorization=auth)
            self.assertEqual((status, data), (401, {"code": "UNAUTHENTICATED"}))

    def test_unavailable_account_store_does_not_disclose_sql_error(self):
        self.store.unavailable = True
        status, data, _ = self.invoke()
        self.assertEqual((status, data),
                         (503, {"code": "DEPENDENCY_UNAVAILABLE"}))

    def test_only_private_test_routes_and_explicit_nonprod_mode(self):
        for path, method in (("/v1/identities", "GET"),
                             ("/standalone/auth/create", "POST"),
                             ("/standalone/auth/login", "GET")):
            status, data, _ = self.invoke(path=path, method=method)
            self.assertEqual((status, data), (404, {"code": "NOT_FOUND"}))
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError):
                create_auth_app()
        with patch.dict(os.environ, {"AI_LAW_NONPROD_R38":
                                     "isolated-login-fixture-only"}, clear=True):
            with self.assertRaises(RuntimeError):
                create_auth_app()


class PasswordStorageArgon2idTests(unittest.TestCase):
    def test_real_hash_verification_no_plaintext_db_secret(self):
        password = "only-for-this-test-r38"
        digest = PasswordHasher(time_cost=2, memory_cost=19456,
                                parallelism=1).hash(password)
        self.assertTrue(digest.startswith("$argon2id$"))
        row = (USER_ID, "fixture-lawyer", digest, "active", 0, False)
        with patch.object(LocalPasswordAuthStore, "_read", return_value=row):
            internal_id, sub = LocalPasswordAuthStore("unused").verify(
                "lawyer@example.invalid", password,
            )
        self.assertEqual((internal_id, sub), (USER_ID, "fixture-lawyer"))

    def test_wrong_password_denies_and_records_failed_attempt(self):
        password = "only-for-this-test-r38"
        digest = PasswordHasher(time_cost=2, memory_cost=19456,
                                parallelism=1).hash(password)
        row = (USER_ID, "fixture-lawyer", digest, "active", 0, False)
        with patch.object(LocalPasswordAuthStore, "_read", return_value=row), \
                patch.object(LocalPasswordAuthStore,
                             "_record_failure") as failure:
            with self.assertRaises(CredentialsDenied):
                LocalPasswordAuthStore("unused").verify(
                    "lawyer@example.invalid", "wrong-test-password",
                )
            failure.assert_called_once_with("lawyer@example.invalid")

    def test_disabled_or_locked_account_denies_valid_password(self):
        password = "only-for-this-test-r38"
        digest = PasswordHasher(time_cost=2, memory_cost=19456,
                                parallelism=1).hash(password)
        for status, locked in (("disabled", False), ("active", True)):
            with self.subTest(status=status, locked=locked):
                row = (USER_ID, "fixture-lawyer", digest, status, 5, locked)
                with patch.object(LocalPasswordAuthStore, "_read",
                                  return_value=row):
                    with self.assertRaises(CredentialsDenied):
                        LocalPasswordAuthStore("unused").verify(
                            "lawyer@example.invalid", password,
                        )


if __name__ == "__main__":
    unittest.main()
