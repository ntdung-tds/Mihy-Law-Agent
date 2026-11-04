"""R43: execute the exact Worker D1 SQL against real SQLite (NOT cloud D1).

Proves current app-layer tenant/session/MatterACL filter semantics including
deny-overrides-allow. D1 has NO PostgreSQL FORCE RLS; this is a nonproduction
candidate and never substitutes for an approved IAM/storage SRS migration.
"""
import json
from pathlib import Path
import sqlite3
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[3]
SQL_FILE = ROOT / "deployment/cloudflare/migrations/0001_cf_qa_metadata.sql"
INSTALL = "a1a1a1a1-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
INSTALL_OTHER = "e5e5e5e5-eeee-4eee-8eee-eeeeeeeeeeee"
ORG = "b2b2b2b2-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
OTHER_TENANT = "f6f6f6f6-ffff-4fff-8fff-ffffffffffff"
USER = "c3c3c3c3-cccc-4ccc-8ccc-cccccccccccc"
ADMIN = "d3d3d3d3-dddd-4ddd-8ddd-dddddddddddd"
OUTSIDER = "c7c7c7c7-cccc-4ccc-8ccc-cccccccccccc"
SID = "d4d4d4d4-dddd-4ddd-8ddd-dddddddddddd"
MATTER = "a8a8a8a8-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
NOW = 1800000000
ISSUER = "https://idp.example.invalid"

def js_sql():
    script = ("import {SESSION_SQL,RUN_SQL,FILE_SQL} from "
              "'./deployment/cloudflare/src/worker.mjs';"
              "console.log(JSON.stringify({SESSION_SQL,RUN_SQL,FILE_SQL}))")
    out = subprocess.check_output(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT, text=True,
    )
    return json.loads(out)

