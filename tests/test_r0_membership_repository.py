"""R0 FR12-01/TC12A: synthetic relational membership read tests (not PostgreSQL RLS E2E)."""
import sqlite3
import tempfile
import unittest
from pathlib import Path

from r0_core.tenant_context import AuthenticatedPrincipal, TenantContextDenied, TenantView
from r0_core.membership_repository import PostgresMembershipRepository, select_tenant_from_store

U = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
M_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
M_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
VERSION = "1.1.15"


class SQLiteCompatCursor:
    """Only test harness: translate PostgreSQL UUID cast placeholders to SQLite bind markers."""
    def __init__(self, cursor):
        self.raw = cursor

    def execute(self, query, params):
        assert query.count("CAST(%s AS UUID)") == 2
        assert "JOIN principals" in query and "JOIN role_catalog" in query
        assert "m.tenant_id" in query and "m.user_id" in query
        return self.raw.execute(query.replace("CAST(%s AS UUID)", "?").replace("%s", "?"), params)

    def fetchall(self):
        return self.raw.fetchall()

    def close(self):
        self.raw.close()


class SQLiteCompatConnection:
    def __init__(self, path):
        self.raw = sqlite3.connect(path)

    def cursor(self):
        return SQLiteCompatCursor(self.raw.cursor())

    def close(self):
        self.raw.close()


class MembershipRepositoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="al-r0-synthetic-")
        self.addCleanup(self.tmp.cleanup)
        self.path = str(Path(self.tmp.name) / "synthetic.sqlite")
        with sqlite3.connect(self.path) as db:
            db.executescript("""
                CREATE TABLE principals(user_id TEXT PRIMARY KEY,status TEXT);
                CREATE TABLE tenants(tenant_id TEXT PRIMARY KEY,tenant_type TEXT);
                CREATE TABLE memberships(membership_id TEXT PRIMARY KEY,
                    tenant_id TEXT,user_id TEXT,status TEXT,
                    authz_version INTEGER,role_registry_version TEXT,
                    joined_at TEXT,revoked_at TEXT);
                CREATE TABLE role_catalog(role_key TEXT,registry_version TEXT,
                    PRIMARY KEY(role_key,registry_version));
                CREATE TABLE membership_roles(tenant_id TEXT,membership_id TEXT,
                    role_key TEXT,registry_version TEXT);
            """)
            db.executemany("INSERT INTO principals VALUES (?,?)", [(U, "active"), (OTHER, "active")])
            db.executemany("INSERT INTO tenants VALUES (?,?)", [(A, "personal"), (B, "organization")])
            db.executemany("INSERT INTO memberships VALUES (?,?,?,?,?,?,?,?)", [
                (M_A, A, U, "active", 1, VERSION, "2025-01-01T00:00:00+00:00", None),
                (M_B, B, U, "active", 2, VERSION, "2025-01-01T00:00:00+00:00", None),
            ])
            db.executemany("INSERT INTO role_catalog VALUES (?,?)", [
                ("lawyer", VERSION), ("reviewer", VERSION),
            ])
            db.executemany("INSERT INTO membership_roles VALUES (?,?,?,?)", [
                (A, M_A, "lawyer", VERSION),
                (B, M_B, "lawyer", VERSION),
                (B, M_B, "reviewer", VERSION),
            ])

    def update(self, sql, args=()):
        with sqlite3.connect(self.path) as db:
            db.execute(sql, args)

    def connect(self):
        return SQLiteCompatConnection(self.path)

    def repo(self):
        return PostgresMembershipRepository(
            open_connection=self.connect, approved_registry_version=VERSION,
        )

    def select(self, tenant, current=None, principal=None):
        return select_tenant_from_store(
            principal=principal if principal is not None else AuthenticatedPrincipal(U, "active"),
            target_tenant_id=tenant, current=current, repository=self.repo(),
        )

    def test_active_relational_memberships_select_both_tenants(self):
        a = self.select(A)
        self.assertEqual((a.user_id, a.tenant_id, a.tenant_type, a.authz_version),
                         (U, A, "personal", 1))
        b = self.select(B, current=a)
        self.assertEqual((b.user_id, b.tenant_id, b.tenant_type, b.authz_version),
                         (U, B, "organization", 2))
        roles = self.repo()(U, B)
        self.assertEqual(roles.roles, ("lawyer", "reviewer"))
        self.assertEqual(roles.role_registry_version, VERSION)

    def test_cross_tenant_and_wrong_principal_are_denied(self):
        with self.assertRaises(TenantContextDenied):
            self.select(B, principal=AuthenticatedPrincipal(OTHER, "active"))
        with self.assertRaises(TenantContextDenied):
            self.select("cccccccc-cccc-4ccc-8ccc-cccccccccccc")

    def test_revoked_membership_denies_even_existing_context(self):
        a = self.select(A)
        self.update("UPDATE memberships SET status='revoked', authz_version=2 WHERE tenant_id=?", (A,))
        with self.assertRaises(TenantContextDenied):
            self.select(A, current=a)

    def test_disabled_principal_denies_stale_authenticated_session(self):
        self.update("UPDATE principals SET status='disabled' WHERE user_id=?", (U,))
        with self.assertRaises(TenantContextDenied):
            self.select(A, principal=AuthenticatedPrincipal(U, "active"))

    def test_version_bump_invalidates_selected_documents_and_chat(self):
        old = TenantView(U, A, "personal", 1, selected_document_ids=("A-doc",),
                         chat_turns=("A-secret",), search_query="A-client")
        self.update("UPDATE memberships SET authz_version=3 WHERE tenant_id=?", (A,))
        refreshed = self.select(A, current=old)
        self.assertEqual(refreshed.authz_version, 3)
        self.assertEqual(refreshed.selected_document_ids, ())
        self.assertEqual(refreshed.chat_turns, ())
        self.assertEqual(refreshed.search_query, "")

    def test_unknown_role_fails_closed_without_registry(self):
        self.update("DELETE FROM membership_roles WHERE tenant_id=?", (A,))
        self.update("INSERT INTO membership_roles VALUES (?,?,?,?)",
                    (A, M_A, "unregistered_role", VERSION))
        with self.assertRaises(TenantContextDenied):
            self.select(A)

    def test_wrong_registry_version_fails_closed(self):
        self.update("UPDATE memberships SET role_registry_version='unapproved' WHERE tenant_id=?", (A,))
        with self.assertRaises(TenantContextDenied):
            self.select(A)

    def test_dangling_role_mapping_fails_closed(self):
        self.update("DELETE FROM membership_roles WHERE tenant_id=?", (A,))
        with self.assertRaises(TenantContextDenied):
            self.select(A)

    def test_invalid_requested_identifier_denied_before_sql(self):
        for value in ("", "A' OR 1=1 --", "not-uuid"):
            with self.subTest(value=value):
                with self.assertRaises(TenantContextDenied):
                    self.select(value)

    def test_revocation_timestamp_blocks_stale_active_status(self):
        self.update(
            "UPDATE memberships SET revoked_at=? WHERE tenant_id=?",
            ("2026-11-01T00:00:00+00:00", A),
        )
        with self.assertRaises(TenantContextDenied):
            self.select(A)

    def test_future_membership_join_not_usable(self):
        self.update(
            "UPDATE memberships SET joined_at=? WHERE tenant_id=?",
            ("2099-01-01T00:00:00+00:00", A),
        )
        with self.assertRaises(TenantContextDenied):
            self.select(A)

    def test_broken_connection_fails_closed_no_database_message(self):
        def broken():
            raise RuntimeError("password for database is a secret")
        repo = PostgresMembershipRepository(
            open_connection=broken, approved_registry_version=VERSION
        )
        with self.assertRaises(TenantContextDenied) as caught:
            select_tenant_from_store(
                principal=AuthenticatedPrincipal(U, "active"),
                target_tenant_id=A, current=None, repository=repo
            )
        self.assertEqual(str(caught.exception), "Tenant context not authorized")


if __name__ == "__main__":
    unittest.main()
