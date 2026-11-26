"""R216 isolated control-plane schema tests; synthetic SQLite, NOT deployed D1."""
import sqlite3
import unittest
from pathlib import Path

SQL = (Path(__file__).resolve().parents[1] / "migrations" / "r216_platform_admin_gpt.sql").read_text()

class PlatformAdminSchema(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(SQL)
        self.db.execute("INSERT INTO platform_service_plans(plan_id,plan_name,max_users,max_storage_bytes) VALUES('p','Solo',1,0)")
        self.db.execute("INSERT INTO platform_tenant_services(tenant_id,plan_id) VALUES('t','p')")
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_control_plane_has_no_business_content_columns(self):
        names = {r[0] for r in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertEqual(names, {'platform_service_plans','platform_tenant_services','platform_admin_audit'})
        columns = {r[1] for n in names for r in self.db.execute(f"PRAGMA table_info({n})")}
        self.assertFalse(columns & {'matter_id','document_id','file_content','client_name','owner_id','impersonation_token','access_token','refresh_token'})

    def test_reject_invalid_service_status_and_quota(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE platform_tenant_services SET service_status='impersonate' WHERE tenant_id='t'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE platform_service_plans SET max_users=-1 WHERE plan_id='p'")

    def test_restrict_plan_deletion_with_subscriber(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM platform_service_plans WHERE plan_id='p'")

    def test_audit_append_only(self):
        self.db.execute("INSERT INTO platform_admin_audit(audit_id,actor_id,tenant_id,action,reason_code) VALUES('a','sys','t','service_suspend','POLICY')")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "immutable platform audit"):
            self.db.execute("UPDATE platform_admin_audit SET reason_code='X' WHERE audit_id='a'")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "immutable platform audit"):
            self.db.execute("DELETE FROM platform_admin_audit WHERE audit_id='a'")

    def test_audit_action_allowlist(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO platform_admin_audit(audit_id,actor_id,tenant_id,action,reason_code) VALUES('x','sys','t','read_matter','X')")

if __name__ == "__main__":
    unittest.main()
