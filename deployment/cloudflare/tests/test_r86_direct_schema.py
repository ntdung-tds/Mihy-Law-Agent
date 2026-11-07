"""R86 SQLite migration contract for one-time browser→Drive session tickets.
Pure synthetic rows; no connected OAuth or customer data.
"""
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations/r86_qa_google_drive_direct_tickets.sql"
I="11111111-1111-4111-8111-111111111111"
T="33333333-3333-4333-8333-333333333333"
U="22222222-2222-4222-8222-222222222222"
M="44444444-4444-4444-8444-444444444444"
F="55555555-5555-4555-8555-555555555555"

class DirectDriveTicketSchema(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(":memory:")
  self.db.execute("PRAGMA foreign_keys=ON")
  self.db.executescript("""
   CREATE TABLE qa_memberships(
    installation_id TEXT,tenant_id TEXT,user_id TEXT,
    PRIMARY KEY(installation_id,tenant_id,user_id));
   CREATE TABLE qa_matters(
    installation_id TEXT,tenant_id TEXT,matter_id TEXT,
    PRIMARY KEY(installation_id,tenant_id,matter_id));
  """)
  self.db.execute("INSERT INTO qa_memberships VALUES(?,?,?)",(I,T,U))
  self.db.execute("INSERT INTO qa_matters VALUES(?,?,?)",(I,T,M))
  self.db.executescript(MIGRATION.read_text(encoding="utf-8"))
 def tearDown(self):
  self.db.close()
 def insert(self,**kw):
  a=dict(installation_id=I,tenant_id=T,ticket_id=F,user_id=U,matter_id=M,
   file_name="synthetic_gpt.pdf",mime_type="application/pdf",byte_length=52,
   sha256="a"*64,created_at=1800000000,expires_at=1800000600)
  a.update(kw)
  cols=",".join(a)
  values=",".join("?" for _ in a)
  self.db.execute(f"INSERT INTO qa_document_upload_tickets({cols}) VALUES({values})",tuple(a.values()))
 def test_ticket_and_single_use_columns(self):
  self.insert()
  with self.assertRaises(sqlite3.IntegrityError):
   self.insert()
  self.db.execute("UPDATE qa_document_upload_tickets SET consumed_at=?,provider_object_id=? WHERE ticket_id=?",(1800000005,"fakeDriveId123",F))
  self.assertEqual(self.db.execute("SELECT consumed_at FROM qa_document_upload_tickets").fetchone()[0],1800000005)
 def test_tenant_user_and_matter_foreign_keys(self):
  for kw in [dict(user_id="other"),dict(matter_id="other"),dict(tenant_id="other")]:
   with self.assertRaises(sqlite3.IntegrityError):
    self.insert(**kw)
 def test_size_mime_and_expiration_are_bounded(self):
  for kw in [
   dict(byte_length=1500001),dict(byte_length=21),
   dict(mime_type="text/html"),dict(expires_at=1800001000),
   dict(expires_at=1799999999),dict(sha256="bad")
  ]:
   with self.assertRaises(sqlite3.IntegrityError):
    self.insert(**kw)

if __name__ == "__main__":
 unittest.main()
