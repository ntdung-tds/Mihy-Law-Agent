#!/usr/bin/env python3
"""R62 QA-only offline PBKDF2 verifier renderer; never connects to any service.

An authorized operator exports the existing Owner-private R40 account JSON
OUTSIDE this public checkout. This command writes only salted hashes into a
new private SQL file outside the checkout for explicit, audited Wrangler
D1 execution on the existing isolated QA database. It deliberately skips
QA-04 (different existing Cloudflare password) and QA-10 (other installation).
No account credentials, bearer tokens or customer records enter GitHub/CI.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import sys

ROOT = Path(__file__).resolve().parents[3]
INVENTORY = ROOT / "tests/acceptance/R40_STANDALONE_QA_INVENTORY.json"
EXPECTED = ("QA-01","QA-02","QA-03","QA-05","QA-06","QA-07","QA-08","QA-09")
INSTALL = "a1a1a1a1-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ITERATIONS = 100_000


def private_path(value: str, *, existing: bool) -> Path:
    target = Path(value).expanduser().absolute()
    if target.is_symlink() or target == ROOT or ROOT in target.parents:
        raise ValueError("Private credential files must be outside the public repository")
    if existing:
        if not target.is_file() or target.stat().st_mode & 0o077:
            raise ValueError("Private bundle must be a regular file with mode 0600")
    elif target.exists():
        raise ValueError("Refusing to overwrite an existing private SQL file")
    elif not target.parent.is_dir():
        raise ValueError("Output directory does not exist")
    return target


def escape_sql(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def render(bundle: dict, inventory: dict, salt_function=secrets.token_bytes) -> str:
    if bundle.get("schema_version") != 1 or not isinstance(bundle.get("accounts"),dict):
        raise ValueError("Unsupported private QA bundle")
    by_id = {actor["id"]: actor for actor in inventory.get("accounts", [])}
    if any(actor not in by_id for actor in EXPECTED):
        raise ValueError("Incomplete canonical QA inventory")
    if not all(actor in bundle["accounts"] for actor in EXPECTED):
        raise ValueError("Missing one or more approved QA credentials")
    rows=[]
    for actor_id in EXPECTED:
        actor=by_id[actor_id]
        private=bundle["accounts"][actor_id]
        if actor["installation"]!="primary" or private.get("email")!=actor["email"]:
            raise ValueError("Installation/account binding mismatch")
        password=private.get("password")
        if not isinstance(password,str) or len(password)<24 or len(password)>256:
            raise ValueError("Unsafe or missing QA password")
        if actor["status"] not in ("active","disabled"):
            raise ValueError("Unsupported principal status")
        salt=salt_function(16)
        if not isinstance(salt,bytes) or len(salt)!=16:
            raise ValueError("Invalid random salt")
        digest=hashlib.pbkdf2_hmac("sha256",password.encode("utf8"),salt,ITERATIONS).hex()
        values=(INSTALL,actor["email"],actor["user_id"],actor["subject"],
                salt.hex(),digest,str(ITERATIONS),
                "disabled" if actor["status"]=="disabled" else "active")
        literal=",".join(escape_sql(value) if i != 6 else value
                         for i,value in enumerate(values))
        # The conditional INSERT fails closed on any principal mismatch;
        # existing QA-04 and already-present actors are left unchanged.
        rows.append(
            "INSERT INTO qa_login_verifiers(installation_id,email,user_id,subject,"
            "password_salt,password_hash,pbkdf2_iterations,status,failures,locked_until) "
            "SELECT " + literal + ",0,NULL WHERE EXISTS("
            "SELECT 1 FROM qa_principals p WHERE p.installation_id="
            +escape_sql(INSTALL)+" AND p.user_id="+escape_sql(actor["user_id"])+
            " AND p.status="+escape_sql(actor["status"])+
            ") AND NOT EXISTS(SELECT 1 FROM qa_login_verifiers v WHERE "
            "v.installation_id="+escape_sql(INSTALL)+
            " AND (v.email="+escape_sql(actor["email"])+
            " OR v.user_id="+escape_sql(actor["user_id"])+"));"
        )
    return (
        "-- PRIVATE R62 QA ONLY: 8 salted PBKDF2 verifiers (7 active, 1 disabled).\n"
        "-- Run only against existing isolated ai-law-standalone-cf-qa D1.\n"
        "-- No plaintext passwords. NEVER commit this generated SQL.\n"
        "BEGIN TRANSACTION;\n" + "\n".join(rows) + "\nCOMMIT;\n"
    )


def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", required=True, help="Owner-private R40 JSON path outside checkout")
    parser.add_argument("--output", required=True, help="NEW private SQL path outside checkout")
    args=parser.parse_args()
    try:
        source=private_path(args.bundle,existing=True)
        destination=private_path(args.output,existing=False)
        bundle=json.loads(source.read_text(encoding="utf8"))
        inventory=json.loads(INVENTORY.read_text(encoding="utf8"))
        sql=render(bundle,inventory)
        flags=os.O_WRONLY|os.O_CREAT|os.O_EXCL
        if hasattr(os,"O_NOFOLLOW"):
            flags|=os.O_NOFOLLOW
        fd=os.open(destination,flags,0o600)
        with os.fdopen(fd,"w",encoding="utf8") as output:
            output.write(sql)
        print("R62 private SQL prepared (8 synthetic QA verifiers). No credentials printed.")
        return 0
    except (ValueError,OSError,KeyError,json.JSONDecodeError) as error:
        print("R62 provisioning preparation rejected: "+type(error).__name__,file=sys.stderr)
        return 1


if __name__=="__main__":
    raise SystemExit(main())
