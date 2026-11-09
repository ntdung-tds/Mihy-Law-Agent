"""Actual SQLite execution of the R46 D1 matter ACL and audit migration."""
from pathlib import Path
import re, sqlite3, unittest
ROOT=Path(__file__).resolve().parents[3]
INSTALL='11111111-1111-4111-8111-111111111111'
USER='22222222-2222-4222-8222-222222222222'
OTHER='33333333-3333-4333-8333-333333333333'
TENANT='44444444-4444-4444-8444-444444444444'
TENANT_OTHER='55555555-5555-4555-8555-555555555555'
NOW=1800000000
class RealMatterSQL(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for n in ('0001_cf_qa_metadata.sql','0002_cf_qa_mobile_login.sql','0003_cf_qa_matter_catalog.sql','r108_qa_matter_rename.sql'):
            self.db.executescript((ROOT/'deployment/cloudflare/migrations'/n).read_text(encoding='utf-8'))
        js=(ROOT/'deployment/cloudflare/src/matter_workspace.mjs').read_text(encoding='utf-8')
        self.sql=re.search(r'export const MATTER_LIST_SQL=\`(.*?)\`;',js,re.S)
        if self.sql is None:raise ValueError('Matter SQL not found')
        self.write_acl=re.search(r'export const WRITE_ACL_SQL=\`(.*?)\`;',js,re.S).group(1)
        self.sql=self.sql.group(1).replace('${WRITE_ACL_SQL}',self.write_acl)
        self.edit_sql=re.search(r'export const MATTER_EDIT_SQL=\`(.*?)\`;',js,re.S).group(1).replace('${WRITE_ACL_SQL}',self.write_acl)
        self.rename_sql=re.search(r'export const MATTER_RENAME_SQL=\`(.*?)\`;',js,re.S).group(1).replace('${WRITE_ACL_SQL}',self.write_acl)
        self.db.executemany('INSERT INTO qa_principals VALUES(?,?,?)',[(INSTALL,USER,'active'),(INSTALL,OTHER,'active')])
        self.db.executemany('INSERT INTO qa_tenants VALUES(?,?,?)',[(INSTALL,TENANT,'organization'),(INSTALL,TENANT_OTHER,'organization')])
        self.db.executemany('INSERT INTO qa_memberships(installation_id,tenant_id,user_id,role_key,status,authz_version) VALUES(?,?,?,?,?,1)',[
            (INSTALL,TENANT,USER,'lawyer','active'),(INSTALL,TENANT_OTHER,OTHER,'lawyer','active')])
        for t,u,id in [(TENANT,USER,'my-matter'),(TENANT_OTHER,OTHER,'other-matter')]:
            self.db.execute('INSERT INTO qa_matters VALUES(?,?,?,1)',(INSTALL,t,id))
            self.db.execute('INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)',(INSTALL,t,id,u,'read','allow',1,NOW-10,None))
            self.db.execute('INSERT INTO qa_matter_catalog(installation_id,tenant_id,matter_id,title,created_by,created_at) VALUES(?,?,?,?,?,?)',(INSTALL,t,id,'Synthetic '+id,u,NOW))
    def tearDown(self):self.db.close()
    def listing(self,tenant=TENANT,user=USER,now=NOW):
        return self.db.execute(self.sql,(user,now,now,user,now,now,INSTALL,tenant,user,now,now,user,now,now)).fetchall()
    def test_tenant_and_user_read_isolation(self):
        self.assertEqual([x[0] for x in self.listing()],['my-matter'])
        self.assertEqual([x[0] for x in self.listing(TENANT_OTHER,OTHER)],['other-matter'])
        self.assertEqual(self.listing(TENANT,OTHER),[])
    def test_explicit_deny_and_acl_version_fail_closed(self):
        self.db.execute('INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)',(INSTALL,TENANT,'my-matter',USER,'read','deny',1,NOW-1,None))
        self.assertEqual(self.listing(),[])
        self.db.execute("DELETE FROM qa_matter_acl WHERE effect='deny'")
        self.db.execute("UPDATE qa_matters SET acl_version=2 WHERE matter_id='my-matter'")
        self.assertEqual(self.listing(),[])
    def test_acl_scoped_versioned_rename_and_atomic_history(self):
        # Existing read access does not imply the right to change a title.
        args=(INSTALL,TENANT,'my-matter',USER,NOW,NOW,USER,NOW,NOW)
        self.assertEqual(self.db.execute(self.edit_sql,args).fetchone(),None)
        self.db.execute('INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)',
                        (INSTALL,TENANT,'my-matter',USER,'write','allow',1,NOW-10,None))
        self.assertEqual(self.db.execute(self.edit_sql,args).fetchone(),('Synthetic my-matter',1))
        sql_args=('Synthetic renamed QA case',USER,NOW,INSTALL,TENANT,'my-matter',1,
                  USER,NOW,NOW,USER,NOW,NOW)
        self.assertEqual(self.db.execute(self.rename_sql,sql_args).rowcount,1)
        self.assertEqual(self.db.execute(self.sql,(USER,NOW,NOW,USER,NOW,NOW,
                                                   INSTALL,TENANT,USER,NOW,NOW,USER,NOW,NOW)).fetchone()[3:],
                         (2,1))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM qa_matter_title_events WHERE matter_id=? AND actor_id=?',
                                         ('my-matter',USER)).fetchone()[0],1)
        # Stale version does not update or duplicate the audit event.
        self.assertEqual(self.db.execute(self.rename_sql,sql_args).rowcount,0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM qa_matter_title_events').fetchone()[0],1)
        # Explicit deny overrides allowed write access at the current ACL version.
        self.db.execute('INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)',
                        (INSTALL,TENANT,'my-matter',USER,'write','deny',1,NOW-1,None))
        denied=('Synthetic denied change',USER,NOW,INSTALL,TENANT,'my-matter',2,
                USER,NOW,NOW,USER,NOW,NOW)
        self.assertEqual(self.db.execute(self.rename_sql,denied).rowcount,0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM qa_matter_title_events').fetchone()[0],1)
        # No actor from another tenant may update the current tenant's matter.
        cross=('Synthetic cross tenant',OTHER,NOW,INSTALL,TENANT,'my-matter',2,
               OTHER,NOW,NOW,OTHER,NOW,NOW)
        self.assertEqual(self.db.execute(self.rename_sql,cross).rowcount,0)
        self.assertEqual(self.db.execute('SELECT title FROM qa_matter_catalog WHERE tenant_id=?',
                                         (TENANT,)).fetchone()[0],'Synthetic renamed QA case')

    def test_batch_created_event_and_fk_protection(self):
        with self.db:
            id='qa-created-id'
            self.db.execute('INSERT INTO qa_matters VALUES(?,?,?,1)',(INSTALL,TENANT,id))
            for perm in ('read','write'):
                self.db.execute('INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)',(INSTALL,TENANT,id,USER,perm,'allow',1,NOW,None))
            self.db.execute('INSERT INTO qa_matter_catalog VALUES(?,?,?,?,?,?)',(INSTALL,TENANT,id,'Real DB synthetic test',USER,NOW))
            self.db.execute('INSERT INTO qa_matter_events VALUES(?,?,?,?,?,?,?)',(INSTALL,TENANT,'evt-01',id,USER,'created',NOW))
        self.assertIn(id,[r[0] for r in self.listing()])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM qa_matter_events WHERE matter_id=?", (id,)).fetchone()[0],1)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('INSERT INTO qa_matter_catalog VALUES(?,?,?,?,?,?)',(INSTALL,TENANT,'nonexistent','Bad',USER,NOW))
if __name__=='__main__':unittest.main()
