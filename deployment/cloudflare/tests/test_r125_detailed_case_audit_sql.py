"""R125: exercise real SQLite triggers and immutable detailed audit; no live data."""
from pathlib import Path
import sqlite3
import json
import unittest

ROOT=Path(__file__).resolve().parents[3]
MIGRATIONS=ROOT/'deployment/cloudflare/migrations'
I='11111111-1111-4111-8111-111111111111'
U='22222222-2222-4222-8222-222222222222'
T='33333333-3333-4333-8333-333333333333'
M='44444444-4444-4444-8444-444444444444'
F='55555555-5555-4555-8555-555555555555'
N=1800000000

class AuditV2SQLite(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.row_factory=sqlite3.Row
  self.db.execute('PRAGMA foreign_keys=ON')
  for name in ('0001_cf_qa_metadata.sql','0002_cf_qa_mobile_login.sql',
               '0003_cf_qa_matter_catalog.sql','r108_qa_matter_rename.sql',
               '0017_r116_case_details_r2.sql','0018_r119_matter_soft_hide.sql',
               '0019_r122_case_file_soft_hide.sql'):
   self.db.executescript((MIGRATIONS/name).read_text(encoding='utf-8'))
  self.db.execute('INSERT INTO qa_principals VALUES(?,?,?)',(I,U,'active'))
  self.db.execute('INSERT INTO qa_tenants VALUES(?,?,?)',(I,T,'organization'))
  self.db.execute('INSERT INTO qa_memberships(installation_id,tenant_id,user_id,role_key,status,authz_version) VALUES(?,?,?,?,?,1)',(I,T,U,'lawyer','active'))
  self.db.execute('INSERT INTO qa_matters VALUES(?,?,?,1)',(I,T,M))
  self.db.execute('INSERT INTO qa_matter_acl VALUES(?,?,?,?,?,?,?,?,?)',(I,T,M,U,'read','allow',1,N-10,None))
  self.db.execute('INSERT INTO qa_matter_catalog(installation_id,tenant_id,matter_id,title,created_by,created_at) VALUES(?,?,?,?,?,?)',(I,T,M,'Tệp QA - hồ sơ',U,N))
  self.db.execute('INSERT INTO qa_case_events VALUES(?,?,?,?,?,?,?,?)',(I,T,M,'old-event',U,'details_saved',None,N))
  self.db.executescript((MIGRATIONS/'0020_r125_detailed_case_audit.sql').read_text(encoding='utf-8'))
 def tearDown(self):self.db.close()
 def events(self,action):
  return self.db.execute('SELECT * FROM qa_case_audit_v2 WHERE action=? ORDER BY occurred_at,event_id',(action,)).fetchall()
 def test_legacy_backfill_not_misrepresented_as_field_diff(self):
  legacy=self.events('legacy_details_saved')
  self.assertEqual(len(legacy),1)
  self.assertEqual(json.loads(legacy[0]['changes_json']),{'legacy':1})
  self.assertEqual(len(self.events('case_created')),0)
 def test_atomic_field_changes_and_actor_without_physical_file_deletion(self):
  self.db.execute("""INSERT INTO qa_case_details(
   installation_id,tenant_id,matter_id,reference,category,status,priority,assignee_user_id,
   client_label,counterparty_label,summary,deadline,version,updated_by,updated_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)""",
   (I,T,M,'QA-01','Lao động','open','normal',U,'Bên mẫu','Bên liên quan','Bản cũ','',U,N+1))
  created=self.events('details_created')
  self.assertEqual(len(created),1)
  initial=json.loads(created[0]['changes_json'])
  self.assertEqual(initial['summary'],{'from':None,'to':'Bản cũ'})
  self.db.execute("""UPDATE qa_case_details SET status=?,summary=?,updated_by=?,updated_at=?,
   version=version+1 WHERE installation_id=? AND tenant_id=? AND matter_id=?""",
   ('in_progress','Bản mới',U,N+2,I,T,M))
  row=self.events('details_updated')[0]
  changed=json.loads(row['changes_json'])
  self.assertEqual(changed['summary'],{'from':'Bản cũ','to':'Bản mới'})
  self.assertEqual(changed['status'],{'from':'open','to':'in_progress'})
  self.assertIsNone(changed['priority'])
  self.assertEqual(row['actor_id'],U)
  self.db.execute('UPDATE qa_matter_catalog SET title=?,version=version+1,updated_by=?,updated_at=? WHERE installation_id=? AND tenant_id=? AND matter_id=?',('Tên mới',U,N+3,I,T,M))
  self.assertEqual(json.loads(self.events('title_changed')[0]['changes_json'])['title'],{'from':'Tệp QA - hồ sơ','to':'Tên mới'})
  self.db.execute("""INSERT INTO qa_case_files_r2(
   installation_id,tenant_id,matter_id,file_id,file_name,mime_type,
   byte_length,sha256,object_key,uploaded_by,uploaded_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
   (I,T,M,F,'qa_file.pdf','application/pdf',100,'a'*64,'private/qa_file',U,N+4))
  self.assertEqual(json.loads(self.events('file_uploaded')[0]['changes_json'])['name'],'qa_file.pdf')
  self.db.execute('INSERT INTO qa_case_file_hides VALUES(?,?,?,?,?,?)',(I,T,M,F,U,N+5))
  self.assertEqual(json.loads(self.events('file_hidden')[0]['changes_json'])['name'],'qa_file.pdf')
  self.assertEqual(self.db.execute('SELECT count(*) FROM qa_case_files_r2').fetchone()[0],1)
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("DELETE FROM qa_case_audit_v2 WHERE action='file_hidden'")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("UPDATE qa_case_audit_v2 SET actor_id=? WHERE action='details_updated'",(F,))
  self.assertEqual(len(self.events('file_hidden')),1)
 def test_reapplying_migration_never_duplicates_old_history(self):
  source=(MIGRATIONS/'0020_r125_detailed_case_audit.sql').read_text(encoding='utf-8')
  before=self.db.execute('SELECT COUNT(*) FROM qa_case_audit_v2').fetchone()[0]
  self.db.executescript(source)
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM qa_case_audit_v2').fetchone()[0],before)

if __name__=='__main__':unittest.main()
