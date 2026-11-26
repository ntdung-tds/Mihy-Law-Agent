"""R187 F21 QA schema contract: synthetic SQLite only, not D1/browser acceptance."""
import pathlib
import sqlite3
import unittest

SQL = (pathlib.Path(__file__).parents[1] / 'migrations' / 'r187_f21_approval_gpt.sql').read_text()
BASE = """
CREATE TABLE qa_matters(installation_id TEXT,tenant_id TEXT,matter_id TEXT,
 PRIMARY KEY(installation_id,tenant_id,matter_id));
CREATE TABLE qa_memberships(installation_id TEXT,tenant_id TEXT,user_id TEXT,
 PRIMARY KEY(installation_id,tenant_id,user_id));
INSERT INTO qa_matters VALUES('i','t','m');
INSERT INTO qa_memberships VALUES('i','t','author');
INSERT INTO qa_memberships VALUES('i','t','reviewer');
"""

class F21SchemaTest(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.execute('PRAGMA foreign_keys=ON')
  self.db.executescript(BASE+SQL)
  self.db.execute("""INSERT INTO qa_approval_outputs
   (installation_id,tenant_id,matter_id,output_id,author_id,created_at)
   VALUES('i','t','m','o','author',1)""")
 def approve(self, who='reviewer', version=2):
  self.db.execute("UPDATE qa_approval_outputs SET state='approved',version=?,approved_by=?,approved_at=2 WHERE output_id='o'",(version,who))
 def test_unassigned_rejected_without_audit(self):
  with self.assertRaises(sqlite3.IntegrityError): self.approve()
  self.assertEqual(self.db.execute('SELECT count(*) FROM qa_approval_events').fetchone()[0],0)
 def test_self_approval_rejected(self):
  self.db.execute("INSERT INTO qa_approval_assignments VALUES('i','t','m','o','author',1)")
  with self.assertRaises(sqlite3.IntegrityError): self.approve('author')
 def test_cas_and_immutable_audit(self):
  self.db.execute("INSERT INTO qa_approval_assignments VALUES('i','t','m','o','reviewer',1)")
  with self.assertRaises(sqlite3.IntegrityError): self.approve(version=5)
  self.approve()
  self.assertEqual(self.db.execute('SELECT version FROM qa_approval_events').fetchone()[0],2)
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("UPDATE qa_approval_outputs SET approved_by='author' WHERE output_id='o'")
  with self.assertRaises(sqlite3.IntegrityError): self.db.execute('DELETE FROM qa_approval_events')
 def test_cross_tenant_assignment_rejected(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO qa_approval_assignments VALUES('i','other','m','o','reviewer',1)")

if __name__=='__main__': unittest.main()
