#!/usr/bin/env python3
"""Generate a private R290 QA credential bundle for an EXISTING approved principal.
Never connects to D1 or grants access. No raw credentials in stdout or SQL.
"""
import argparse
import hashlib
import hmac
import json
import os
import re
import secrets
import stat
from pathlib import Path

HEX64 = re.compile(r"[0-9a-f]{64}")
INSTALL = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")
ACTOR = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}")
EMAIL = re.compile(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}")

def read_pepper(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "r", encoding="ascii") as f:
        info = os.fstat(f.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.getuid():
            raise ValueError("pepper must be a private owner-only regular file")
        value = f.read(66).strip()
    if not HEX64.fullmatch(value):
        raise ValueError("invalid pepper format")
    return value

def quote(value):
    return "'" + value.replace("'", "''") + "'"

def build(installation, actor, email, pepper):
    email = email.strip().lower()
    if not INSTALL.fullmatch(installation) or not ACTOR.fullmatch(actor) or len(email) > 254 or not EMAIL.fullmatch(email) or not HEX64.fullmatch(pepper):
        raise ValueError("invalid credential parameters")
    password, salt = secrets.token_hex(32), secrets.token_hex(16)
    verifier = hmac.new(pepper.encode("ascii"), ("mihy-platform-login-v1:"+salt+":"+password).encode("ascii"), hashlib.sha256).hexdigest()
    fields = ",".join(map(quote, (installation,actor,email,salt,verifier,"hmac-sha256-random-v1")))
    # Single INSERT; no UPSERT, no creation/activation of a platform principal.
    sql = ("INSERT INTO platform_admin_credentials(installation_id,actor_id,email,salt,password_hash,scheme) "
           "SELECT "+fields+" WHERE EXISTS(SELECT 1 FROM platform_admin_principals WHERE installation_id="+quote(installation)+" AND actor_id="+quote(actor)+" AND status='active');\n")
    return json.dumps({"email":email,"password":password},ensure_ascii=True)+"\n", sql

def write_private(path, content):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
    except BaseException:
        path.unlink(missing_ok=True)
        raise

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--installation", required=True)
    p.add_argument("--actor", required=True)
    p.add_argument("--email", required=True)
    p.add_argument("--pepper-file", type=Path, required=True)
    p.add_argument("--out-dir", type=Path, required=True)
    args = p.parse_args()
    info = args.out_dir.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.getuid():
        p.error("output directory must be private, owner-only and not a symlink")
    credential, sql = build(args.installation,args.actor,args.email,read_pepper(args.pepper_file))
    private = args.out_dir / "platform_credential_gpt_v1.json"
    verifier = args.out_dir / "platform_verifier_gpt_v1.sql"
    write_private(private,credential)
    try:
        write_private(verifier,sql)
    except BaseException:
        private.unlink(missing_ok=True)
        raise
    print("Private bundle generated; no database change. Never commit either output.")

if __name__ == "__main__":
    main()
