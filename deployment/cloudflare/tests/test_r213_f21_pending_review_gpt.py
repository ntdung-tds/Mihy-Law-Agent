"""R213 synthetic migration checks: legacy data, state machine, atomic audit and rollback."""
import pathlib
import sqlite3
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]/"migrations"
LEGACY=(ROOT/"r187_f21_approval_gpt.sql").read_text()
R212=(ROOT/"r212_f21_audit_insert_guard_gpt.sql").read_text()
MIG=(ROOT/"r213_f21_pending_review_gpt.sql").read_text()
BASE="""CREATE TABLE qa_matters(installation_id TEXT,tenant_id TEXT,matter_id TEXT,
 PRIMARY KEY(installation_id,tenant_id,matter_id));
CREATE TABLE qa_memberships(installation_id TEXT,tenant_id TEXT,user_id TEXT,
 PRIMARY KEY(installation_id,tenant_id,user_id));
INSERT INTO qa_matters VALUES('i','t','m');
INSERT INTO qa_memberships VALUES('i','t','author');
INSERT INTO qa_memberships VALUES('i','t','reviewer');
"""

class PendingReviewMigration(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(":memory:",isolation_level=None)
  self.db.executescript(BASE+LEGACY+R212)
  self.db.execute("""INSERT INTO qa_approval_outputs
   (installation_id,tenant_id,matter_id,output_id,author_id,created_at)
   VALUES('i','t','m','o','author',1)""")
  self.db.execute("""INSERT INTO qa_approval_assignments
   VALUES('i','t','m','o','reviewer',1)""")
  self.db.executescript(MIG)
 def tearDown(self): self.db.close()
 def state(self):
  return self.db.execute("SELECT state,version FROM qa_approval_outputs WHERE output_id='o'").fetchone()
 def submit(self):
  self.db.execute("UPDATE qa_approval_outputs SET state='pending_review',version=2 WHERE output_id='o'")
 def approve(self):
  self.db.execute("""UPDATE qa_approval_outputs SET state='approved',version=3,
   approved_by='reviewer',approved_at=3 WHERE output_id='o'""")
 def test_preserves_legacy_rows_and_assignment(self):
  self.assertEqual(self.state(),('draft',1))
  self.assertEqual(self.db.execute("SELECT reviewer_id FROM qa_approval_assignments").fetchone()[0],'reviewer')
  self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(),[])
 def test_three_state_atomic_audit(self):
  self.submit()
  self.assertEqual(self.state(),('pending_review',2))
  self.assertEqual(self.db.execute("SELECT count(*) FROM qa_approval_events").fetchone()[0],0)
  self.approve()
  self.assertEqual(self.state(),('approved',3))
  self.assertEqual(self.db.execute("SELECT actor_id,version FROM qa_approval_events").fetchall(),[('reviewer',3)])
 def test_direct_approval_and_self_review_denied(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("""UPDATE qa_approval_outputs SET state='approved',version=2,
    approved_by='reviewer',approved_at=2 WHERE output_id='o'""")
  self.assertEqual(self.state(),('draft',1))
  self.submit()
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("""UPDATE qa_approval_outputs SET state='approved',version=3,
    approved_by='author',approved_at=3 WHERE output_id='o'""")
  self.assertEqual(self.state(),('pending_review',2))
 def test_assignment_revocation_rolls_back(self):
  self.submit()
  self.db.execute("UPDATE qa_approval_assignments SET active=0")
  with self.assertRaises(sqlite3.IntegrityError): self.approve()
  self.assertEqual(self.state(),('pending_review',2))
  self.assertEqual(self.db.execute("SELECT count(*) FROM qa_approval_events").fetchone()[0],0)
 def test_cannot_rewrite_version_or_delete_approved(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("UPDATE qa_approval_outputs SET version=4 WHERE output_id='o'")
  self.submit();self.approve()
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("DELETE FROM qa_approval_outputs WHERE output_id='o'")
 def test_cannot_forge_event(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO qa_approval_events VALUES('i','t','m','o',2,'reviewer','approved',2)")
 def test_no_direct_pending_insert(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("""INSERT INTO qa_approval_outputs
    (installation_id,tenant_id,matter_id,output_id,author_id,created_at,state)
    VALUES('i','t','m','other','author',1,'pending_review')""")

if __name__=="__main__": unittest.main()
