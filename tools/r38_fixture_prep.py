"""R38 isolated ephemeral passwords and account provisioning (CI ONLY).

Local fixture never uses real people's addresses. Temporary account secrets and
RSA signing key are held outside the repository and shredded with the temp
directory on CI completion. Do not print either to job logs.
"""
from __future__ import annotations

import base64
import json
from pathlib import Path
import secrets
import sys

from argon2 import PasswordHasher

_HASH = PasswordHasher(time_cost=2, memory_cost=19456,
                       parallelism=1, hash_len=32, salt_len=16)
ISSUER = "https://idp.example.invalid"
ACCOUNTS = [
    ("iaict-lawyer@example.invalid", "iaict-lawyer",
     "11111111-1111-4111-8111-111111111111"),
    ("iaict-admin@example.invalid", "iaict-admin",
     "22222222-2222-4222-8222-222222222222"),
    ("other-lawyer@example.invalid", "other-lawyer",
     "33333333-3333-4333-8333-333333333333"),
]


def prepare(directory: Path, profile: str) -> None:
    if profile not in ('iaict','other'):
        raise ValueError('Choose a valid isolated test profile')
    if not (directory / "installation.env").is_file():
        raise RuntimeError("Run existing R37 fixture init first")
    private = (directory / "private.pem").read_bytes()
    kid = (directory / "kid").read_text()
    # The signer is injected into *auth* container only. Public API gets
    # a distinct public JWKS environment field (already installed by R37).
    with (directory / "installation.env").open("a") as env:
        env.write(
            "AI_LAW_AUTH_DB_PASSWORD=" + secrets.token_hex(24) + "\n"
            "AI_LAW_TEST_SIGNING_KEY_B64=" + base64.b64encode(private).decode() + "\n"
            "AI_LAW_TEST_KEY_KID=" + kid + "\n"
        )
    # Only public synthetic workspace labels; in the product the workspace
    # list must come from authenticated memberships, never client assertions.
    workspaces = (
        [{"id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          "label": "IAICT · Tổ chức thử nghiệm", "type": "organization"},
         {"id": "ffffffff-ffff-4fff-8fff-ffffffffffff",
          "label": "Không gian cá nhân", "type": "personal"}]
        if profile == "iaict" else
        [{"id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          "label": "Tổ chức độc lập", "type": "organization"}]
    )
    port = "18080" if profile == "iaict" else "18081"
    with (directory / "installation.env").open("a") as env:
        env.write(
            "AI_LAW_R39_HOST_PORT=" + port + "\n"
            "AI_LAW_R39_BROWSER_ORIGIN=http://127.0.0.1:" + port + "\n"
            "AI_LAW_R39_COOKIE_NAME=al_r39_" + profile + "\n"
            "AI_LAW_R39_WORKSPACES_B64=" +
            base64.b64encode(
                json.dumps(workspaces, ensure_ascii=False,
                           separators=(",", ":")).encode()
            ).decode() + "\n"
        )
    records = {}
    sql = ["BEGIN;"]
    for email, subject, uid in ACCOUNTS:
        if (profile == "iaict" and not subject.startswith("iaict-")) or (
                profile == "other" and subject != "other-lawyer"):
            continue
        password = secrets.token_urlsafe(28)
        # No passwords go into SQL: only per-account Argon2id hashes.
        digest = _HASH.hash(password)
        records[subject] = {"email": email, "password": password}
        sql.append(
            "INSERT INTO ai_law_nonprod.password_accounts "
            "(email,issuer,subject,user_id,password_hash,status) VALUES "
            f"('{email}','{ISSUER}','{subject}','{uid}','{digest}','active');"
        )
    sql.append("COMMIT;")
    (directory / "fixture_password_accounts.sql").write_text("\n".join(sql) + "\n")
    (directory / "fixture_passwords.json").write_text(
        json.dumps(records, separators=(",", ":"))
    )


def request(directory: Path, subject: str, tenant_id: str, *, wrong=False) -> None:
    account = json.loads((directory / "fixture_passwords.json").read_text())[subject]
    print(json.dumps({
        "email": account["email"],
        "password": "invalid-password-test-only" if wrong else account["password"],
        "tenant_id": tenant_id,
    }, separators=(",", ":")))


def main() -> None:
    action, directory = sys.argv[1], Path(sys.argv[2])
    if action == "init" and len(sys.argv) == 4:
        prepare(directory, sys.argv[3])
    elif action in ("request", "bad-request") and len(sys.argv) == 5:
        request(directory, sys.argv[3], sys.argv[4], wrong=action == "bad-request")
    else:
        raise SystemExit(
            "Usage: init <temp> iaict|other | request|bad-request <temp> <subject> <tenant>"
        )


if __name__ == "__main__":
    main()
