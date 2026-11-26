"""R189 regression: direct INSERT must not bypass F21 approval audit. Synthetic SQLite only."""
import pathlib
import sqlite3
import unittest

SQL = (pathlib.Path(__file__).parents[1] / "migrations" / "r187_f21_approval_gpt.sql").read_text()
BASE = """
CREATE TABLE qa_matters(installation_id TEXT, tenant_id TEXT, matter_id TEXT,
 PRIMARY KEY(installation_id,tenant_id,matter_id));
CREATE TABLE qa_memberships(installation_id TEXT, tenant_id TEXT, user_id TEXT,
 PRIMARY KEY(installation_id,tenant_id,user_id));
INSERT INTO qa_matters VALUES('i','t','m');
INSERT INTO qa_memberships VALUES('i','t','author');
INSERT INTO qa_memberships VALUES('i','t','reviewer');
"""

class F21NoPreapprovedInsert(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(BASE + SQL)

    def test_preapproved_insert_rejected_without_audit(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("""INSERT INTO qa_approval_outputs
                (installation_id,tenant_id,matter_id,output_id,author_id,
                 version,state,created_at,approved_at,approved_by)
                VALUES('i','t','m','o','author',2,'approved',1,2,'reviewer')""")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM qa_approval_outputs").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM qa_approval_events").fetchone()[0], 0)

    def test_draft_insert_still_allowed(self):
        self.db.execute("""INSERT INTO qa_approval_outputs
            (installation_id,tenant_id,matter_id,output_id,author_id,created_at)
            VALUES('i','t','m','o','author',1)""")
        self.assertEqual(self.db.execute("SELECT state FROM qa_approval_outputs").fetchone()[0], "draft")

if __name__ == "__main__":
    unittest.main()
