"""R114: execute the real QA MatterACL query against synthetic SQLite rows.

This checks SQL behavior, not a mocked D1 first() return. No customer data.
"""
import pathlib
import re
import sqlite3
import unittest

SOURCE = pathlib.Path(__file__).resolve().parents[1] / "deployment/cloudflare/src/qa_legal_workflows.mjs"
SQL = re.search(r"export const LEGAL_MATTER_ACCESS_SQL=\x60([\s\S]*?)\x60;", SOURCE.read_text(encoding="utf-8"))
INSTALL = "11111111-1111-4111-8111-111111111111"
TENANT_A = "33333333-3333-4333-8333-333333333333"
TENANT_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
USER = "22222222-2222-4222-8222-222222222222"
MATTER = "44444444-4444-4444-8444-444444444444"
NOW = 1800000000


class SqlMatterAclRegression(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(SQL, "The real exported query must be present")
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.executescript("""
            CREATE TABLE qa_matters (
              installation_id TEXT, tenant_id TEXT, matter_id TEXT, acl_version INTEGER);
            CREATE TABLE qa_matter_acl (
              installation_id TEXT, tenant_id TEXT, matter_id TEXT, user_id TEXT,
              permission TEXT, effect TEXT, acl_version INTEGER,
              valid_from INTEGER, valid_to INTEGER);
        """)

    def matter(self, tenant=TENANT_A, version=2):
        self.db.execute("INSERT INTO qa_matters VALUES (?,?,?,?)",
                        (INSTALL, tenant, MATTER, version))

    def grant(self, tenant=TENANT_A, effect="allow", version=2,
              permission="read", valid_from=NOW-10, valid_to=None):
        self.db.execute("INSERT INTO qa_matter_acl VALUES (?,?,?,?,?,?,?,?,?)",
                        (INSTALL, tenant, MATTER, USER, permission, effect,
                         version, valid_from, valid_to))

    def accessible(self, tenant=TENANT_A):
        args = (INSTALL, tenant, MATTER, USER, NOW, NOW, USER, NOW, NOW)
        return self.db.execute(SQL.group(1), args).fetchone() is not None

    def test_matching_current_read_allow(self):
        self.matter()
        self.grant()
        self.assertTrue(self.accessible())

    def test_cross_tenant_acl_never_grants_access(self):
        self.matter(TENANT_A)
        self.grant(TENANT_B)
        self.assertFalse(self.accessible(TENANT_A))

    def test_cross_tenant_matter_never_resolves(self):
        self.matter(TENANT_B)
        self.grant(TENANT_B)
        self.assertFalse(self.accessible(TENANT_A))

    def test_explicit_deny_overrides_allow(self):
        self.matter()
        self.grant(effect="allow")
        self.grant(effect="deny")
        self.assertFalse(self.accessible())

    def test_old_acl_version_fails_closed(self):
        self.matter(version=3)
        self.grant(version=2)
        self.assertFalse(self.accessible())

    def test_expired_or_future_grant_fails_closed(self):
        self.matter()
        self.grant(valid_to=NOW)
        self.grant(valid_from=NOW+1)
        self.assertFalse(self.accessible())

    def test_write_permission_does_not_imply_read(self):
        self.matter()
        self.grant(permission="write")
        self.assertFalse(self.accessible())


    def test_other_user_grant_does_not_authorize_current_user(self):
        self.matter()
        self.db.execute(
            "INSERT INTO qa_matter_acl VALUES (?,?,?,?,?,?,?,?,?)",
            (INSTALL, TENANT_A, MATTER, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
             "read", "allow", 2, NOW-10, None))
        self.assertFalse(self.accessible())

    def test_other_installation_grant_does_not_authorize(self):
        self.matter()
        self.db.execute(
            "INSERT INTO qa_matter_acl VALUES (?,?,?,?,?,?,?,?,?)",
            ("cccccccc-cccc-4ccc-8ccc-cccccccccccc", TENANT_A, MATTER,
             USER, "read", "allow", 2, NOW-10, None))
        self.assertFalse(self.accessible())

    def test_expired_deny_does_not_revoke_current_allow(self):
        self.matter()
        self.grant(effect="allow")
        self.grant(effect="deny", valid_to=NOW)
        self.assertTrue(self.accessible())

    def test_old_acl_version_deny_does_not_revoke_current_allow(self):
        self.matter(version=3)
        self.grant(effect="allow", version=3)
        self.grant(effect="deny", version=2)
        self.assertTrue(self.accessible())

    def test_future_deny_does_not_revoke_current_allow(self):
        self.matter()
        self.grant(effect="allow")
        self.grant(effect="deny", valid_from=NOW+1)
        self.assertTrue(self.accessible())

    def test_other_user_deny_does_not_revoke_current_allow(self):
        self.matter()
        self.grant(effect="allow")
        self.db.execute(
            "INSERT INTO qa_matter_acl VALUES (?,?,?,?,?,?,?,?,?)",
            (INSTALL, TENANT_A, MATTER, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
             "read", "deny", 2, NOW-10, None))
        self.assertTrue(self.accessible())

    def test_other_installation_deny_does_not_revoke_current_allow(self):
        self.matter()
        self.grant(effect="allow")
        self.db.execute(
            "INSERT INTO qa_matter_acl VALUES (?,?,?,?,?,?,?,?,?)",
            ("cccccccc-cccc-4ccc-8ccc-cccccccccccc", TENANT_A, MATTER,
             USER, "read", "deny", 2, NOW-10, None))
        self.assertTrue(self.accessible())

    def test_foreign_tenant_deny_does_not_revoke_current_allow(self):
        self.matter()
        self.grant(effect="allow")
        self.grant(tenant=TENANT_B, effect="deny")
        self.assertTrue(self.accessible())

if __name__ == "__main__":
    unittest.main()
