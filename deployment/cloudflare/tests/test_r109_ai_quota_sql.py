"""R109 actual SQLite quota controls; source text/result is never stored."""
from pathlib import Path
import re
import sqlite3
import unittest

BASE=Path(__file__).resolve().parents[3]
I='11111111-1111-4111-8111-111111111111'
U='22222222-2222-4222-8222-222222222222'
T='33333333-3333-4333-8333-333333333333'
U2='44444444-4444-4444-8444-444444444444'
NOW=1800000000

class QuotaSQLTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for filename in (
            '0001_cf_qa_metadata.sql',
            '0002_cf_qa_mobile_login.sql',
            '0003_cf_qa_matter_catalog.sql',
            'r108_qa_matter_rename.sql',
            'r109_qa_legal_ai_quota.sql',
        ):
            self.db.executescript((BASE/'deployment/cloudflare/migrations'/filename).read_text('utf-8'))
        self.db.executemany('INSERT INTO qa_principals VALUES(?,?,?)',[(I,U,'active'),(I,U2,'active')])
        self.db.execute('INSERT INTO qa_tenants VALUES(?,?,?)',(I,T,'organization'))
        self.db.executemany('INSERT INTO qa_memberships(installation_id,tenant_id,user_id,role_key,status,authz_version) VALUES(?,?,?,?,?,1)',
          [(I,T,U,'lawyer','active'),(I,T,U2,'lawyer','active')])
        script=(BASE/'deployment/cloudflare/src/qa_legal_workflows.mjs').read_text('utf-8')
        m=re.search(r'export const LEGAL_QUOTA_SQL=\x60(.*?)\x60;',script,re.S)
        self.assertIsNotNone(m)
        self.sql=m.group(1)
    def tearDown(self):self.db.close()
    def test_exactly_12_ai_calls_and_independent_users(self):
        for n in range(1,13):
            self.assertEqual(self.db.execute(self.sql,(I,T,U,NOW//86400)).rowcount,1,n)
        self.assertEqual(self.db.execute(self.sql,(I,T,U,NOW//86400)).rowcount,0)
        self.assertEqual(self.db.execute(self.sql,(I,T,U2,NOW//86400)).rowcount,1)
        self.assertEqual(self.db.execute(self.sql,(I,T,U,(NOW//86400)+1)).rowcount,1)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM qa_legal_ai_quota').fetchone()[0],3)
    def test_membership_fk_and_no_source_columns(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(self.sql,(I,T,'99999999-9999-4999-8999-999999999999',NOW//86400))
        columns={x[1] for x in self.db.execute('PRAGMA table_info(qa_legal_ai_quota)')}
        self.assertTrue({'installation_id','tenant_id','user_id','utc_day','requests'} <= columns)
        self.assertEqual(len(columns),5,'No prompt, legal source, answer or provider token persisted')

if __name__=='__main__':
    unittest.main()