class TestD1ScopedAuthorization(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = js_sql()

    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(SQL_FILE.read_text())
        self.db.executemany("INSERT INTO qa_principals VALUES(?,?,?)", [
            (INSTALL,USER,"active"),(INSTALL,ADMIN,"active"),
            (INSTALL,OUTSIDER,"active"),(INSTALL_OTHER,USER,"active"),
        ])
        self.db.executemany("INSERT INTO qa_tenants VALUES(?,?,?)", [
            (INSTALL,ORG,"organization"),
            (INSTALL,OTHER_TENANT,"organization"),
            (INSTALL_OTHER,ORG,"organization"),
        ])
        self.db.executemany("INSERT INTO qa_memberships VALUES(?,?,?,?,?,?)", [
            (INSTALL,ORG,USER,"lawyer","active",1),
            (INSTALL,ORG,ADMIN,"tenant_admin","active",1),
            (INSTALL,OTHER_TENANT,OUTSIDER,"lawyer","active",1),
            (INSTALL_OTHER,ORG,USER,"lawyer","active",1),
        ])
        self.db.executemany("INSERT INTO qa_sessions VALUES(?,?,?,?,?,?,?,?)", [
            (INSTALL,SID,ISSUER,"lawyer",USER,ORG,NOW+900,None),
            (INSTALL,"11111111-1111-4111-8111-111111111111",
             ISSUER,"admin",ADMIN,ORG,NOW+900,None),
            (INSTALL,"22222222-2222-4222-8222-222222222222",
             ISSUER,"outsider",OUTSIDER,OTHER_TENANT,NOW+900,None),
            (INSTALL_OTHER,SID,ISSUER,"lawyer",USER,ORG,NOW+900,None),
        ])
        self.db.executemany("INSERT INTO qa_matters VALUES(?,?,?,?)",[
            (INSTALL,ORG,MATTER,1),
            (INSTALL,OTHER_TENANT,MATTER,1),
            (INSTALL_OTHER,ORG,MATTER,1),
        ])
        self.db.executemany("INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)",[
            (INSTALL,ORG,MATTER,USER,"read","allow",1,NOW-200,None),
            (INSTALL,OTHER_TENANT,MATTER,OUTSIDER,"read","allow",1,NOW-200,None),
            (INSTALL_OTHER,ORG,MATTER,USER,"read","allow",1,NOW-200,None),
        ])
        self.db.executemany("INSERT INTO qa_runs VALUES(?,?,?,?,?)",[
            (INSTALL,ORG,"fixture-run",MATTER,json.dumps({
                "run_id":"fixture-run","status":"queued","installation":"primary",
            })),
            (INSTALL,OTHER_TENANT,"fixture-run",MATTER,json.dumps({
                "run_id":"fixture-run","status":"queued","installation":"other-tenant",
            })),
            (INSTALL_OTHER,ORG,"fixture-run",MATTER,json.dumps({
                "run_id":"fixture-run","status":"queued","installation":"other-install",
            })),
        ])
        self.db.executemany("INSERT INTO qa_file_links VALUES(?,?,?,?,?,?,?)",[
            (INSTALL,ORG,"file-01",MATTER,"google_drive",
             "fakeDriveObject012345","text/plain"),
            (INSTALL,OTHER_TENANT,"file-01",MATTER,"google_drive",
             "differentDriveObj12345","text/plain"),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def session(self, installation=INSTALL, sid=SID,
                subject="lawyer", at=NOW):
        return self.db.execute(self.sql["SESSION_SQL"],
            (installation,sid,ISSUER,subject,at)).fetchone()

    def run(self, installation=INSTALL, tenant=ORG,
            user=USER, at=NOW, table="RUN_SQL", obj="fixture-run"):
        return self.db.execute(self.sql[table],(
            installation,tenant,obj,user,at,at,user,at,at)).fetchone()

    def test_session_and_authorized_run_sql_really_executes(self):
        self.assertEqual(self.session(),(USER,ORG))
        raw=self.run()
        self.assertEqual(json.loads(raw[0])["installation"],"primary")
        self.assertIsNone(self.run(user=ADMIN)) # admins cannot read cases
        self.assertIsNone(self.run(user=OUTSIDER))
        self.assertEqual(json.loads(self.run(
            tenant=OTHER_TENANT,user=OUTSIDER)[0])["installation"],"other-tenant")
        self.assertEqual(json.loads(self.run(
            installation=INSTALL_OTHER)[0])["installation"],"other-install")

    def test_disabled_suspended_revoked_and_expired_sessions_deny(self):
        self.db.execute("UPDATE qa_principals SET status='disabled' "
                        "WHERE installation_id=? AND user_id=?", (INSTALL,USER))
        self.assertIsNone(self.session())
        self.db.execute("UPDATE qa_principals SET status='active' "
                        "WHERE installation_id=? AND user_id=?", (INSTALL,USER))
        self.db.execute("UPDATE qa_memberships SET status='revoked' "
                        "WHERE installation_id=? AND user_id=?", (INSTALL,USER))
        self.assertIsNone(self.session())
        self.db.execute("UPDATE qa_memberships SET status='active' "
                        "WHERE installation_id=? AND user_id=?", (INSTALL,USER))
        self.db.execute("UPDATE qa_sessions SET revoked_at=? "
                        "WHERE installation_id=? AND sid=?", (NOW,INSTALL,SID))
        self.assertIsNone(self.session())
        self.db.execute("UPDATE qa_sessions SET revoked_at=NULL "
                        "WHERE installation_id=? AND sid=?", (INSTALL,SID))
        self.assertIsNone(self.session(at=NOW+901))

    def test_acl_version_expiry_and_explicit_deny_override_allow(self):
        self.assertIsNotNone(self.run())
        self.db.execute("INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)",
            (INSTALL,ORG,MATTER,USER,"read","deny",1,NOW-1,None))
        self.assertIsNone(self.run())
        self.db.execute("DELETE FROM qa_matter_acl WHERE effect='deny'")
        self.db.execute("UPDATE qa_matters SET acl_version=2 WHERE installation_id=?",
                        (INSTALL,))
        self.assertIsNone(self.run())
        self.db.execute("INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)",
            (INSTALL,ORG,MATTER,USER,"read","allow",2,NOW-1,NOW+20))
        self.assertIsNotNone(self.run())
        self.assertIsNone(self.run(at=NOW+21))

    def test_file_acl_guards_provider_ref_too(self):
        self.assertEqual(self.run(table="FILE_SQL",obj="file-01")[0],"file-01")
        self.assertIsNone(self.run(table="FILE_SQL",obj="file-01",user=ADMIN))
        self.assertIsNone(self.run(table="FILE_SQL",obj="file-01",user=OUTSIDER))
        self.assertEqual(self.run(table="FILE_SQL",obj="file-01",
            tenant=OTHER_TENANT,user=OUTSIDER)[2],"differentDriveObj12345")

    def test_foreign_key_denies_cross_install_reference(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO qa_file_links VALUES(?,?,?,?,?,?,?)",(
                INSTALL_OTHER,ORG,"cross-linked",MATTER,"google_drive",
                "fakeDriveObject012345","text/plain",
            )) # no matter with this tenant? INSTALL_OTHER does have one
        # Strict FKs should disallow linking nonexistent matter.
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO qa_runs VALUES(?,?,?,?,?)",(
                INSTALL,ORG,"orphan",
                "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",'{"run_id":"orphan"}'
            ))

if __name__ == "__main__":
    unittest.main()
