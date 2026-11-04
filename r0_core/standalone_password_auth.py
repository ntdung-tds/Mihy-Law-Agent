"""R38 NONPRODUCTION standalone password-account test service.

Real HTTP password verification (Argon2id), PostgreSQL membership selection,
persisted revocable sessions and actual RS256 JWT signing. Unlike R37, bearer
tokens are now obtained through actual account/password login, not mint tools.

This deliberately small *test fixture* is NOT an approved production IdP,
OIDC authorization server, signup/billing, MFA or final SRS IAM API.
It will not start without an explicit isolated-test environment flag.
Only a separate dedicated auth container has the ephemeral RSA private key.
"""
from __future__ import annotations

import base64
from contextlib import closing
from dataclasses import dataclass
from json import dumps, loads
import os
import re
import secrets
import time
from typing import Any
from uuid import UUID
from wsgiref.simple_server import make_server

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from cryptography.hazmat.primitives import serialization
import psycopg

from .jwks_verifier import JWKSAccessTokenVerifier
from .membership_repository import PostgresMembershipRepository, select_tenant_from_store
from .postgres_scope import ScopedPostgresFactory, VerifiedDatabaseScope
from .tenant_context import AuthenticatedPrincipal, _canonical_uuid

_ISSUER = "https://idp.example.invalid"
_AUDIENCE = "ai-law-api"
_RESPONSE = {200: "OK", 400: "Bad Request", 401: "Unauthorized",
             404: "Not Found", 503: "Service Unavailable"}
_EMAIL = re.compile(r"^[a-z0-9][a-z0-9._+-]{0,80}@[a-z0-9][a-z0-9.-]{1,160}$")
_PWH = PasswordHasher(time_cost=2, memory_cost=19456,
                      parallelism=1, hash_len=32, salt_len=16)
# Construct the dummy exactly once, never stored as a usable account.
_DUMMY_HASH = _PWH.hash(secrets.token_urlsafe(24))


class CredentialsDenied(PermissionError):
    """Always return a generic 401 independent of account validity."""


class AccountStoreUnavailable(RuntimeError):
    """Only trusted datastore access failures; never return raw SQL diagnostics."""


@dataclass(frozen=True)
class LocalPasswordAuthStore:
    dsn: str

    def _connection(self):
        return psycopg.connect(self.dsn, options="-c search_path=ai_law,pg_catalog")

    def _read(self, query, params):
        try:
            with closing(self._connection()) as conn:
                return conn.execute(query, params).fetchone()
        except Exception:
            raise AccountStoreUnavailable("Account store unavailable") from None

    def verify(self, email: str, password: str):
        row = self._read(
            """SELECT p.user_id,p.subject,p.password_hash,p.status,
                      p.failed_attempts,
                      (p.locked_until IS NOT NULL AND p.locked_until > now())
               FROM ai_law_nonprod.password_accounts p
               JOIN ai_law_nonprod.identities i
                 ON i.issuer=p.issuer AND i.subject=p.subject
                  AND i.user_id=p.user_id AND i.status='active'
               WHERE p.email=%s AND p.issuer=%s""",
            (email, _ISSUER),
        )
        # Even nonexistent accounts do a real Argon2id verify.
        encoded_hash = row[2] if row else _DUMMY_HASH
        try:
            valid = _PWH.verify(encoded_hash, password)
        except (VerificationError, InvalidHashError):
            valid = False
        if (not row or row[3] != "active" or row[5] or
                not isinstance(valid, bool) or not valid):
            if row and row[3] == "active" and not row[5] and not valid:
                self._record_failure(email)
            raise CredentialsDenied("Authentication failed")
        # Password checked; never use a caller-supplied role or user id.
        return str(row[0]), row[1]

    def _record_failure(self, email: str):
        try:
            with self._connection() as conn:
                conn.execute(
                    """UPDATE ai_law_nonprod.password_accounts SET
                         failed_attempts=least(failed_attempts+1,5),
                         locked_until=CASE WHEN failed_attempts+1>=5
                           THEN now()+interval '15 minutes' ELSE locked_until END
                       WHERE email=%s AND issuer=%s AND status='active'""",
                    (email, _ISSUER),
                )
        except Exception:
            raise AccountStoreUnavailable("Account store unavailable") from None

    def membership(self, uid: str, tenant_id: str):
        try:
            repo = PostgresMembershipRepository(
                open_connection=ScopedPostgresFactory(
                    open_connection=self._connection,
                    scope=VerifiedDatabaseScope(user_id=uid, tenant_id=tenant_id),
                ),
                approved_registry_version="1.1.15",
            )
            return select_tenant_from_store(
                principal=AuthenticatedPrincipal(user_id=uid, status="active"),
                current=None, target_tenant_id=tenant_id, repository=repo,
            )
        except Exception:
            raise CredentialsDenied("Authentication failed") from None

    def start_session(self, *, user_id: str, tenant_id: str, session_id: str):
        try:
            with self._connection() as conn:
                # A successful password check does not automatically authorize
                # tenant selection; membership() was independently checked.
                conn.execute(
                    """INSERT INTO ai_law_nonprod.sessions
                       (session_id,user_id,active_tenant_id,expires_at,revoked_at)
                       VALUES (%s,CAST(%s AS uuid),CAST(%s AS uuid),
                               now()+interval '15 minutes',NULL)""",
                    (session_id, user_id, tenant_id),
                )
        except Exception:
            raise AccountStoreUnavailable("Session store unavailable") from None

    def clear_password_failures(self, email: str):
        try:
            with self._connection() as conn:
                conn.execute(
                    """UPDATE ai_law_nonprod.password_accounts
                       SET failed_attempts=0,locked_until=NULL
                       WHERE email=%s AND issuer=%s""",
                    (email, _ISSUER),
                )
        except Exception:
            raise AccountStoreUnavailable("Account store unavailable") from None

    def logout(self, issuer: str, subject: str, session_id: str):
        try:
            with self._connection() as conn:
                conn.execute(
                    """UPDATE ai_law_nonprod.sessions AS s
                       SET revoked_at=now()
                       FROM ai_law_nonprod.identities AS i
                       WHERE s.session_id=%s AND s.user_id=i.user_id
                         AND i.issuer=%s AND i.subject=%s
                         AND s.revoked_at IS NULL""",
                    (session_id, issuer, subject),
                )
        except Exception:
            raise AccountStoreUnavailable("Session store unavailable") from None


