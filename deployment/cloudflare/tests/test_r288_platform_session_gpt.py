import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
class PlatformSessionTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript((ROOT/'migrations/r288_platform_session_gpt.sql').read_text())
        self.db.execute("INSERT INTO platform_admin_principals VALUES ('a','admin','active')")
        self.db.execute("INSERT INTO platform_admin_sessions VALUES ('a',?,'admin',100,NULL)", ('a'*64,))
        self.sql = "SELECT s.actor_id FROM platform_admin_sessions s JOIN platform_admin_principals p ON p.installation_id=s.installation_id AND p.actor_id=s.actor_id WHERE s.installation_id=? AND s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND p.status='active' LIMIT 1"
    def tearDown(self): self.db.close()
    def test_active(self):
        self.assertEqual(self.db.execute(self.sql, ('a','a'*64,99)).fetchone(), ('admin',))
    def test_expired_and_other_installation(self):
        self.assertIsNone(self.db.execute(self.sql, ('a','a'*64,100)).fetchone())
        self.assertIsNone(self.db.execute(self.sql, ('b','a'*64,99)).fetchone())
    def test_revoked(self):
        self.db.execute("UPDATE platform_admin_sessions SET revoked_at=90")
        self.assertIsNone(self.db.execute(self.sql, ('a','a'*64,99)).fetchone())
    def test_disabled(self):
        self.db.execute("UPDATE platform_admin_principals SET status='disabled'")
        self.assertIsNone(self.db.execute(self.sql, ('a','a'*64,99)).fetchone())
    def test_no_ungranted_actor(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO platform_admin_sessions VALUES ('a',?,'unknown',100,NULL)", ('b'*64,))
    def test_invalid_hash(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO platform_admin_sessions VALUES ('a',?,'admin',100,NULL)", ('G'*64,))
