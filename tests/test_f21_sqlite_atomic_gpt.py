"""F21 R182: real SQLite transaction feasibility tests, synthetic data only.

Not the application D1 adapter, migration, or production authorization proof.
"""
import sqlite3
import unittest

SCHEMA = """
CREATE TABLE outputs(id TEXT PRIMARY KEY, tenant TEXT NOT NULL, matter TEXT NOT NULL,
 author TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL);
CREATE TABLE assignments(output_id TEXT NOT NULL, reviewer TEXT NOT NULL,
 active INTEGER NOT NULL, PRIMARY KEY(output_id, reviewer));
CREATE TABLE audit(id INTEGER PRIMARY KEY, output_id TEXT NOT NULL,
 actor TEXT NOT NULL, event TEXT NOT NULL);
"""


def approve(conn, *, output_id, tenant, matter, actor, expected_version, inject_audit_failure=False):
    """Single SQLite transaction; all predicates checked at write time."""
    try:
        conn.execute('BEGIN IMMEDIATE')
        changed = conn.execute("""UPDATE outputs SET status='approved', version=version+1
          WHERE id=? AND tenant=? AND matter=? AND version=? AND status='pending_review'
          AND author<>? AND EXISTS(SELECT 1 FROM assignments
            WHERE output_id=outputs.id AND reviewer=? AND active=1)""",
            (output_id, tenant, matter, expected_version, actor, actor)).rowcount
        if changed != 1:
            conn.rollback()
            return False
        if inject_audit_failure:
            raise sqlite3.IntegrityError('synthetic audit failure')
        conn.execute('INSERT INTO audit(output_id,actor,event) VALUES(?,?,?)',
                     (output_id, actor, 'approved'))
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        return False


class AtomicApprovalTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:', isolation_level=None)
        self.db.executescript(SCHEMA)
        self.db.execute("INSERT INTO outputs VALUES('o1','t1','m1','author','pending_review',0)")
        self.db.execute("INSERT INTO assignments VALUES('o1','reviewer',1)")

    def tearDown(self):
        self.db.close()

    def state(self):
        return self.db.execute("SELECT status,version FROM outputs WHERE id='o1'").fetchone(), self.db.execute('SELECT COUNT(*) FROM audit').fetchone()[0]

    def test_approval_commits_state_and_audit(self):
        self.assertTrue(approve(self.db,output_id='o1',tenant='t1',matter='m1',actor='reviewer',expected_version=0))
        self.assertEqual(self.state(), (('approved',1),1))

    def test_audit_failure_rolls_back_state(self):
        self.assertFalse(approve(self.db,output_id='o1',tenant='t1',matter='m1',actor='reviewer',expected_version=0,inject_audit_failure=True))
        self.assertEqual(self.state(), (('pending_review',0),0))

    def test_real_sqlite_audit_trigger_abort_rolls_back_cas(self):
        # Database-raised audit failure must undo the state transition.
        self.db.execute("""CREATE TRIGGER reject_approval_audit
            BEFORE INSERT ON audit
            WHEN NEW.event='approved'
            BEGIN SELECT RAISE(ABORT, 'synthetic audit rejected'); END""")
        self.assertFalse(approve(self.db, output_id='o1', tenant='t1', matter='m1',
                                 actor='reviewer', expected_version=0))
        self.assertEqual(self.state(), (('pending_review', 0), 0))

    def test_stale_version_rejected(self):
        self.assertFalse(approve(self.db,output_id='o1',tenant='t1',matter='m1',actor='reviewer',expected_version=1))
        self.assertEqual(self.state(), (('pending_review',0),0))

    def test_revoked_assignment_rejected_at_write(self):
        self.db.execute("UPDATE assignments SET active=0 WHERE output_id='o1'")
        self.assertFalse(approve(self.db,output_id='o1',tenant='t1',matter='m1',actor='reviewer',expected_version=0))
        self.assertEqual(self.state(), (('pending_review',0),0))

    def test_cross_tenant_and_matter_denied(self):
        for tenant,matter in [('t2','m1'),('t1','m2')]:
            self.assertFalse(approve(self.db,output_id='o1',tenant=tenant,matter=matter,actor='reviewer',expected_version=0))
        self.assertEqual(self.state(), (('pending_review',0),0))

    def test_author_cannot_self_approve(self):
        self.db.execute("INSERT INTO assignments VALUES('o1','author',1)")
        self.assertFalse(approve(self.db,output_id='o1',tenant='t1',matter='m1',actor='author',expected_version=0))
        self.assertEqual(self.state(), (('pending_review',0),0))

    def test_replay_rejected(self):
        args=dict(output_id='o1',tenant='t1',matter='m1',actor='reviewer',expected_version=0)
        self.assertTrue(approve(self.db,**args))
        self.assertFalse(approve(self.db,**args))
        self.assertEqual(self.state(), (('approved',1),1))


if __name__ == '__main__':
    unittest.main()
