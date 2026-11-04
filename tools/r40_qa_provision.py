"""R40 standalone QA-only provisioning: ten reusable fictitious accounts.

This tool generates a PRIVATE credential bundle *outside the repository* and
produces an atomic, idempotent PostgreSQL16 seed SQL script for a standalone
nonproduction installation with the existing R30/R37/R38 test-only schema.

No real provider, live customer account, production migration, SaaS operator,
IAM new roles or production secret storage is implemented. The SQL is applied
only by an installation's trusted provisioning operator (never by app roles).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
from uuid import UUID, uuid5

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "tests/acceptance/R40_STANDALONE_QA_INVENTORY.json"
NAMESPACE = UUID("40404040-4040-4040-8040-404040404040")
ISSUER = "https://idp.example.invalid"
HASHER = PasswordHasher(time_cost=2, memory_cost=19456,
                        parallelism=1, hash_len=32, salt_len=16)
EMAIL = re.compile(r"^qa[0-9]{2}\.[a-z0-9]+@ai-law\.invalid$")


def _outside_source(path: Path) -> Path:
    if path.expanduser().is_symlink():
        raise ValueError("Private QA file cannot be symlinked")
    target = path.expanduser().resolve()
    if target == ROOT or ROOT in target.parents:
        raise ValueError("Private QA credentials/SQL must be outside source repo")
    if target.is_symlink():
        raise ValueError("QA path cannot be a symlink")
    return target


def _private_file(path: Path) -> dict:
    path = _outside_source(path)
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode & (stat.S_IRWXG | stat.S_IRWXO):
        raise PermissionError("Private QA credential file must be owner-only (chmod 600)")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Invalid credential bundle")
    return data


def _read_manifest() -> dict:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert data["schema_version"] == 1
    assert data["track"] == "AI_LAW_R40_STANDALONE_QA_NONPROD"
    accounts = data["accounts"]
    ids = [a["id"] for a in accounts]
    if (len(accounts) != 10 or len(set(ids)) != 10 or
            set(ids) != {f"QA-{i:02d}" for i in range(1, 11)} or
            len({a["email"] for a in accounts}) != 10 or
            len({a["subject"] for a in accounts}) != 10 or
            len({a["user_id"] for a in accounts}) != 10):
        raise ValueError("QA role matrix must include ten distinct actors")
    for account in accounts:
        if not EMAIL.fullmatch(account["email"]):
            raise ValueError("QA email must be fictitious .invalid domain")
        UUID(account["user_id"])
        if account["installation"] not in ("primary", "secondary"):
            raise ValueError("Unexpected QA installation")
        if account["status"] not in ("active", "disabled"):
            raise ValueError("Unapproved QA status")
        if not account["memberships"]:
            raise ValueError("Account requires at least one explicit membership")
        for member in account["memberships"]:
            UUID(member["tenant_id"])
            if member["role_key"] not in ("lawyer", "tenant_admin") or (
                    member["status"] not in ("active", "revoked")):
                raise ValueError("Only approved existing test roles/statuses")
    return data


def _write_new_secret(path: Path, data: str) -> None:
    path = _outside_source(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation prevents accidentally rotating an existing QA bundle.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            output.write(data)
    except Exception:
        try:
            path.unlink()
        except OSError:
            pass
        raise


def initialize_credentials(path: Path) -> int:
    manifest = _read_manifest()
    accounts = {}
    for account in manifest["accounts"]:
        password = secrets.token_urlsafe(24)
        accounts[account["id"]] = {
            "email": account["email"],
            "password": password,
            "password_hash": HASHER.hash(password),
        }
    payload = {
        "schema_version": 1,
        "purpose": "R40_QA_STANDALONE_ONLY_NO_PRODUCTION",
        "warning": "Private test credentials. Not active unless provisioned into a persistent standalone QA PostgreSQL installation.",
        "accounts": accounts,
    }
    _write_new_secret(path, json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    return len(accounts)


def _validated_bundle(bundle_path: Path, manifest: dict) -> tuple[dict, str]:
    bundle = _private_file(bundle_path)
    if (bundle.get("schema_version") != 1 or
            bundle.get("purpose") != "R40_QA_STANDALONE_ONLY_NO_PRODUCTION"):
        raise ValueError("Invalid R40 credential bundle")
    creds = bundle.get("accounts")
    if not isinstance(creds, dict) or set(creds) != {
            account["id"] for account in manifest["accounts"]}:
        raise ValueError("Credential set differs from approved QA manifest")
    for account in manifest["accounts"]:
        c = creds[account["id"]]
        if (not isinstance(c, dict) or set(c) != {
                "email", "password", "password_hash"} or
                c["email"] != account["email"] or
                not isinstance(c["password"], str) or
                not 20 <= len(c["password"]) <= 128 or
                not isinstance(c["password_hash"], str) or
                not c["password_hash"].startswith("$argon2id$")):
            raise ValueError("Missing or incorrect private QA credential")
        try:
            if not HASHER.verify(c["password_hash"], c["password"]):
                raise ValueError("QA private password/hash mismatch")
        except (VerificationError, InvalidHashError):
            raise ValueError("QA private password/hash mismatch") from None
    # Fingerprint entire *unchanged* bundle. An accidental reinitialization
    # must not rotate credentials in an existing QA installation.
    digest = hashlib.sha256(json.dumps(bundle, sort_keys=True,
        ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    return creds, digest


def _q(value) -> str:
    if not isinstance(value, str) or "\x00" in value:
        raise ValueError("Invalid SQL literal")
    return "'" + value.replace("'", "''") + "'"


def _uid(value: str) -> str:
    return str(UUID(value))


def build_sql(installation: str, bundle_path: Path) -> str:
    manifest = _read_manifest()
    if installation not in ("primary", "secondary"):
        raise ValueError("QA installation must be primary or secondary")
    creds, fingerprint = _validated_bundle(bundle_path, manifest)
    manifest_sha = hashlib.sha256(MANIFEST.read_bytes()).hexdigest()
    accounts = [a for a in manifest["accounts"]
                if a["installation"] == installation]
    tenants = next(x["tenants"] for x in manifest["installations"]
                   if x["id"] == installation)
    matters = [m for m in manifest["synthetic_matters"]
               if m["installation"] == installation]
    accounts_by_id = {a["id"]: a for a in accounts}
    tenants_by_id = {t["id"]: t for t in tenants}
    if (len(accounts) != (9 if installation == "primary" else 1) or
            len(matters) != (7 if installation == "primary" else 1)):
        raise ValueError("Unexpected approved installation actor count")
    for a in accounts:
        for m in a["memberships"]:
            if m["tenant_id"] not in tenants_by_id:
                raise ValueError("Cross-installation tenant in account")
    for matter in matters:
        if (matter["tenant_id"] not in tenants_by_id or
                matter["owner_account"] not in accounts_by_id):
            raise ValueError("Cross-installation matter owner")
        for grant in matter["grants"]:
            if grant not in accounts_by_id:
                raise ValueError("Unknown QA MatterACL principal")

    lines = [
        "\\set ON_ERROR_STOP on",
        "BEGIN;",
        "SELECT pg_advisory_xact_lock(404040);",
        "CREATE TABLE IF NOT EXISTS ai_law_nonprod.qa_install_registration ("
        "installation_id text PRIMARY KEY, manifest_sha text NOT NULL, "
        "credentials_sha text NOT NULL, provisioned_at timestamptz "
        "NOT NULL DEFAULT now());",
        "INSERT INTO ai_law_nonprod.qa_install_registration "
        "(installation_id,manifest_sha,credentials_sha) VALUES "
        f"({_q(installation)},{_q(manifest_sha)},{_q(fingerprint)}) "
        "ON CONFLICT (installation_id) DO NOTHING;",
        "DO $r40_registration$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM ai_law_nonprod.qa_install_registration "
        f"WHERE installation_id={_q(installation)} "
        f"AND manifest_sha={_q(manifest_sha)} "
        f"AND credentials_sha={_q(fingerprint)}) "
        "THEN RAISE EXCEPTION 'R40 QA credentials/manifest changed; "
        "refusing implicit rotation'; END IF; END $r40_registration$;",
    ]

    def emit(table: str, columns: tuple[str, ...], values: tuple, *, unique=None):
        if len(columns) != len(values):
            raise ValueError("Bad QA seed row")
        cols = ",".join(columns)
        vals = ",".join(_q(str(v)) for v in values)
        lines.append(f"INSERT INTO {table} ({cols}) VALUES ({vals}) "
                     "ON CONFLICT DO NOTHING;")

    for role_key in manifest["roles_approved_existing"]:
        emit("ai_law.role_catalog",
             ("role_key","description","registry_version"),
             (role_key,"R40 synthetic existing approved role","1.1.15"))
    for tenant in tenants:
        emit("ai_law.tenants",("tenant_id","tenant_type"),
             (_uid(tenant["id"]),tenant["type"]))
    for account in accounts:
        principal_status = account["status"]
        emit("ai_law.principals",("user_id","identity_provider_id","status"),
             (_uid(account["user_id"]),account["subject"],principal_status))
    for account in accounts:
        for membership in account["memberships"]:
            mid = str(uuid5(NAMESPACE, f"{installation}:{account['id']}:{membership['tenant_id']}"))
            is_revoked = membership["status"] == "revoked"
            # Unlike status changes to a live account, fixture initial states
            # are explicit and never auto-reactivated on repeat provisioning.
            lines.append(
                "INSERT INTO ai_law.memberships "
                "(membership_id,tenant_id,user_id,status,authz_version,"
                "role_registry_version,joined_at,revoked_at) VALUES "
                f"({_q(mid)},{_q(membership['tenant_id'])},"
                f"{_q(account['user_id'])},{_q(membership['status'])},"
                "1,'1.1.15','2026-01-01T00:00:00Z',"
                f"{'now()' if is_revoked else 'NULL'}) ON CONFLICT DO NOTHING;"
            )
            emit("ai_law.membership_roles",
                 ("tenant_id","membership_id","role_key","registry_version"),
                 (membership["tenant_id"],mid,membership["role_key"],"1.1.15"))
    for matter in matters:
        owner = accounts_by_id[matter["owner_account"]]
        emit("ai_law.matters",
             ("tenant_id","matter_id","owner_user_id","acl_version"),
             (matter["tenant_id"],matter["id"],owner["user_id"],"1"))
        for grant in matter["grants"]:
            grantee = accounts_by_id[grant]
            # No user can get a matter grant without a matching membership.
            if not any(m["tenant_id"] == matter["tenant_id"] and
                       m["status"] == "active"
                       for m in grantee["memberships"]):
                raise ValueError("Matter grant without active membership")
            lines.append(
                "INSERT INTO ai_law.matter_user_acl "
                "(tenant_id,matter_id,user_id,permission,effect,"
                "acl_version,valid_from) VALUES "
                f"({_q(matter['tenant_id'])},{_q(matter['id'])},"
                f"{_q(grantee['user_id'])},'read','allow',1,"
                "'2026-01-01T00:00:00Z') ON CONFLICT DO NOTHING;"
            )
        payload = json.dumps({
            "run_id": matter["run_id"], "status": "queued",
            "input_snapshot_id": f"qa-synthetic-{matter['id']}",
            "policy_version": "R40_NONPROD_QA_ONLY",
        }, separators=(",", ":"))
        lines.append(
            "INSERT INTO ai_law_nonprod.run_snapshots "
            "(tenant_id,run_id,matter_id,payload) VALUES "
            f"({_q(matter['tenant_id'])},{_q(matter['run_id'])},"
            f"{_q(matter['id'])},{_q(payload)}::jsonb) ON CONFLICT DO NOTHING;"
        )
    for account in accounts:
        status = account["status"]
        emit("ai_law_nonprod.identities",
             ("issuer","subject","user_id","status"),
             (ISSUER,account["subject"],account["user_id"],status))
        secret = creds[account["id"]]
        emit("ai_law_nonprod.password_accounts",
             ("email","issuer","subject","user_id","password_hash","status"),
             (account["email"],ISSUER,account["subject"],
              account["user_id"],secret["password_hash"],status))
        # A conflicting preexisting password hash is a BLOCKER, not a silent
        # password rotation and not proof that the issued password can login.
        lines.append(
            "DO $r40_guard$ BEGIN "
            "IF NOT EXISTS (SELECT 1 FROM ai_law_nonprod.password_accounts "
            f"WHERE email={_q(account['email'])} "
            f"AND subject={_q(account['subject'])} "
            f"AND user_id={_q(account['user_id'])} "
            f"AND password_hash={_q(secret['password_hash'])}) "
            "THEN RAISE EXCEPTION 'QA account hash/identity mismatch'; "
            "END IF; END $r40_guard$;"
        )
    lines.extend(["COMMIT;", ""])
    return "\n".join(lines)


def save_sql(output: Path, sql_text: str) -> None:
    output = _outside_source(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        if output.read_text(encoding="utf-8") != sql_text:
            raise FileExistsError("Existing QA SQL differs, refusing overwrite")
        return
    _write_new_secret(output, sql_text)


def main() -> None:
    parser = argparse.ArgumentParser(description="R40 standalone PRIVATE QA provisioning")
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init", help="Generate 10 credentials once")
    init.add_argument("--credentials", type=Path, required=True)
    render = sub.add_parser("render", help="Render idempotent QA SQL to private file")
    render.add_argument("--credentials", type=Path, required=True)
    render.add_argument("--installation", choices=("primary","secondary"), required=True)
    render.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "init":
        count = initialize_credentials(args.credentials)
        print(f"PASS R40: created {count} private QA account credentials (not activated)")
        return
    if os.environ.get("AI_LAW_NONPROD_QA") != "explicitly-approved-qa-only":
        raise RuntimeError("QA SQL rendering needs explicit nonproduction mode")
    save_sql(args.output, build_sql(args.installation,args.credentials))
    print(f"PASS R40: rendered private idempotent SQL for {args.installation}; "
          "do not commit, print or deploy to production")


if __name__ == "__main__":
    main()
