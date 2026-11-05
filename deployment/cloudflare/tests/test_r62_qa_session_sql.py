"""R62: Execute the *actual* QA cookie/session/workspace SQL against SQLite.
No credentials, network calls, production/IdP, or customer records.
"""
from pathlib import Path
import json
import re
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[3]
SRC = (ROOT / "deployment/cloudflare/src/mobile_auth.mjs").read_text(encoding="utf8")
MATTER_SRC = (ROOT / "deployment/cloudflare/src/matter_workspace.mjs").read_text(encoding="utf8")
INSTALL = "a1a1a1a1-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
OTHER_INSTALL = "b2b2b2b2-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
USER = "40404040-0000-4000-8000-000000000002"
OUTSIDER = "40404040-0000-4000-8000-000000000003"
ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
PERSONAL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
FOREIGN_TENANT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
SID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
ROTATED = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
ISSUER = "https://idp.example.invalid"
SUBJECT = "qa02-only-synthetic"
NOW = 1800000000


def js_joined_query(const):
    match = re.search(
        r"(?:export )?const " + re.escape(const) + r"=\[(.*?)\]\.join\(\" \"\);",
        SRC, re.S
    )
    if not match:
        raise AssertionError("Missing SQL constant " + const)
    return " ".join(json.loads('"' + s + '"') for s in
                    re.findall(r'^\s*"((?:\\.|[^"])*)"\s*,?\s*$', match.group(1), re.M))


def matter_list_query():
    match = re.search(r'export const MATTER_LIST_SQL=\x60(.*?)\x60;', MATTER_SRC, re.S)
    if not match:
        raise AssertionError("Missing matter SQL")
    return match.group(1)


class RealSQLiteSessionAuthTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        for migration in (
            "0001_cf_qa_metadata.sql",
            "0002_cf_qa_mobile_login.sql",
            "0003_cf_qa_matter_catalog.sql",
        ):
            self.db.executescript(
                (ROOT / "deployment/cloudflare/migrations" / migration)
                .read_text(encoding="utf8")
            )
        self.cookie_sql = js_joined_query("COOKIE_SESSION_SQL")
        self.workspaces_sql = js_joined_query("WORKSPACES_SQL")
        self.switch_sql = js_joined_query("SWITCH_SQL")
        self.db.executemany(
            "INSERT INTO qa_principals VALUES(?,?,?)",
            [(INSTALL, USER, "active"), (INSTALL, OUTSIDER, "active")]
        )
        self.db.executemany(
            "INSERT INTO qa_tenants VALUES(?,?,?)",
            [(INSTALL, ORG, "organization"), (INSTALL, PERSONAL, "personal"),
             (INSTALL, FOREIGN_TENANT, "organization")]
        )
        self.db.executemany(
            "INSERT INTO qa_memberships(installation_id,tenant_id,user_id,role_key,status) VALUES(?,?,?,?,?)",
            [(INSTALL, ORG, USER, "lawyer", "active"),
             (INSTALL, PERSONAL, USER, "lawyer", "active"),
             (INSTALL, FOREIGN_TENANT, OUTSIDER, "tenant_admin", "active")]
        )
        self.db.execute(
            "INSERT INTO qa_login_verifiers(installation_id,email,user_id,subject,"
            "password_salt,password_hash,pbkdf2_iterations,status) VALUES(?,?,?,?,?,?,?,?)",
            (INSTALL, "qa02.dual@ai-law.invalid", USER, SUBJECT,
             "a" * 32, "f" * 64, 100000, "active")
        )
        self.db.execute(
            "INSERT INTO qa_sessions VALUES(?,?,?,?,?,?,?,NULL)",
            (INSTALL, SID, ISSUER, SUBJECT, USER, ORG, NOW + 300)
        )

    def tearDown(self):
        self.db.close()

    def identity(self, sid=SID, issuer=ISSUER, now=NOW, install=INSTALL):
        return self.db.execute(self.cookie_sql, (install, sid, issuer, now)).fetchone()

    def test_active_dual_workspace_session_and_memberships(self):
        self.assertIsNotNone(self.identity())
        rows = self.db.execute(self.workspaces_sql, (INSTALL, USER)).fetchall()
        self.assertEqual({x[0] for x in rows}, {ORG, PERSONAL})
        self.assertEqual({x[1] for x in rows}, {"lawyer"})

    def test_expiry_revoke_wrong_issuer_and_other_installation_deny(self):
        self.assertIsNone(self.identity(now=NOW + 301))
        self.assertIsNone(self.identity(issuer="https://unauthorized.example.invalid"))
        self.assertIsNone(self.identity(install=OTHER_INSTALL))
        self.db.execute(
            "UPDATE qa_sessions SET revoked_at=? WHERE installation_id=? AND sid=?",
            (NOW + 1, INSTALL, SID)
        )
        self.assertIsNone(self.identity())

    def test_credential_subject_change_denies_old_session(self):
        self.assertIsNotNone(self.identity())
        self.db.execute(
            "UPDATE qa_login_verifiers SET subject=? WHERE installation_id=? AND user_id=?",
            ("changed-identity", INSTALL, USER)
        )
        self.assertIsNone(self.identity())

    def test_disabled_principal_or_verifier_and_revoked_membership_deny(self):
        for sql, args, restore, restore_args in [
            ("UPDATE qa_principals SET status='disabled' WHERE installation_id=? AND user_id=?",
             (INSTALL, USER),
             "UPDATE qa_principals SET status='active' WHERE installation_id=? AND user_id=?",
             (INSTALL, USER)),
            ("UPDATE qa_login_verifiers SET status='disabled' WHERE installation_id=? AND user_id=?",
             (INSTALL, USER),
             "UPDATE qa_login_verifiers SET status='active' WHERE installation_id=? AND user_id=?",
             (INSTALL, USER)),
            ("UPDATE qa_memberships SET status='revoked' WHERE installation_id=? AND tenant_id=? AND user_id=?",
             (INSTALL, ORG, USER),
             "UPDATE qa_memberships SET status='active' WHERE installation_id=? AND tenant_id=? AND user_id=?",
             (INSTALL, ORG, USER))
        ]:
            self.db.execute(sql, args)
            self.assertIsNone(self.identity(), sql)
            self.db.execute(restore, restore_args)
            self.assertIsNotNone(self.identity(), restore)

    def switch(self, target, old_sid=SID, rotated=ROTATED):
        self.db.execute(self.switch_sql, (
            rotated, target, INSTALL, old_sid, ISSUER, SUBJECT, USER, ORG,
            NOW, INSTALL, target, USER
        ))
        return self.db.execute("SELECT changes()").fetchone()[0]

    def test_switch_session_rotates_sid_and_changes_only_authorized_tenant(self):
        self.assertEqual(self.switch(PERSONAL), 1)
        self.assertIsNone(self.identity(), "Old cookie must be invalid")
        row = self.identity(sid=ROTATED)
        self.assertIsNotNone(row)
        self.assertEqual(row[1], PERSONAL)
        self.assertIsNone(self.db.execute(self.cookie_sql, (INSTALL, SID, ISSUER, NOW)).fetchone())

    def test_cannot_switch_to_other_organization_or_revoked_membership(self):
        self.assertEqual(self.switch(FOREIGN_TENANT), 0)
        self.assertIsNotNone(self.identity(), "Denied switch must not revoke active session")
        self.db.execute(
            "UPDATE qa_memberships SET status='revoked' WHERE installation_id=? AND tenant_id=? AND user_id=?",
            (INSTALL, PERSONAL, USER)
        )
        self.assertEqual(self.switch(PERSONAL), 0)
        self.assertIsNotNone(self.identity())

    def test_acl_requires_same_tenant_and_explicit_grant_not_admin_role(self):
        read_sql = matter_list_query()
        for tenant, id_, owner in ((ORG, "matter-own", USER),
                                   (FOREIGN_TENANT, "matter-other", OUTSIDER)):
            self.db.execute("INSERT INTO qa_matters VALUES(?,?,?,1)",
                            (INSTALL, tenant, id_))
            self.db.execute("INSERT INTO qa_matter_catalog VALUES(?,?,?,?,?,?)",
                            (INSTALL, tenant, id_, "Synthetic " + id_, owner, NOW))
            self.db.execute("INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)",
                            (INSTALL, tenant, id_, owner, "read", "allow", 1, NOW-10, None))
        def list_for(tenant, user):
            return self.db.execute(read_sql, (
                INSTALL, tenant, user, NOW, NOW, user, NOW, NOW
            )).fetchall()
        self.assertEqual([r[0] for r in list_for(ORG, USER)], ["matter-own"])
        self.assertEqual(list_for(FOREIGN_TENANT, USER), [])
        self.assertEqual(list_for(ORG, OUTSIDER), [])
        self.db.execute("INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)",
                        (INSTALL, ORG, "matter-own", USER, "read", "deny", 1, NOW-5, None))
        self.assertEqual(list_for(ORG, USER), [])

if __name__ == "__main__":
    unittest.main()
