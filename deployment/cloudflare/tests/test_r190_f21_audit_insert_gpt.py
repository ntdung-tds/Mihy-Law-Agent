"""R190: reject forged F21 audit INSERTs; synthetic SQLite only, not D1 QA."""
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

class AuditInsertGuard(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(BASE + SQL)
        self.db.execute("""INSERT INTO qa_approval_outputs
            (installation_id,tenant_id,matter_id,output_id,author_id,created_at)
            VALUES('i','t','m','o','author',1)""")

    def event(self, version=2, actor="reviewer", when=2):
        self.db.execute("""INSERT INTO qa_approval_events
          (installation_id,tenant_id,matter_id,output_id,version,actor_id,action,occurred_at)
          VALUES('i','t','m','o',?,?,'approved',?)""", (version,actor,when))

    def test_forged_event_on_draft_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.event()
        self.assertEqual(self.db.execute("SELECT count(*) FROM qa_approval_events").fetchone()[0], 0)

    def test_forged_event_version_and_actor_rejected_after_real_approval(self):
        self.db.execute("INSERT INTO qa_approval_assignments VALUES('i','t','m','o','reviewer',1)")
        self.db.execute("""UPDATE qa_approval_outputs SET state='approved',
             version=2,approved_by='reviewer',approved_at=2 WHERE output_id='o'""")
        self.assertEqual(self.db.execute("SELECT count(*) FROM qa_approval_events").fetchone()[0], 1)
        with self.assertRaises(sqlite3.IntegrityError):
            self.event(version=3)
        with self.assertRaises(sqlite3.IntegrityError):
            self.event(version=4, actor="author")
        self.assertEqual(self.db.execute("SELECT count(*) FROM qa_approval_events").fetchone()[0], 1)

if __name__ == "__main__":
    unittest.main()
