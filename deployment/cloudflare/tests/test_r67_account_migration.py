"""R67 offline SQLite QA account-profile migration contract, synthetic identifiers only."""
import sqlite3
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
SQL=(ROOT/'deployment/cloudflare/migrations/r67_qa_account_profiles.sql').read_text(encoding='utf8')
INSTALL='a1a1a1a1-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
USER='40404040-0000-4000-8000-000000000004'


class AccountMigrationTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript("""
          CREATE TABLE qa_principals(
             installation_id TEXT NOT NULL,user_id TEXT NOT NULL,status TEXT NOT NULL,
             PRIMARY KEY(installation_id,user_id));
        """)
        self.db.execute("INSERT INTO qa_principals VALUES(?,?,'active')",(INSTALL,USER))
        self.db.executescript(SQL)

    def tearDown(self):
        self.db.close()

    def test_idempotent_schema_and_unique_identity(self):
        self.db.executescript(SQL)
        self.db.execute("INSERT INTO qa_account_profiles(installation_id,user_id,display_name) VALUES(?,?,?)",
                        (INSTALL,USER,'Synthetic QA'))
        row=self.db.execute("SELECT plan_code,display_name FROM qa_account_profiles").fetchone()
        self.assertEqual(row,('demo','Synthetic QA'))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO qa_account_profiles(installation_id,user_id) VALUES(?,?)",
                            (INSTALL,USER))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO qa_account_profiles(installation_id,user_id) VALUES(?,?)",
                            (INSTALL,'deadbeef-dead-4bad-8ead-deadbeefdead'))

    def test_plan_control_and_editable_fields_preserve_plan(self):
        self.db.execute("INSERT INTO qa_account_profiles(installation_id,user_id,plan_code) VALUES(?,?,'pro')",
                        (INSTALL,USER))
        self.db.execute("""
            INSERT INTO qa_account_profiles(installation_id,user_id,display_name,phone,job_title,bio,updated_at)
            VALUES(?,?,?,?,?,?,?) ON CONFLICT(installation_id,user_id) DO UPDATE SET
            display_name=excluded.display_name,phone=excluded.phone,
            job_title=excluded.job_title,bio=excluded.bio,updated_at=excluded.updated_at
          """,(INSTALL,USER,'User QA','0912345678','Lawyer','Synthetic only',1800000000))
        self.assertEqual(self.db.execute("SELECT plan_code FROM qa_account_profiles").fetchone()[0],'pro')
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE qa_account_profiles SET plan_code='owner_admin'")

    def test_bounded_fields_and_foreign_key_cascade(self):
        self.db.execute("INSERT INTO qa_account_profiles(installation_id,user_id) VALUES(?,?)",(INSTALL,USER))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE qa_account_profiles SET display_name=?",('x'*81,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE qa_account_profiles SET avatar_data=?",('a'*48001,))
        self.db.execute("DELETE FROM qa_principals WHERE installation_id=? AND user_id=?",(INSTALL,USER))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM qa_account_profiles").fetchone()[0],0)


if __name__=='__main__':
    unittest.main()
