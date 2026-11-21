"""R215 F21 synthetic negative atomicity tests; NOT live D1/Worker E2E."""
import sqlite3
import unittest
from test_r213_f21_pending_review_gpt import BASE, LEGACY, R212, MIG


class ApprovalAuditRollback(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:", isolation_level=None)
        self.db.executescript(BASE + LEGACY + R212)
        self.db.execute("""INSERT INTO qa_approval_outputs
            (installation_id,tenant_id,matter_id,output_id,author_id,created_at)
            VALUES('i','t','m','o','author',1)""")
        self.db.execute("""INSERT INTO qa_approval_assignments
            VALUES('i','t','m','o','reviewer',1)""")
        self.db.executescript(MIG)
        self.db.execute("""UPDATE qa_approval_outputs
            SET state='pending_review',version=2 WHERE output_id='o'""")

    def tearDown(self):
        self.db.close()

    def snapshot(self):
        return (
            self.db.execute("""SELECT state,version,approved_by,approved_at
                FROM qa_approval_outputs WHERE output_id='o'""").fetchone(),
            self.db.execute("""SELECT version,actor_id,action,occurred_at
                FROM qa_approval_events WHERE output_id='o'""").fetchall(),
        )

    def approve(self):
        self.db.execute("""UPDATE qa_approval_outputs SET state='approved',
            version=3,approved_by='reviewer',approved_at=3 WHERE output_id='o'""")

    def test_audit_insert_failure_rolls_back_approval_update(self):
        before = self.snapshot()
        self.db.execute("""CREATE TRIGGER r215_simulated_audit_failure
            BEFORE INSERT ON qa_approval_events
            BEGIN SELECT RAISE(ABORT,'R215_SIMULATED_AUDIT_FAILURE'); END""")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "R215_SIMULATED_AUDIT_FAILURE"):
            self.approve()
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_explicit_transaction_rollback_restores_state_and_audit(self):
        before = self.snapshot()
        self.db.execute("BEGIN IMMEDIATE")
        try:
            self.approve()
            self.assertEqual(self.snapshot()[0][0], 'approved')
            self.assertEqual(len(self.snapshot()[1]), 1)
        finally:
            self.db.execute("ROLLBACK")
        self.assertEqual(self.snapshot(), before)

    def test_successful_approval_writes_exactly_one_audit_event(self):
        self.approve()
        state, events = self.snapshot()
        self.assertEqual(state, ('approved', 3, 'reviewer', 3))
        self.assertEqual(events, [(3, 'reviewer', 'approved', 3)])


if __name__ == "__main__":
    unittest.main()
