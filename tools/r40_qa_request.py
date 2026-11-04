"""R40 tiny QA HTTP test request builder. Private password never printed to logs.

The process writes its JSON payload only to stdout for an *immediate pipe*
into the private auth container; no token, password or signing key is stored.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

from tools.r40_qa_provision import _read_manifest, _validated_bundle


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--credentials", type=Path, required=True)
    parser.add_argument("--account", required=True)
    parser.add_argument("--tenant", required=True)
    parser.add_argument("--bad-password", action="store_true")
    args = parser.parse_args()
    manifest = _read_manifest()
    accounts = {a["id"]: a for a in manifest["accounts"]}
    if args.account not in accounts:
        raise SystemExit("Unknown QA identifier")
    creds, _ = _validated_bundle(args.credentials, manifest)
    c = creds[args.account]
    sys.stdout.write(json.dumps({
        "email": c["email"],
        "password": "r40-synthetic-not-valid-password" if args.bad_password
                    else c["password"],
        "tenant_id": args.tenant,
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
