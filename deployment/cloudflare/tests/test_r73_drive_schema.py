"""R73: real SQLite verifies tenant/actor FK and encrypted-grant schema limits."""
import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1] / "migrations"
I="11111111-1111-4111-8111-111111111111"
T="22222222-2222-4222-8222-222222222222"
U="33333333-3333-4333-8333-333333333333"

class OAuthSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        for name in ("0001_cf_qa_metadata.sql","r73_qa_google_drive_oauth.sql"):
            self.db.executescript((ROOT/name).read_text(encoding="utf-8"))
        self.db.execute("INSERT INTO qa_principals VALUES (?,?,'active')",(I,U))
        self.db.execute("INSERT INTO qa_tenants VALUES (?,?,'organization')",(I,T))
        self.db.execute("INSERT INTO qa_memberships(installation_id,tenant_id,user_id,role_key,status) VALUES(?,?,?,'tenant_admin','active')",(I,T,U))

    def tearDown(self):self.db.close()

    def test_pending_state_scopes_tenant_and_uses_one_key(self):
        self.db.execute("INSERT INTO qa_drive_oauth_pending VALUES(?,?,?,?,?,?,?, ?,NULL)",
             (I,"a"*64,T,U,"cipher-sid","cipher-pkce",1800000000,1800000600))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO qa_drive_oauth_pending VALUES(?,?,?,?,?,?,?, ?,NULL)",
                 (I,"a"*64,T,U,"other-sid","other-pkce",1800000000,1800000600))
        self.db.rollback()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO qa_drive_oauth_pending VALUES(?,?,?,?,?,?,?, ?,NULL)",
                 (I,"b"*64,T,"99999999-9999-4999-8999-999999999999","encrypted","encrypted",1800000000,1800000600))

    def test_connection_requires_member_and_fixed_drive_file_scope(self):
        vals=(I,T,"encrypted-refresh-not-a-token","qaPrivateDriveFolder_01",
              "https://www.googleapis.com/auth/drive.file",U,1800000000)
        self.db.execute("INSERT INTO qa_drive_connections VALUES(?,?,?,?,?,?,?)",vals)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM qa_drive_connections").fetchone()[0],1)
        for row in (
          (I,T,"cipher","qaPrivateDriveFolder_01","https://www.googleapis.com/auth/drive",U,1800000000),
          (I,"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","cipher","qaPrivateDriveFolder_01",vals[4],U,1800000000)
        ):
            with self.subTest(row=row),self.assertRaises(sqlite3.IntegrityError):
                self.db.execute("INSERT INTO qa_drive_connections VALUES(?,?,?,?,?,?,?)",row)
            self.db.rollback()

if __name__=="__main__":unittest.main()
