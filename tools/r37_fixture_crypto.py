"""Generate strictly ephemeral R37 fixture JWT keys + per-installation secrets.

Never commit/output private keys, passwords or tokens. Called from the
disposable GitHub Actions standalone API smoke runner only.
"""
from __future__ import annotations

import base64
import json
from pathlib import Path
import secrets
import sys
import time

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

ISSUER = "https://idp.example.invalid"
AUDIENCE = "ai-law-api"


def initialize(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    kid = "r37-" + secrets.token_hex(8)
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key(), as_dict=True)
    jwk.update(kid=kid, use="sig", alg="RS256")
    jwks = {"keys": [jwk]}
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    (directory / "private.pem").write_bytes(private_pem)
    (directory / "kid").write_text(kid)
    public_jwks = base64.b64encode(
        json.dumps(jwks, separators=(",", ":")).encode(),
    ).decode()
    (directory / "installation.env").write_text(
        "AI_LAW_DB_PASSWORD=" + secrets.token_hex(24) + "\n"
        "AI_LAW_APP_DB_PASSWORD=" + secrets.token_hex(24) + "\n"
        "AI_LAW_TEST_JWKS_B64=" + public_jwks + "\n",
    )


def mint(directory: Path, subject: str, session_id: str) -> None:
    key = serialization.load_pem_private_key(
        (directory / "private.pem").read_bytes(), password=None,
    )
    now = int(time.time())
    token = jwt.encode(
        {"iss": ISSUER, "aud": AUDIENCE, "sub": subject,
         "sid": session_id, "iat": now - 10,
         "nbf": now - 10, "exp": now + 600},
        key=key, algorithm="RS256",
        headers={"kid": (directory / "kid").read_text(), "typ": "at+jwt"},
    )
    sys.stdout.write(token)


def main():
    action = sys.argv[1]
    directory = Path(sys.argv[2])
    if action == "init" and len(sys.argv) == 3:
        initialize(directory)
    elif action == "mint" and len(sys.argv) == 5:
        mint(directory, sys.argv[3], sys.argv[4])
    else:
        raise SystemExit("Usage: init <dir> | mint <dir> <subject> <session>")


if __name__ == "__main__":
    main()
