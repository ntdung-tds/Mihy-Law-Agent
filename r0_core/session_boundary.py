"""R27 internal bearer-session authentication seam for R0.

WARNING: This module does not verify JWT signatures, discover keys, manage IdP
users, implement MFA, provision sessions or expose an HTTP route. For use ONLY
behind a trusted, fully configured issuer-specific JWT verifier and authoritative
identity/session stores. A synthetic fake verifier is used solely in unit tests.

The client may request a tenant, but can never supply a principal, issuer,
audience, authz status or role authority. Authorization is rechecked by R26's
fresh membership lookup before selecting a tenant context. Content/job API
handlers still require point-of-use RLS and MatterACL enforcement.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from .tenant_context import AuthenticatedPrincipal, TenantContextDenied, TenantView, _canonical_uuid
from .membership_repository import PostgresMembershipRepository, select_tenant_from_store

_DENIED = "Session authentication failed"
_MAX_BEARER_HEADER = 8192


class SessionRejected(PermissionError):
    """Generic denial; does not reveal token validity, subject, or session state."""


@dataclass(frozen=True, slots=True)
class VerifiedBearerIdentity:
    """Claims ALREADY checked cryptographically by a trusted external verifier.

    Never create this object by decoding unverified JWT payload/request JSON.
    The verifier must enforce allowed signature algorithms, key origin, issuer,
    expected audience, token-use/profile, expiry and replay policy as applicable.
    This module independently enforces key request-boundary invariants.
    """

    issuer: str
    subject: str
    audience: tuple[str, ...]
    session_id: str
    issued_at: int
    not_before: int
    expires_at: int


TokenVerifier = Callable[[str], VerifiedBearerIdentity]
IdentityLookup = Callable[[str, str], AuthenticatedPrincipal | None]
SessionIsActive = Callable[[str, str], bool]


def authenticate_bearer_principal(
    *,
    authorization_header: str | None,
    token_verifier: TokenVerifier,
    identity_lookup: IdentityLookup,
    session_is_active: SessionIsActive,
    expected_issuer: str,
    expected_audience: str,
    now_epoch: int,
) -> AuthenticatedPrincipal:
    """Resolve authenticated bearer request into internal, active user identity.

    Every request rechecks the server session status and internal principal.
    External `sub` is NOT the internal user_id. JWT verification and state
    readers are injected through server configuration, never client payloads.
    """
    try:
        if (not isinstance(authorization_header, str) or
                len(authorization_header) > _MAX_BEARER_HEADER):
            raise SessionRejected(_DENIED)
        # Strict single Bearer credential prevents ambiguous parsing.
        parts = authorization_header.split(" ")
        if (len(parts) != 2 or parts[0].lower() != "bearer" or
                not parts[1] or any(ch.isspace() for ch in parts[1]) or
                not parts[1].isascii()):
            raise SessionRejected(_DENIED)
        if (not callable(token_verifier) or not callable(identity_lookup) or
                not callable(session_is_active) or
                not isinstance(expected_issuer, str) or not expected_issuer.strip() or
                not isinstance(expected_audience, str) or not expected_audience.strip() or
                type(now_epoch) is not int or now_epoch <= 0):
            raise SessionRejected(_DENIED)

        claims = token_verifier(parts[1])
        if not isinstance(claims, VerifiedBearerIdentity):
            raise SessionRejected(_DENIED)
        if (claims.issuer != expected_issuer or
                not isinstance(claims.subject, str) or
                not claims.subject or claims.subject != claims.subject.strip() or
                not isinstance(claims.session_id, str) or
                not claims.session_id or claims.session_id != claims.session_id.strip() or
                not isinstance(claims.audience, tuple) or
                not claims.audience or
                any(not isinstance(a, str) or not a for a in claims.audience) or
                expected_audience not in claims.audience):
            raise SessionRejected(_DENIED)
        if (type(claims.issued_at) is not int or
                type(claims.not_before) is not int or
                type(claims.expires_at) is not int or
                claims.issued_at <= 0 or
                claims.issued_at > now_epoch or
                claims.not_before > now_epoch or
                claims.expires_at <= now_epoch or
                claims.expires_at <= claims.issued_at or
                claims.expires_at <= claims.not_before):
            raise SessionRejected(_DENIED)

        # The only authority to map an external provider subject to the local
        # principal is server-owned identity storage.
        principal = identity_lookup(claims.issuer, claims.subject)
        if not isinstance(principal, AuthenticatedPrincipal) or principal.status != "active":
            raise SessionRejected(_DENIED)
        internal_id = _canonical_uuid(principal.user_id)

        # Fails closed for revoked sessions, disabled identities, and outages.
        if session_is_active(internal_id, claims.session_id) is not True:
            raise SessionRejected(_DENIED)

        return AuthenticatedPrincipal(user_id=internal_id, status="active")
    except Exception:
        # Prevent exposing provider errors, raw credentials, or membership data.
        raise SessionRejected(_DENIED) from None


def select_tenant_for_bearer_request(
    *,
    authorization_header: str | None,
    token_verifier: TokenVerifier,
    identity_lookup: IdentityLookup,
    session_is_active: SessionIsActive,
    expected_issuer: str,
    expected_audience: str,
    now_epoch: int,
    target_tenant_id: str,
    current: TenantView | None,
    membership_repository: PostgresMembershipRepository,
) -> TenantView:
    """A pure request-handling seam, not a new /v1 route or a real login.

    Unauthenticated requests are rejected *before* any membership DB query.
    Authentication is run again on each call; the authorization membership
    adapter separately looks up active tenant rights every time.
    """
    principal = authenticate_bearer_principal(
        authorization_header=authorization_header,
        token_verifier=token_verifier,
        identity_lookup=identity_lookup,
        session_is_active=session_is_active,
        expected_issuer=expected_issuer,
        expected_audience=expected_audience,
        now_epoch=now_epoch,
    )
    return select_tenant_from_store(
        principal=principal,
        current=current,
        target_tenant_id=target_tenant_id,
        repository=membership_repository,
    )
