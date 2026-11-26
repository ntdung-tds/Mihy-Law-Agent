"""R195: reproduce F21 adapter/schema state incompatibility with synthetic QA data.

This is a BLOCKER contract, not a successful approval integration or release gate.
The source-only transition requests pending_review while the R187 QA schema
permits only draft/approved. Do not silently alias states or expose an endpoint.
"""
import pathlib
import re
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "migrations" / "r187_f21_approval_gpt.sql").read_text()
TRANSITION = (ROOT / "src" / "f21_approval_transition_gpt.mjs").read_text()

BASE = """
CREATE TABLE qa_matters(installation_id TEXT,tenant_id TEXT,matter_id TEXT,
 PRIMARY KEY(installation_id,tenant_id,matter_id));
CREATE TABLE qa_memberships(installation_id TEXT,tenant_id TEXT,user_id TEXT,
 PRIMARY KEY(installation_id,tenant_id,user_id));
INSERT INTO qa_matters VALUES('qa','tenant','matter');
INSERT INTO qa_memberships VALUES('qa','tenant','author');
INSERT INTO qa_memberships VALUES('qa','tenant','reviewer');
"""

class ApprovalStateContractBlocker(unittest.TestCase):
 def test_transition_requests_state_not_persistable_in_qa_schema(self):
  self.assertRegex(TRANSITION, r"expectedStatus:\s*'pending_review'")
  db = sqlite3.connect(":memory:")
  db.execute("PRAGMA foreign_keys=ON")
  db.executescript(BASE + SCHEMA)
  with self.assertRaises(sqlite3.IntegrityError):
   db.execute("""INSERT INTO qa_approval_outputs
    (installation_id,tenant_id,matter_id,output_id,author_id,state,created_at)
    VALUES('qa','tenant','matter','output','author','pending_review',1)""")
  self.assertEqual(db.execute(
   "SELECT count(*) FROM qa_approval_outputs").fetchone()[0], 0)

 def test_draft_is_not_a_substitute_for_review_ready_state(self):
  db = sqlite3.connect(":memory:")
  db.executescript(BASE + SCHEMA)
  db.execute("""INSERT INTO qa_approval_outputs
   (installation_id,tenant_id,matter_id,output_id,author_id,created_at)
   VALUES('qa','tenant','matter','output','author',1)""")
  self.assertEqual(db.execute(
   "SELECT state FROM qa_approval_outputs WHERE output_id='output'"
  ).fetchone()[0], "draft")
  # A future adapter MUST distinguish editable drafts from review-ready outputs
  # and enforce verified session, qualification, ACL, assignment and atomic audit.
  self.assertNotEqual("draft", "pending_review")

if __name__ == "__main__":
 unittest.main()