@dataclass(frozen=True)
class StandaloneAuthApp:
    store: LocalPasswordAuthStore
    private_key: Any
    verifier: JWKSAccessTokenVerifier
    kid: str

    def __call__(self, environ, start_response):
        def respond(status, data):
            body = dumps(data, separators=(",", ":")).encode("utf-8")
            start_response(f"{status} {_RESPONSE[status]}", [
                ("Content-Type", "application/json; charset=utf-8"),
                ("Content-Length", str(len(body))),
                ("Cache-Control", "no-store"),
                ("X-Content-Type-Options", "nosniff"),
            ])
            return [body]

        path = environ.get("PATH_INFO")
        if environ.get("REQUEST_METHOD") != "POST" or path not in (
                "/standalone/auth/login", "/standalone/auth/logout"):
            return respond(404, {"code": "NOT_FOUND"})
        try:
            if path == "/standalone/auth/login":
                if (environ.get("CONTENT_TYPE") != "application/json" or
                        not str(environ.get("CONTENT_LENGTH", "")).isdigit() or
                        not 1 <= int(environ["CONTENT_LENGTH"]) <= 2048):
                    return respond(400, {"code": "INVALID_REQUEST"})
                raw = environ["wsgi.input"].read(int(environ["CONTENT_LENGTH"]))
                fields = loads(raw)
                if not isinstance(fields, dict) or set(fields) != {
                        "email", "password", "tenant_id"}:
                    return respond(400, {"code": "INVALID_REQUEST"})
                email, password, tenant_id = (fields.get("email"),
                                              fields.get("password"),
                                              fields.get("tenant_id"))
                if (not isinstance(email, str) or not _EMAIL.fullmatch(email) or
                        not isinstance(password, str) or
                        not 8 <= len(password) <= 128):
                    return respond(400, {"code": "INVALID_REQUEST"})
                try:
                    tenant_id = _canonical_uuid(tenant_id)
                except Exception:
                    return respond(400, {"code": "INVALID_REQUEST"})
                uid, subject = self.store.verify(email, password)
                self.store.membership(uid, tenant_id)
                sid = secrets.token_urlsafe(32)
                self.store.start_session(user_id=uid, tenant_id=tenant_id,
                                         session_id=sid)
                now = int(time.time())
                token = jwt.encode(
                    {"iss": _ISSUER, "aud": _AUDIENCE, "sub": subject,
                     "sid": sid, "iat": now, "nbf": now, "exp": now + 900},
                    key=self.private_key, algorithm="RS256",
                    headers={"typ": "at+jwt", "kid": self.kid},
                )
                self.store.clear_password_failures(email)
                return respond(200, {
                    "access_token": token, "token_type": "Bearer",
                    "expires_in": 900, "tenant_id": tenant_id,
                })

            header = environ.get("HTTP_AUTHORIZATION", "")
            items = header.split(" ") if isinstance(header, str) else []
            if len(items) != 2 or items[0].lower() != "bearer":
                raise CredentialsDenied("Authentication failed")
            verified = self.verifier(items[1])
            self.store.logout(verified.issuer, verified.subject, verified.session_id)
            return respond(200, {"ok": True})
        except (CredentialsDenied, Exception) as exc:
            if isinstance(exc, AccountStoreUnavailable):
                return respond(503, {"code": "DEPENDENCY_UNAVAILABLE"})
            return respond(401, {"code": "UNAUTHENTICATED"})


def create_auth_app():
    if os.environ.get("AI_LAW_NONPROD_R38") != "isolated-login-fixture-only":
        raise RuntimeError("Standalone local passwords are nonproduction-only")
    required = ("AI_LAW_AUTH_DB_DSN", "AI_LAW_TEST_SIGNING_KEY_B64",
                "AI_LAW_TEST_KEY_KID")
    if any(not os.environ.get(k) for k in required):
        raise RuntimeError("Nonproduction credential service config incomplete")
    key_data = base64.b64decode(os.environ["AI_LAW_TEST_SIGNING_KEY_B64"],
                                validate=True)
    private = serialization.load_pem_private_key(key_data, password=None)
    kid = os.environ["AI_LAW_TEST_KEY_KID"]
    if not isinstance(kid, str) or not 8 <= len(kid) <= 128:
        raise RuntimeError("Invalid configured signing key ID")
    public_jwk = jwt.algorithms.RSAAlgorithm.to_jwk(
        private.public_key(), as_dict=True,
    )
    public_jwk.update(kid=kid, use="sig", alg="RS256")
    verifier = JWKSAccessTokenVerifier(
        issuer=_ISSUER, audience=_AUDIENCE, jwks_url=_ISSUER + "/keys",
    )
    verifier._jwks.fetch_data = lambda: {"keys": [public_jwk]}
    return StandaloneAuthApp(
        store=LocalPasswordAuthStore(os.environ["AI_LAW_AUTH_DB_DSN"]),
        private_key=private, verifier=verifier, kid=kid,
    )


if __name__ == "__main__":
    with make_server("0.0.0.0", 8081, create_auth_app()) as server:
        server.serve_forever()
