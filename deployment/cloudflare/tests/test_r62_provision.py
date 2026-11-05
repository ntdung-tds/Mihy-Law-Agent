"""R62 offline-only verifier preparation contract; synthetic passwords, real SQLite."""
from pathlib import Path
import hashlib
import importlib.util
import json
import os
import sqlite3
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[3]
SCRIPT=ROOT/"deployment/cloudflare/tools/render_r62_qa_verifiers.py"
spec=importlib.util.spec_from_file_location("r62_renderer",SCRIPT)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class QAProvisionRendererTests(unittest.TestCase):
    def setUp(self):
        self.inventory=json.loads(m.INVENTORY.read_text(encoding="utf8"))
        self.bundle={"schema_version":1,"accounts":{
            row["id"]:{"email":row["email"],"password":"test_only_never_use_in_cloud_"+row["id"]*2}
            for row in self.inventory["accounts"]
        }}

    def test_render_only_primary_synthetic_verifiers_and_idempotence(self):
        sql=m.render(self.bundle,self.inventory,lambda n: bytes(range(n)))
        for row in self.inventory["accounts"]:
            self.assertNotIn(self.bundle["accounts"][row["id"]]["password"],sql)
        self.assertEqual(sql.count("INSERT INTO qa_login_verifiers"),8)
        self.assertNotIn("qa04.lawyer@ai-law.invalid",sql)
        self.assertNotIn("qa10.",sql)
        self.assertNotIn("$argon2id$",sql)
        db=sqlite3.connect(":memory:")
        db.execute("PRAGMA foreign_keys=ON")
        for migration in ("0001_cf_qa_metadata.sql","0002_cf_qa_mobile_login.sql"):
            db.executescript((ROOT/"deployment/cloudflare/migrations"/migration).read_text(encoding="utf8"))
        for row in self.inventory["accounts"]:
            if row["installation"]=="primary":
                db.execute("INSERT INTO qa_principals VALUES(?,?,?)",
                           (m.INSTALL,row["user_id"],row["status"]))
        db.executescript(sql)
        db.executescript(sql)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM qa_login_verifiers").fetchone()[0],8)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM qa_login_verifiers WHERE status='disabled'").fetchone()[0],1)
        email="qa02.dual@ai-law.invalid"
        salt,digest,iterations=db.execute(
            "SELECT password_salt,password_hash,pbkdf2_iterations FROM qa_login_verifiers WHERE email=?",
            (email,)).fetchone()
        password=self.bundle["accounts"]["QA-02"]["password"]
        self.assertEqual(hashlib.pbkdf2_hmac("sha256",password.encode(),bytes.fromhex(salt),iterations).hex(),digest)
        db.close()

    def test_missing_or_wrong_identity_fails_before_writing(self):
        bad=json.loads(json.dumps(self.bundle))
        del bad["accounts"]["QA-08"]
        with self.assertRaises(ValueError):
            m.render(bad,self.inventory)
        bad=json.loads(json.dumps(self.bundle))
        bad["accounts"]["QA-03"]["email"]="attacker@example.invalid"
        with self.assertRaises(ValueError):
            m.render(bad,self.inventory)
        bad=json.loads(json.dumps(self.bundle))
        bad["accounts"]["QA-01"]["password"]="weak"
        with self.assertRaises(ValueError):
            m.render(bad,self.inventory)

    def test_private_bundle_must_be_0600_and_outside_checkout(self):
        with tempfile.TemporaryDirectory() as tmp:
            private=Path(tmp)/"qa_private.json"
            private.write_text("{}",encoding="utf8")
            os.chmod(private,0o644)
            with self.assertRaises(ValueError):
                m.private_path(str(private),existing=True)
            os.chmod(private,0o600)
            self.assertEqual(m.private_path(str(private),existing=True),private)
            link=Path(tmp)/"link"
            link.symlink_to(private)
            with self.assertRaises(ValueError):
                m.private_path(str(link),existing=True)
            output=Path(tmp)/"new.sql"
            self.assertEqual(m.private_path(str(output),existing=False),output)
        with self.assertRaises(ValueError):
            m.private_path(str(m.INVENTORY),existing=True)


if __name__=="__main__":unittest.main()
