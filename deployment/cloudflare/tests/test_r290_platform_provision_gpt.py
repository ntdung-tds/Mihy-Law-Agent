import hashlib
import hmac
import importlib.util
import json
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("provision", ROOT / "tools/provision_platform_qa_gpt.py")
provision = importlib.util.module_from_spec(spec)
spec.loader.exec_module(provision)
INSTALL = "11111111-1111-4111-8111-111111111111"
PEPPER = "ab" * 32

class TestR290Provision(unittest.TestCase):
    def test_bundle_only_for_existing_active_principal(self):
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        for name in ("r288_platform_session_gpt.sql", "r290_platform_login_gpt.sql"):
            db.executescript((ROOT / "migrations" / name).read_text())
        private, sql = provision.build(INSTALL, "test-admin", "synthetic@example.invalid", PEPPER)
        credential = json.loads(private)
        self.assertRegex(credential["password"], r"^[0-9a-f]{64}$")
        self.assertNotIn(credential["password"], sql)
        self.assertNotIn(PEPPER, sql)
        self.assertEqual(db.execute(sql).rowcount, 0)
        db.execute("INSERT INTO platform_admin_principals VALUES (?,?,?)", (INSTALL,"test-admin","disabled"))
        self.assertEqual(db.execute(sql).rowcount, 0)
        db.execute("UPDATE platform_admin_principals SET status='active'")
        self.assertEqual(db.execute(sql).rowcount, 1)
        salt, verifier = db.execute("SELECT salt,password_hash FROM platform_admin_credentials").fetchone()
        expected = hmac.new(PEPPER.encode(), ("mihy-platform-login-v1:"+salt+":"+credential["password"]).encode(), hashlib.sha256).hexdigest()
        self.assertEqual(verifier, expected)
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute(sql)
    def test_reject_bad_actor_or_pepper(self):
        for actor, pepper in (("bad'actor", PEPPER), ("test", "short")):
            with self.assertRaises(ValueError):
                provision.build(INSTALL, actor, "synthetic@example.invalid", pepper)

if __name__ == "__main__":
    unittest.main()
