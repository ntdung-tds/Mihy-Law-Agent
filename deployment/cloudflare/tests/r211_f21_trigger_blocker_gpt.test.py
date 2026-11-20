"""R211: isolate the two R187 triggers blocking review-ready -> approved.

Synthetic in-memory SQLite only. These tests deliberately reproduce the blocker,
not a successful approval flow or proof that the D1 migration is applied.
"""
import pathlib
import sqlite3
import unittest

SCHEMA = (pathlib.Path(__file__).resolve().parents[1] / "migrations" / "r187_f21_approval_gpt.sql").read_text()
BASE = """
CREATE TABLE qa_matters(installation_id TEXT, tenant_id TEXT, matter_id TEXT,
 PRIMARY KEY(installation_id,tenant_id,matter_id));
CREATE TABLE qa_memberships(installation_id TEXT, tenant_id TEXT, user_id TEXT,
 PRIMARY KEY(installation_id,tenant_id,user_id));
INSERT INTO qa_matters VALUES('qa','tenant','matter');
INSERT INTO qa_memberships VALUES('qa','tenant','author');
INSERT INTO qa_memberships VALUES('qa','tenant','reviewer');
"""

class ReviewReadyTriggerBlocker(unittest.TestCase):
 def setUp(self):
  self.db = sqlite3.connect(":memory:")
  self.db.executescript(BASE + SCHEMA)
  self.db.execute("""INSERT INTO qa_approval_outputs
   (installation_id,tenant_id,matter_id,output_id,author_id,created_at)
   VALUES('qa','tenant','matter','out','author',1)""")
  self.db.execute("""INSERT INTO qa_approval_assignments
   (installation_id,tenant_id,matter_id,output_id,reviewer_id)
   VALUES('qa','tenant','matter','out','reviewer')""")
  # Isolate trigger behavior from the already-known table CHECK incompatibility.
  # SQLite's test-only bypass must never be used in a migration or application.
  self.db.execute("PRAGMA ignore_check_constraints=ON")
  self.db.execute("""UPDATE qa_approval_outputs SET state='pending_review',
   version=2 WHERE output_id='out'""")
  self.db.execute("PRAGMA ignore_check_constraints=OFF")

 def tearDown(self):
  self.db.close()

 def test_guard_rejects_review_ready_approval_even_with_assignment(self):
  with self.assertRaisesRegex(sqlite3.IntegrityError, "F21_INVALID_APPROVAL"):
   self.db.execute("""UPDATE qa_approval_outputs SET state='approved',
    version=3, approved_at=100, approved_by='reviewer' WHERE output_id='out'""")
  self.assertEqual(self.db.execute(
   "SELECT state FROM qa_approval_outputs WHERE output_id='out'").fetchone()[0],
   "pending_review")
  self.assertEqual(self.db.execute("SELECT COUNT(*) FROM qa_approval_events").fetchone()[0], 0)

 def test_audit_trigger_is_limited_to_draft_origin(self):
  row = self.db.execute("""SELECT sql FROM sqlite_master
   WHERE type='trigger' AND name='trg_qa_f21_approval_audit'""").fetchone()
  self.assertIsNotNone(row)
  self.assertIn("OLD.state='draft'", row[0])
  self.assertNotIn("OLD.state='pending_review'", row[0])

if __name__ == "__main__":
 unittest.main()
