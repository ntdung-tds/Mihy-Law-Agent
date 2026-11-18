"""R188 F21 negative regression: persisted author and output scope cannot be rewritten before approval.
Synthetic SQLite only; not live D1 or lawyer E2E.
"""
import pathlib
import sqlite3
import unittest

MIGRATION=(pathlib.Path(__file__).parents[1]/"migrations"/"r187_f21_approval_gpt.sql").read_text()
BASE="""
CREATE TABLE qa_matters(installation_id TEXT,tenant_id TEXT,matter_id TEXT,PRIMARY KEY(installation_id,tenant_id,matter_id));
CREATE TABLE qa_memberships(installation_id TEXT,tenant_id TEXT,user_id TEXT,PRIMARY KEY(installation_id,tenant_id,user_id));
INSERT INTO qa_matters VALUES('i','t','m');
INSERT INTO qa_memberships VALUES('i','t','author');
INSERT INTO qa_memberships VALUES('i','t','reviewer');
INSERT INTO qa_memberships VALUES('i','t','other');
"""
class F21IdentityIntegrity(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(":memory:")
  self.db.execute("PRAGMA foreign_keys=ON")
  self.db.executescript(BASE+MIGRATION)
  self.db.execute("INSERT INTO qa_approval_outputs(installation_id,tenant_id,matter_id,output_id,author_id,created_at) VALUES('i','t','m','o','author',1)")
 def test_author_cannot_be_rewritten_before_approval(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("UPDATE qa_approval_outputs SET author_id='other' WHERE output_id='o'")
  self.assertEqual(self.db.execute("SELECT author_id FROM qa_approval_outputs").fetchone()[0],"author")
 def test_output_identity_cannot_be_rewritten_before_approval(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("UPDATE qa_approval_outputs SET output_id='new' WHERE output_id='o'")
  self.assertEqual(self.db.execute("SELECT output_id FROM qa_approval_outputs").fetchone()[0],"o")
if __name__=="__main__": unittest.main()
