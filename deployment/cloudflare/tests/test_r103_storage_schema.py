"""R103 explicit storage folder destination and per-employee grant schema.
Synthetic SQLite only, no customer credentials or legal documents.
"""
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations/r103_qa_storage_destinations.sql"
I="11111111-1111-4111-8111-111111111111"
T="22222222-2222-4222-8222-222222222222"
T2="99999999-9999-4999-8999-999999999999"
U="33333333-3333-4333-8333-333333333333"
V="44444444-4444-4444-8444-444444444444"
D="55555555-5555-4555-8555-555555555555"

class StorageDestinationsSchema(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(":memory:")
  self.db.execute("PRAGMA foreign_keys=ON")
  self.db.executescript("""
   CREATE TABLE qa_memberships(installation_id TEXT NOT NULL,tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,
    PRIMARY KEY(installation_id,tenant_id,user_id));
   CREATE TABLE qa_document_upload_tickets(ticket_id TEXT PRIMARY KEY);
   CREATE TABLE qa_file_links(file_id TEXT PRIMARY KEY);
  """)
  self.db.executemany("INSERT INTO qa_memberships VALUES(?,?,?)",[(I,T,U),(I,T,V),(I,T2,U)])
  self.db.executescript(MIGRATION.read_text(encoding="utf-8"))
 def tearDown(self):
  self.db.close()
 def add_destination(self,dest=D,tenant=T,folder="folder_id_012345",owner=U):
  self.db.execute("""INSERT INTO qa_storage_destinations
   (installation_id,tenant_id,destination_id,provider,folder_id,label,owner_kind,status,created_by,created_at)
   VALUES(?,?,?,?,?,?,?,?,?,?)""",
   (I,tenant,dest,"google_drive",folder,"Hồ sơ A","organization","active",owner,1800000000))
 def test_explicit_destination_and_assignment_do_not_implicitly_assign_all_members(self):
  self.add_destination()
  self.db.execute("""INSERT INTO qa_storage_assignments
   VALUES(?,?,?,?,?,?)""",(I,T,D,U,U,1800000000))
  self.assertEqual(self.db.execute("SELECT user_id FROM qa_storage_assignments").fetchall(),[(U,)])
  self.assertIsNone(self.db.execute(
   "SELECT 1 FROM qa_storage_assignments WHERE installation_id=? AND tenant_id=? AND destination_id=? AND user_id=?",
   (I,T,D,V)).fetchone())
 def test_cross_tenant_grant_and_destination_are_rejected(self):
  self.add_destination()
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO qa_storage_assignments VALUES(?,?,?,?,?,?)",
                   (I,T2,D,U,U,1800000000))
  with self.assertRaises(sqlite3.IntegrityError):
   self.add_destination(dest="other",tenant=T2,owner=V)
 def test_disallow_duplicate_folders_and_unsupported_provider(self):
  self.add_destination()
  with self.assertRaises(sqlite3.IntegrityError):
   self.add_destination(dest="another",folder="folder_id_012345")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("""INSERT INTO qa_storage_destinations VALUES(?,?,?,?,?,?,?,?,?,?)""",
    (I,T,"microsoft","onedrive","other_folder_id","OneDrive","organization","active",U,1800000000))
 def test_existing_tickets_and_links_remain_nullable_for_upgrade(self):
  self.db.execute("INSERT INTO qa_document_upload_tickets(ticket_id) VALUES('old')")
  self.db.execute("INSERT INTO qa_file_links(file_id) VALUES('old')")
  self.assertEqual(self.db.execute("SELECT destination_id FROM qa_document_upload_tickets").fetchone()[0],None)
  self.assertEqual(self.db.execute("SELECT storage_destination_id FROM qa_file_links").fetchone()[0],None)
  self.db.execute("UPDATE qa_file_links SET storage_destination_id=? WHERE file_id='old'",(D,))
  self.assertEqual(self.db.execute("SELECT storage_destination_id FROM qa_file_links").fetchone()[0],D)

if __name__ == "__main__":
 unittest.main()
