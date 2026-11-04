"""R41 QA-only persistent installation secret bootstrap / safety preflight.

Produces an owner-only installation.env once per standalone QA installation;
does not create users, change PostgreSQL or expose endpoints. Reuses the
unchanged R40 private credential bundle. This test-only local auth stack is
NOT an approved production IAM provider, hosted SaaS or permanent customer
service. No CLI output contains any credential, private key or hash.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import re
import secrets
import stat

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from tools.r40_qa_provision import (
    ROOT, _read_manifest, _validated_bundle,
)

PROFILES = {
    "primary": {"port": 18080, "cookie": "al_r39_primary"},
    "secondary": {"port": 18081, "cookie": "al_r39_secondary"},
}
ISSUER = "https://idp.example.invalid"


def _safe_directory(path: Path) -> Path:
    dest = path.expanduser().resolve()
    if dest == ROOT or ROOT in dest.parents:
        raise ValueError("QA installation secrets must remain OUTSIDE checkout")
    if path.is_symlink():
        raise ValueError("Refuse symlinked installation secret directory")
    return dest


def _owner_only(path: Path, *, directory: bool) -> None:
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode & 0o077:
        raise PermissionError("QA secret path must have no group/other permissions")
    if directory and not path.is_dir():
        raise ValueError("Expected QA directory")
    if not directory and not path.is_file():
        raise ValueError("Expected private QA file")


def _workspace_labels(profile: str) -> list[dict]:
    manifest = _read_manifest()
    installation = next(i for i in manifest["installations"]
                        if i["id"] == profile)
    return [{
        "id": t["id"],
        "type": t["type"],
        "label": t["label"],
    } for t in installation["tenants"]]


def _new_env(profile: str) -> str:
    cfg = PROFILES[profile]
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    kid = "r41-" + secrets.token_hex(12)
    public = jwt.algorithms.RSAAlgorithm.to_jwk(
        private.public_key(), as_dict=True,
    )
    public.update(kid=kid, alg="RS256", use="sig")
    pem = private.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    jwks = base64.b64encode(json.dumps(
        {"keys":[public]}, separators=(",", ":"),
    ).encode()).decode()
    workspaces = base64.b64encode(json.dumps(
        _workspace_labels(profile), ensure_ascii=False, separators=(",", ":"),
    ).encode()).decode()
    return "\n".join([
        "AI_LAW_DB_PASSWORD=" + secrets.token_hex(24),
        "AI_LAW_APP_DB_PASSWORD=" + secrets.token_hex(24),
        "AI_LAW_AUTH_DB_PASSWORD=" + secrets.token_hex(24),
        "AI_LAW_TEST_JWKS_B64=" + jwks,
        "AI_LAW_TEST_SIGNING_KEY_B64=" +
        base64.b64encode(pem).decode(),
        "AI_LAW_TEST_KEY_KID=" + kid,
        "AI_LAW_R39_HOST_PORT=" + str(cfg["port"]),
        "AI_LAW_R39_BROWSER_ORIGIN=http://127.0.0.1:" + str(cfg["port"]),
        "AI_LAW_R39_COOKIE_NAME=" + cfg["cookie"],
        "AI_LAW_R39_WORKSPACES_B64=" + workspaces,
    ]) + "\n"


def _read_env(path: Path) -> dict[str, str]:
    _owner_only(path, directory=False)
    result = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        name, sep, value = line.partition("=")
        if (not sep or not re.fullmatch(r"[A-Z][A-Z0-9_]*", name) or
                not value or name in result or "\r" in value):
            raise ValueError("Invalid private installation env")
        result[name] = value
    return result


def preflight(profile: str, directory: Path, credentials: Path) -> dict:
    if profile not in PROFILES:
        raise ValueError("Unknown standalone QA profile")
    directory = _safe_directory(directory)
    _owner_only(directory, directory=True)
    _validated_bundle(credentials, _read_manifest())
    settings = _read_env(directory / "installation.env")
    required = {
        "AI_LAW_DB_PASSWORD", "AI_LAW_APP_DB_PASSWORD",
        "AI_LAW_AUTH_DB_PASSWORD", "AI_LAW_TEST_JWKS_B64",
        "AI_LAW_TEST_SIGNING_KEY_B64", "AI_LAW_TEST_KEY_KID",
        "AI_LAW_R39_HOST_PORT", "AI_LAW_R39_BROWSER_ORIGIN",
        "AI_LAW_R39_COOKIE_NAME", "AI_LAW_R39_WORKSPACES_B64",
    }
    if set(settings) != required:
        raise ValueError("QA env keys differ from required whitelist")
    if (settings["AI_LAW_R39_HOST_PORT"] != str(PROFILES[profile]["port"])
            or settings["AI_LAW_R39_BROWSER_ORIGIN"] !=
            "http://127.0.0.1:" + str(PROFILES[profile]["port"])
            or settings["AI_LAW_R39_COOKIE_NAME"] !=
            PROFILES[profile]["cookie"]):
        raise ValueError("QA origin/cookie must be installation-local only")
    if any(not re.fullmatch(r"[0-9a-f]{48}", settings[name])
           for name in ("AI_LAW_DB_PASSWORD", "AI_LAW_APP_DB_PASSWORD",
                        "AI_LAW_AUTH_DB_PASSWORD")):
        raise ValueError("Invalid dedicated database auth secrets")
    if len({settings[name] for name in (
            "AI_LAW_DB_PASSWORD", "AI_LAW_APP_DB_PASSWORD",
            "AI_LAW_AUTH_DB_PASSWORD")}) != 3:
        raise ValueError("QA DB role secrets must be distinct")
    try:
        jwks = json.loads(base64.b64decode(
            settings["AI_LAW_TEST_JWKS_B64"], validate=True))
        private = serialization.load_pem_private_key(
            base64.b64decode(settings["AI_LAW_TEST_SIGNING_KEY_B64"],
                             validate=True),
            password=None,
        )
        labels = json.loads(base64.b64decode(
            settings["AI_LAW_R39_WORKSPACES_B64"], validate=True))
    except Exception:
        raise ValueError("Invalid QA cryptographic keys/workspace data") from None
    if (len(jwks.get("keys", [])) != 1 or
            jwks["keys"][0].get("kid") != settings["AI_LAW_TEST_KEY_KID"] or
            private.key_size < 2048 or
            jwt.algorithms.RSAAlgorithm.to_jwk(
                private.public_key(), as_dict=True,
            ).get("n") != jwks["keys"][0].get("n") or
            labels != _workspace_labels(profile)):
        raise ValueError("QA signing key/JWKS/tenant registry mismatch")
    return {"profile":profile, "port": PROFILES[profile]["port"],
            "qa_accounts":9 if profile=="primary" else 1,
            "workspaces":len(labels), "validated":True}


def initialize(profile: str, directory: Path, credentials: Path) -> dict:
    if profile not in PROFILES:
        raise ValueError("Unsupported QA installation profile")
    _validated_bundle(credentials, _read_manifest())
    directory = _safe_directory(directory)
    # Never silently rekey an existing PostgreSQL volume or override
    # installation secrets: the auth/JWKS keys must persist across restart.
    directory.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(directory.parent, 0o700)
    directory.mkdir(mode=0o700, exist_ok=False)
    env = directory / "installation.env"
    try:
        fd = os.open(env, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(_new_env(profile))
        return preflight(profile,directory,credentials)
    except Exception:
        if env.exists():
            env.unlink()
        directory.rmdir()
        raise


def main():
    parser = argparse.ArgumentParser(description="R41 local-only private QA staging env")
    parser.add_argument("action", choices=("init","check"))
    parser.add_argument("--profile", choices=("primary","secondary"), required=True)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--credentials", type=Path, required=True)
    args = parser.parse_args()
    if os.environ.get("AI_LAW_NONPROD_QA") != "explicitly-approved-qa-only":
        raise RuntimeError("R41 refuses any non-QA invocation")
    if args.action == "init":
        result = initialize(args.profile,args.directory,args.credentials)
    else:
        result = preflight(args.profile,args.directory,args.credentials)
    print("PASS R41 private staging preflight:", json.dumps(result,sort_keys=True))


if __name__ == "__main__":
    main()
