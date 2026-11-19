"""R193 F21: approved outputs must not be deleted, even when FK checks are off.
Synthetic SQLite only; NOT live D1, authorization or release acceptance.
"""
import pathlib
import sqlite3
import unittest

SQL = (pathlib.Path(__file__).parents[1] / "migrations" / "r187_f21_approval_gpt.sql").read_text()
BASE = """
CREATE TABLE qa_matters(installation_id TEXT,tenant_id TEXT,matter_id TEXT,
 PRIMARY KEY(installation_id,tenant_id,matter_id));
CREATE TABLE qa_memberships(installation_id TEXT,tenant_id TEXT,user_id TEXT,
 PRIMARY KEY(installation_id,tenant_id,user_id));
INSERT INTO qa_matters VALUES('i','t','m');
INSERT INTO qa_memberships VALUES('i','t','author');
INSERT INTO qa_memberships VALUES('i','t','reviewer');
"""

class ApprovedDeletionGuard(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=OFF")
        self.db.executescript(BASE + SQL)
        self.db.execute("INSERT INTO qa_approval_outputs (installation_id,tenant_id,matter_id,output_id,author_id,created_at) VALUES('i','t','m','o','author',1)")
        self.db.execute("INSERT INTO qa_approval_assignments VALUES('i','t','m','o','reviewer',1)")
        self.db.execute("UPDATE qa_approval_outputs SET state='approved',version=2,approved_by='reviewer',approved_at=2 WHERE output_id='o'")
        self.assertEqual(self.db.execute("SELECT count(*) FROM qa_approval_events").fetchone()[0], 1)

    def test_approved_output_cannot_be_deleted_with_fk_off(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM qa_approval_outputs WHERE output_id='o'")
        self.assertEqual(self.db.execute("SELECT count(*) FROM qa_approval_outputs").fetchone()[0], 1)
        self.assertEqual(self.db.execute("SELECT count(*) FROM qa_approval_events").fetchone()[0], 1)

    def test_draft_cleanup_still_allowed(self):
        self.db.execute("INSERT INTO qa_approval_outputs (installation_id,tenant_id,matter_id,output_id,author_id,created_at) VALUES('i','t','m','draft','author',1)")
        self.db.execute("DELETE FROM qa_approval_outputs WHERE output_id='draft'")
        self.assertEqual(self.db.execute("SELECT count(*) FROM qa_approval_outputs WHERE output_id='draft'").fetchone()[0], 0)

if __name__ == "__main__":
    unittest.main()
