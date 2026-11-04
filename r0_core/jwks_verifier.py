"""R34: RS256 at+jwt access-token verifier for the existing R0 Bearer boundary.

Trusted server config chooses issuer, audience and JWKS URL; JWT headers and
claims cannot choose any verification endpoint. A verified session id must
still be resolved and revocation-checked by the existing session boundary.

This is not an IdP, login endpoint, session store, MFA or user provisioning.
"""
from __future__ import annotations

from urllib.parse import urlsplit

import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError

from .session_boundary import (
    SessionDependencyUnavailable, SessionRejected, VerifiedBearerIdentity,
)

_DENIED = "Session authentication failed"
_ALLOWED_TYP = frozenset({"at+jwt", "application/at+jwt"})
_MAX_TOKEN = 8192


class JWKSAccessTokenVerifier:
    """Use actual RSA signature verification for a tightly bounded JWT profile.

    Server-owned config is mandatory; JWKS must be HTTPS and same-origin with
    the configured HTTPS issuer. Do not select issuer/JWKS from token values.
    Provider profiles with other token types/claims require separate approval.

    The JWKS set is cached for 300s (not individual keys indefinitely);
    unrecognized kids can trigger library-managed refresh behavior.
    """

    def __init__(self, *, issuer: str, audience: str, jwks_url: str):
        for value in (issuer, audience, jwks_url):
            if not isinstance(value, str) or not value or value != value.strip():
                raise ValueError("Trusted JWT configuration required")
        iss = urlsplit(issuer)
        keys = urlsplit(jwks_url)
        if (iss.scheme != "https" or keys.scheme != "https" or
                not iss.hostname or not keys.hostname or
                iss.netloc != keys.netloc or iss.username or iss.password or
                keys.username or keys.password or iss.query or iss.fragment or
                keys.fragment):
            raise ValueError("Trusted HTTPS same-origin issuer and JWKS required")
        self.issuer = issuer
        self.audience = audience
        self.jwks_url = jwks_url
        self._jwks = PyJWKClient(
            jwks_url, cache_keys=False, cache_jwk_set=True,
            lifespan=300, timeout=3,
        )

    def __call__(self, token: str) -> VerifiedBearerIdentity:
        try:
            if (not isinstance(token, str) or not token or
                    len(token) > _MAX_TOKEN or not token.isascii()):
                raise SessionRejected(_DENIED)
            # Parse header for rejection checks only. No header-specified key
            # location, key or algorithm can override the trusted profile.
            header = jwt.get_unverified_header(token)
            if (not isinstance(header, dict) or
                    header.get("alg") != "RS256" or
                    header.get("typ") not in _ALLOWED_TYP or
                    not isinstance(header.get("kid"), str) or
                    not 1 <= len(header["kid"]) <= 128 or
                    any(k in header for k in ("jku", "jwk", "x5u", "x5c"))):
                raise SessionRejected(_DENIED)
            signing_key = self._jwks.get_signing_key_from_jwt(token)
            if signing_key.key_type != "RSA":
                raise SessionRejected(_DENIED)
            claims = jwt.decode(
                token, key=signing_key.key, algorithms=["RS256"],
                issuer=self.issuer, audience=self.audience,
                options={"require": ["iss", "sub", "aud", "exp", "iat", "nbf", "sid"]},
                leeway=0,
            )
            if (not isinstance(claims, dict) or
                    not isinstance(claims["sub"], str) or
                    not claims["sub"] or claims["sub"] != claims["sub"].strip() or
                    not isinstance(claims["sid"], str) or
                    not claims["sid"] or claims["sid"] != claims["sid"].strip() or
                    any(type(claims[k]) is not int for k in ("exp", "iat", "nbf"))):
                raise SessionRejected(_DENIED)
            raw_aud = claims["aud"]
            if isinstance(raw_aud, str):
                audiences = (raw_aud,)
            elif (isinstance(raw_aud, list) and raw_aud and
                    all(isinstance(x, str) and x for x in raw_aud)):
                audiences = tuple(raw_aud)
            else:
                raise SessionRejected(_DENIED)
            return VerifiedBearerIdentity(
                issuer=claims["iss"], subject=claims["sub"],
                audience=audiences, session_id=claims["sid"],
                issued_at=claims["iat"], not_before=claims["nbf"],
                expires_at=claims["exp"],
            )
        except PyJWKClientConnectionError:
            # Known trusted key server outage is retryable (503) but not an
            # invitation to fall back to unverified token claims.
            raise SessionDependencyUnavailable(_DENIED) from None
        except Exception:
            # Incorrect signature, wrong token profile or unknown key:
            # reject without exposing credentials or upstream diagnostics.
            raise SessionRejected(_DENIED) from None
