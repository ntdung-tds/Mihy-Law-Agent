"""R212: F21 audit rows cannot be fabricated before approval (synthetic SQLite)."""
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1] / "migrations"
LEGACY = (ROOT / "r187_f21_approval_gpt.sql").read_text()
GUARD = (ROOT / "r212_f21_audit_insert_guard_gpt.sql").read_text()
BASE = """
CREATE TABLE qa_matters(installation_id TEXT,tenant_id TEXT,matter_id TEXT,
 PRIMARY KEY(installation_id,tenant_id,matter_id));
CREATE TABLE qa_memberships(installation_id TEXT,tenant_id TEXT,user_id TEXT,
 PRIMARY KEY(installation_id,tenant_id,user_id));
INSERT INTO qa_matters VALUES('i','t','m');
INSERT INTO qa_memberships VALUES('i','t','author');
INSERT INTO qa_memberships VALUES('i','t','reviewer');
"""

class AuditInsertGuard(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(":memory:")
  self.db.execute("PRAGMA foreign_keys=ON")
  self.db.executescript(BASE+LEGACY+GUARD)
  self.db.execute("""INSERT INTO qa_approval_outputs
   (installation_id,tenant_id,matter_id,output_id,author_id,created_at)
   VALUES('i','t','m','o','author',1)""")
  self.db.execute("""INSERT INTO qa_approval_assignments
   VALUES('i','t','m','o','reviewer',1)""")
 def tearDown(self): self.db.close()
 def test_forged_audit_before_approval_denied(self):
  with self.assertRaisesRegex(sqlite3.IntegrityError,"F21_AUDIT_NO_APPROVAL"):
   self.db.execute("""INSERT INTO qa_approval_events VALUES
    ('i','t','m','o',2,'reviewer','approved',2)""")
  self.assertEqual(self.db.execute("SELECT count(*) FROM qa_approval_events").fetchone()[0],0)
 def test_legitimate_legacy_atomic_approval_still_audited(self):
  self.db.execute("""UPDATE qa_approval_outputs SET state='approved',
   version=2,approved_by='reviewer',approved_at=2 WHERE output_id='o'""")
  self.assertEqual(self.db.execute("SELECT actor_id,version FROM qa_approval_events").fetchall(),[('reviewer',2)])
 def test_wrong_version_and_actor_rejected(self):
  self.db.execute("""UPDATE qa_approval_outputs SET state='approved',
   version=2,approved_by='reviewer',approved_at=2 WHERE output_id='o'""")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("""INSERT INTO qa_approval_events VALUES
    ('i','t','m','o',3,'author','approved',3)""")
 def test_unrelated_tenant_cannot_forge(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("""INSERT INTO qa_approval_events VALUES
    ('i','other','m','o',2,'reviewer','approved',2)""")

if __name__=="__main__": unittest.main()
