"""Actual SQLite foreign-key/tenant checks for the additive R72 QA receipt migration."""
import sqlite3
import unittest
from pathlib import Path

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
I = "11111111-1111-4111-8111-111111111111"
U = "22222222-2222-4222-8222-222222222222"
T = "33333333-3333-4333-8333-333333333333"
T2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
M = "44444444-4444-4444-8444-444444444444"
F = "66666666-6666-4666-8666-666666666666"

class R72ReceiptMigration(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        for file in ("0001_cf_qa_metadata.sql", "0003_cf_qa_matter_catalog.sql",
                     "r72_qa_document_receipts.sql"):
            self.db.executescript((MIGRATIONS / file).read_text(encoding="utf-8"))
        self.db.execute("INSERT INTO qa_principals VALUES(?,?,'active')", (I,U))
        self.db.executemany("INSERT INTO qa_tenants VALUES(?,?,'organization')", [(I,T),(I,T2)])
        self.db.execute("INSERT INTO qa_memberships(installation_id,tenant_id,user_id,role_key,status) VALUES(?, ?, ?, 'lawyer','active')", (I,T,U))
        self.db.execute("INSERT INTO qa_matters VALUES(?,?,?,1)", (I,T,M))
        self.db.execute("INSERT INTO qa_file_links VALUES(?,?,?,?,'google_drive',?,'application/pdf')",
                        (I,T,F,M,"syntheticDriveObject_12345"))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def insert_receipt(self, tenant=T, fid=F, status="unverified", length=123):
        return self.db.execute(
            "INSERT INTO qa_document_receipts "
            "(installation_id,tenant_id,file_id,file_name,mime_type,byte_length,sha256,"
            "verification_status,uploaded_by,created_at) VALUES(?,?,?,'synthetic.pdf',"
            "'application/pdf',?,?,?, ?,1800000000)",
            (I,tenant,fid,length,"a"*64,status,U))

    def test_actual_sqlite_receipt_persists_only_for_matching_installation_and_tenant(self):
        self.insert_receipt()
        row = self.db.execute("SELECT verification_status,byte_length FROM qa_document_receipts WHERE installation_id=? AND tenant_id=?", (I,T)).fetchone()
        self.assertEqual(row, ("unverified", 123))
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert_receipt(tenant=T2)

    def test_rejects_forged_verified_status_oversize_and_unknown_document(self):
        for kwargs in ({"status":"trusted"}, {"length":1500001},
                       {"fid":"99999999-9999-4999-8999-999999999999"}):
            with self.subTest(kwargs=kwargs), self.assertRaises(sqlite3.IntegrityError):
                self.insert_receipt(**kwargs)
            self.db.rollback()
        self.insert_receipt()
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert_receipt()

if __name__ == "__main__":
    unittest.main()
