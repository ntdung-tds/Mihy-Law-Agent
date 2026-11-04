"""R31: deterministic, synthetic-only demo customer seed for disposable PG16.

No login accounts, real identity provider, password issuance, customer files,
run execution, or production data. The source JSON is public-safe test data.
The CLI intentionally refuses any DSN except localhost exact test DB and
requires an explicit opt-in. Do not treat these identities as authenticated.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import urlsplit

FIXTURE = Path(__file__).with_name("customers.json")
_ALLOWED_DB = "ai_law_r30_synthetic"


def require_disposable_demo_dsn(dsn: str) -> None:
    if not isinstance(dsn, str):
        raise ValueError("Only a disposable local PostgreSQL test DSN is supported")
    try:
        p = urlsplit(dsn)
        valid = (p.scheme in ("postgresql", "postgres") and
                 p.hostname in ("127.0.0.1", "localhost") and
                 p.port == 5432 and p.username == "postgres" and
                 p.path == "/" + _ALLOWED_DB and
                 not p.query and not p.fragment)
    except (ValueError, AttributeError):
        valid = False
    if not valid:
        raise ValueError("Only a disposable local PostgreSQL test DSN is supported")


def load_fixture(path: Path = FIXTURE) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if (not isinstance(data, dict) or data.get("synthetic_only") is not True or
            data.get("schema_version") != 1 or
            not all(isinstance(data.get(k), list) for k in
                    ("tenants", "users", "memberships", "matters", "documents", "scenarios"))):
        raise ValueError("Invalid synthetic fixture schema")
    return data


def seed_demo_records(conn, fixture: dict) -> None:
    """Seed a pre-provisioned empty ai_law schema with deterministic synthetic rows.

    Caller is responsible for controlled disposal and privilege. This function
    must never drop schemas or run migrations; unit/CI setup owns that lifecycle.
    """
    if fixture.get("synthetic_only") is not True:
        raise ValueError("Refusing non-synthetic data")
    with conn.transaction():
        if conn.execute("SELECT count(*) FROM ai_law.principals").fetchone()[0]:
            raise ValueError("Refusing to seed a non-empty database")
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO ai_law.principals (user_id,identity_provider_id,status) VALUES (%s,%s,%s)",
                [(u["id"], u["identity_provider_id"], u["status"])
                 for u in fixture["users"]],
            )
            cur.executemany(
                "INSERT INTO ai_law.tenants (tenant_id,tenant_type) VALUES (%s,%s)",
                [(t["id"], t["type"]) for t in fixture["tenants"]],
            )
            cur.executemany(
                "INSERT INTO ai_law.role_catalog (role_key,description,registry_version) VALUES (%s,%s,%s)",
                [("lawyer", "Synthetic demo lawyer", "1.1.15"),
                 ("tenant_admin", "Synthetic demo organization admin", "1.1.15")],
            )
            # Membership and role assignments are committed atomically to
            # satisfy the SRS deferred active-membership role constraint.
            cur.executemany(
                """INSERT INTO ai_law.memberships
                (membership_id,tenant_id,user_id,status,authz_version,
                 role_registry_version,joined_at)
                VALUES (%s,%s,%s,%s,1,'1.1.15',now()-interval '1 day')""",
                [(m["id"], m["tenant_id"], m["user_id"], m["status"])
                 for m in fixture["memberships"]],
            )
            cur.executemany(
                """INSERT INTO ai_law.membership_roles
                (tenant_id,membership_id,role_key,registry_version)
                VALUES (%s,%s,%s,'1.1.15')""",
                [(m["tenant_id"], m["id"], m["role"])
                 for m in fixture["memberships"]],
            )
            cur.executemany(
                """INSERT INTO ai_law.matters
                (tenant_id,matter_id,owner_user_id,acl_version)
                VALUES (%s,%s,%s,1)""",
                [(m["tenant_id"], m["id"], m["owner_user_id"])
                 for m in fixture["matters"]],
            )
            acl = [
                (m["tenant_id"], m["id"], uid)
                for m in fixture["matters"]
                for uid in m["read_user_ids"]
            ]
            cur.executemany(
                """INSERT INTO ai_law.matter_user_acl
                (tenant_id,matter_id,user_id,permission,effect,acl_version,valid_from)
                VALUES (%s,%s,%s,'read','allow',1,now()-interval '1 hour')""",
                acl,
            )
    # Note: sample document labels are in customers.json only.
    # There is deliberately NO real content/document DB table in R31.


def main() -> int:
    if os.environ.get("AI_LAW_ALLOW_DISPOSABLE_DEMO_SEED") != "R31_SYNTHETIC_ONLY":
        print("BLOCKED: explicit synthetic test DB seed opt-in required")
        return 4
    dsn = os.environ.get("AI_LAW_TEST_PG_DSN", "")
    try:
        require_disposable_demo_dsn(dsn)
    except ValueError:
        print("BLOCKED: not an approved disposable local test database")
        return 4
    import psycopg
    with psycopg.connect(dsn, autocommit=True) as conn:
        if conn.execute("SELECT current_database()").fetchone()[0] != _ALLOWED_DB:
            print("BLOCKED: database name mismatch")
            return 4
        seed_demo_records(conn, load_fixture())
    print("PASS: 2 synthetic tenants and 4 fake identities seeded (NO LOGIN)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
