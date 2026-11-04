"""R30: *actual PostgreSQL* synthetic IAM/RLS integration tests.

Runs only with AI_LAW_TEST_PG_DSN in disposable CI PostgreSQL. No real accounts.
No actual identity provider or real run store: WSGI still has fixture verifier.
"""
from __future__ import annotations

import json
import os
import unittest
from pathlib import Path

try:
    import psycopg
except ImportError:
    psycopg = None

from r0_core.membership_repository import PostgresMembershipRepository, select_tenant_from_store
from r0_core.tenant_context import AuthenticatedPrincipal, TenantContextDenied
from r0_core.run_read_wsgi import GetRunWSGI, RunSnapshot
from r0_core.session_boundary import VerifiedBearerIdentity
from r0_core.postgres_scope import ScopedPostgresFactory, VerifiedDatabaseScope
from r0_core.postgres_acl import PostgresMatterRead

DSN = os.environ.get("AI_LAW_TEST_PG_DSN")
U = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
M_UA = "11111111-aaaa-4111-8111-111111111111"
M_UB = "11111111-bbbb-4111-8111-111111111111"
M_OTHER = "22222222-aaaa-4222-8222-222222222222"
CASE_A = "cccccccc-aaaa-4ccc-8ccc-cccccccccccc"
CASE_B = "cccccccc-bbbb-4ccc-8ccc-cccccccccccc"
GROUP_A = "dddddddd-aaaa-4ddd-8ddd-dddddddddddd"
NOW = 1800000000
APP_ROLE = "ai_law_r30_test_app"
APP_PASSWORD = "synthetic-local-only"


@unittest.skipUnless(DSN and psycopg, "Requires ephemeral real PostgreSQL and psycopg (CI postgres-rls job)")
class RealPostgresRlsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin = psycopg.connect(DSN, autocommit=True)
        sql = (Path(__file__).resolve().parents[1] / "db" / "migrations"
               / "0001_r0_iam_rls.sql").read_text()
        cls.admin.execute("DROP SCHEMA IF EXISTS ai_law CASCADE")
        cls.admin.execute(sql)
        cls.admin.execute(f"""
            DO $do$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                CREATE ROLE {APP_ROLE} LOGIN PASSWORD '{APP_PASSWORD}'
                  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
              END IF;
            END $do$;
        """)
        cls.admin.execute(f"GRANT USAGE ON SCHEMA ai_law TO {APP_ROLE}")
        cls.admin.execute(f"""GRANT SELECT ON ALL TABLES IN SCHEMA ai_law TO {APP_ROLE}""")
        # Deliberately no data writes; runtime role does not own any table.
        role = cls.admin.execute(
            "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=%s", (APP_ROLE,)
        ).fetchone()
        assert role == (False, False)

    @classmethod
    def tearDownClass(cls):
        cls.admin.close()

    def _many(self, query, rows):
        with self.admin.cursor() as cur:
            cur.executemany(query, rows)

    def setUp(self):
        self.admin.execute("""
          TRUNCATE ai_law.membership_roles,ai_law.matter_group_members,
                   ai_law.matter_user_acl,ai_law.matter_group_acl,
                   ai_law.matter_groups,ai_law.matters,ai_law.memberships,
                   ai_law.role_catalog,ai_law.principals,ai_law.tenants,
                   ai_law.iam_audit CASCADE
        """)
        with self.admin.transaction():
            self._many("INSERT INTO ai_law.principals VALUES (%s,%s,%s)", [
                (U, "fixture-ext", "active"), (OTHER, "fixture-ext-2", "active")
            ])
            self._many("INSERT INTO ai_law.tenants VALUES (%s,%s)", [
                (A, "personal"), (B, "organization")
            ])
            self._many(
                "INSERT INTO ai_law.role_catalog(role_key,description,registry_version) VALUES (%s,%s,%s)",
                [("lawyer", "synthetic lawyer", "1.1.15"),
                 ("tenant_admin","synthetic admin", "1.1.15")],
            )
            self._many("""
              INSERT INTO ai_law.memberships
              (membership_id,tenant_id,user_id,status,authz_version,
               role_registry_version,joined_at)
              VALUES (%s,%s,%s,'active',1,'1.1.15',now()-interval '1 day')
            """, [(M_UA,A,U),(M_UB,B,U),(M_OTHER,A,OTHER)])
            self._many("""
              INSERT INTO ai_law.membership_roles
              (tenant_id,membership_id,role_key,registry_version)
              VALUES (%s,%s,%s,'1.1.15')
            """, [(A,M_UA,"lawyer"),(B,M_UB,"lawyer"),(A,M_OTHER,"tenant_admin")])
            self._many("""
              INSERT INTO ai_law.matters(tenant_id,matter_id,owner_user_id,acl_version)
              VALUES (%s,%s,%s,1)
            """, [(A,CASE_A,U),(B,CASE_B,U)])
            self.admin.execute("""
              INSERT INTO ai_law.matter_user_acl
              (tenant_id,matter_id,user_id,permission,effect,acl_version,valid_from)
              VALUES (%s,%s,%s,'read','allow',1,now()-interval '1 hour')
            """, (A,CASE_A,U))

    def _runtime_connection(self):
        return psycopg.connect(
            DSN, user=APP_ROLE, password=APP_PASSWORD,
            options="-c search_path=ai_law,pg_catalog",
        )

    def scoped(self, user=U, tenant=A):
        return ScopedPostgresFactory(
            open_connection=self._runtime_connection,
            scope=VerifiedDatabaseScope(user_id=user,tenant_id=tenant)
        )

    def membership(self, user=U, tenant=A):
        return PostgresMembershipRepository(
            open_connection=self.scoped(user,tenant),
            approved_registry_version="1.1.15",
        )

    def test_migration_has_force_rls_and_non_bypass_runtime(self):
        tables = self.admin.execute("""
          SELECT relname,relrowsecurity,relforcerowsecurity
          FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
          WHERE n.nspname='ai_law' AND c.relkind='r'
        """).fetchall()
        self.assertGreaterEqual(len(tables), 9)
        for name,rls,force in tables:
            if name != "role_catalog":
                self.assertTrue(rls, name)
                self.assertTrue(force, name)
        with self._runtime_connection() as conn:
            role = conn.execute("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user").fetchone()
            self.assertEqual(role,(False,False))
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                conn.execute("INSERT INTO ai_law.tenants VALUES (%s,'personal')", (
                  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",))

    def test_no_context_denied_and_session_local_settings_do_not_leak(self):
        with self._runtime_connection() as conn:
            self.assertEqual(conn.execute("SELECT count(*) FROM ai_law.memberships").fetchone()[0],0)
            self.assertEqual(conn.execute("SELECT count(*) FROM ai_law.matters").fetchone()[0],0)
            conn.execute("SELECT set_config('app.verified_user_id',%s,true)",(U,))
            conn.execute("SELECT set_config('app.verified_tenant_id',%s,true)",(A,))
            self.assertEqual(conn.execute("SELECT count(*) FROM ai_law.memberships").fetchone()[0],1)
            conn.commit()
            self.assertEqual(conn.execute("SELECT count(*) FROM ai_law.memberships").fetchone()[0],0)

    def test_actual_postgres_membership_adapter_a_and_b_scoped(self):
        for tenant in (A,B):
            with self.subTest(tenant=tenant):
                view = select_tenant_from_store(
                    principal=AuthenticatedPrincipal(U,"active"), current=None,
                    target_tenant_id=tenant, repository=self.membership(U,tenant)
                )
                self.assertEqual(view.tenant_id,tenant)
                self.assertGreaterEqual(view.authz_version,1)
        # A scoped DB connection cannot select the B tenant membership:
        with self.scoped(U,A)() as conn:
            rows=conn.execute("SELECT tenant_id FROM memberships ORDER BY tenant_id").fetchall()
            self.assertEqual([str(r[0]) for r in rows],[A])

    def test_nonmember_denied_and_revocation_rechecked(self):
        with self.assertRaises(TenantContextDenied):
            select_tenant_from_store(principal=AuthenticatedPrincipal(OTHER,"active"),
                current=None,target_tenant_id=B,repository=self.membership(OTHER,B))
        self.assertIsNotNone(self.membership(U,A)(U,A))
        before=self.admin.execute("SELECT authz_version FROM ai_law.memberships WHERE membership_id=%s",(M_UA,)).fetchone()[0]
        self.admin.execute("""UPDATE ai_law.memberships SET status='revoked',revoked_at=now()
                          WHERE membership_id=%s""",(M_UA,))
        after=self.admin.execute("SELECT authz_version FROM ai_law.memberships WHERE membership_id=%s",(M_UA,)).fetchone()[0]
        self.assertGreater(after,before)
        self.assertIsNone(self.membership(U,A)(U,A))

    def test_active_membership_requires_valid_role_at_commit(self):
        invalid="99999999-9999-4999-8999-999999999999"
        with self.assertRaises(psycopg.Error):
            with self.admin.transaction():
                self.admin.execute("""INSERT INTO ai_law.memberships(
                   membership_id,tenant_id,user_id,status,authz_version,role_registry_version,joined_at)
                   VALUES (%s,%s,%s,'active',1,'1.1.15',now())""",(invalid,A,U))
        count=self.admin.execute("SELECT count(*) FROM ai_law.memberships WHERE membership_id=%s",(invalid,)).fetchone()[0]
        self.assertEqual(count,0)

    def test_role_update_bumps_authz_version(self):
        v=self.admin.execute("SELECT authz_version FROM ai_law.memberships WHERE membership_id=%s",(M_UA,)).fetchone()[0]
        self.admin.execute("""INSERT INTO ai_law.membership_roles VALUES (%s,%s,'tenant_admin','1.1.15')""",(A,M_UA))
        v2=self.admin.execute("SELECT authz_version FROM ai_law.memberships WHERE membership_id=%s",(M_UA,)).fetchone()[0]
        self.assertGreater(v2,v)

    def test_personal_matter_only_with_explicit_acl(self):
        read=PostgresMatterRead(open_scoped_connection=self.scoped(U,A))
        self.assertTrue(read(A,U,CASE_A))
        self.assertFalse(read(A,U,CASE_B))
        self.assertFalse(read(B,U,CASE_A))
        other=PostgresMatterRead(open_scoped_connection=self.scoped(OTHER,A))
        self.assertFalse(other(A,OTHER,CASE_A))  # even tenant_admin not implicit
        with self.scoped(U,A)() as conn:
            rows=conn.execute("SELECT matter_id FROM matters").fetchall()
            self.assertEqual([str(row[0]) for row in rows],[CASE_A])

    def test_acl_expiry_and_deny_override_allow(self):
        read=PostgresMatterRead(open_scoped_connection=self.scoped(U,A))
        self.assertTrue(read(A,U,CASE_A))
        self.admin.execute("""INSERT INTO ai_law.matter_user_acl
          (tenant_id,matter_id,user_id,permission,effect,acl_version,valid_from)
          VALUES (%s,%s,%s,'read','deny',1,now()-interval '1 hour')""",(A,CASE_A,U))
        self.assertFalse(read(A,U,CASE_A))
        self.admin.execute("""DELETE FROM ai_law.matter_user_acl
          WHERE tenant_id=%s AND matter_id=%s AND effect='deny'""",(A,CASE_A))
        self.admin.execute("""UPDATE ai_law.matter_user_acl
          SET valid_to=now()-interval '1 minute'
          WHERE tenant_id=%s AND matter_id=%s""",(A,CASE_A))
        self.assertFalse(read(A,U,CASE_A))

    def test_group_allow_but_user_deny_wins(self):
        with self.admin.transaction():
            self.admin.execute("INSERT INTO ai_law.matter_groups VALUES (%s,%s,'fixture group')",(A,GROUP_A))
            self.admin.execute("INSERT INTO ai_law.matter_group_members VALUES (%s,%s,%s)",(A,GROUP_A,U))
            self.admin.execute("""INSERT INTO ai_law.matter_group_acl
              (tenant_id,matter_id,group_id,permission,effect,acl_version,valid_from)
              VALUES (%s,%s,%s,'read','allow',1,now()-interval '1 hour')""",(A,CASE_A,GROUP_A))
            self.admin.execute("""UPDATE ai_law.matter_user_acl
              SET valid_to=now()-interval '1 minute' WHERE tenant_id=%s""",(A,))
        read=PostgresMatterRead(open_scoped_connection=self.scoped(U,A))
        self.assertTrue(read(A,U,CASE_A))
        self.admin.execute("""INSERT INTO ai_law.matter_user_acl
          (tenant_id,matter_id,user_id,permission,effect,acl_version,valid_from)
          VALUES (%s,%s,%s,'read','deny',1,now()-interval '1 hour')""",(A,CASE_A,U))
        self.assertFalse(read(A,U,CASE_A))

    def test_composite_foreign_key_blocks_cross_tenant_acl(self):
        with self.assertRaises(psycopg.errors.ForeignKeyViolation):
            self.admin.execute("""INSERT INTO ai_law.matter_user_acl
              (tenant_id,matter_id,user_id,permission,effect,acl_version,valid_from)
              VALUES (%s,%s,%s,'read','allow',1,now())""",(B,CASE_B,OTHER))

    def test_http_get_run_with_real_postgres_membership_and_matter_acl(self):
        # Session verified by a FAKE verifier; run contents are synthetic in
        # memory. PostgreSQL enforces *real* membership and MatterACL.
        active_tenant=[A]
        calls=[]
        def repo_for_scope(user,tenant):
            calls.append(("membership",user,tenant))
            return self.membership(user,tenant)
        def run_acl(tenant,user,run_id):
            if run_id!="fixture-run":
                return False
            return PostgresMatterRead(open_scoped_connection=self.scoped(user,tenant))(
                tenant,user,CASE_A
            )
        app=GetRunWSGI(
            token_verifier=lambda _:VerifiedBearerIdentity(
              "https://idp.example.invalid","fixture-external",("ai-law-api",),
              "synthetic-session",NOW-10,NOW-10,NOW+100),
            identity_lookup=lambda iss,sub:AuthenticatedPrincipal(U,"active"),
            session_is_active=lambda uid,sid:True,
            active_tenant_for_session=lambda uid,sid:active_tenant[0],
            membership_repository=self.membership(U,A),
            membership_repository_for_scope=repo_for_scope,
            authorize_run_read=run_acl,
            load_run=lambda t,r:RunSnapshot(t,r,{"run_id":r,"status":"queued",
                            "input_snapshot_id":"fixture-input","policy_version":"fixture-policy"}),
            expected_issuer="https://idp.example.invalid",
            expected_audience="ai-law-api",now_epoch=lambda:NOW,
        )
        def get_response():
            from io import BytesIO
            status=[]
            body=b"".join(app({"REQUEST_METHOD":"GET",
                "PATH_INFO":"/v1/runs/fixture-run", "QUERY_STRING":"",
                "HTTP_AUTHORIZATION":"Bearer fixture",
                "wsgi.input":BytesIO()},lambda s,h,*_:status.append(s)))
            return int(status[0][:3]),json.loads(body)
        self.assertEqual(get_response()[0],200)
        active_tenant[0]=B
        self.assertEqual(get_response()[0],404)
        active_tenant[0]=A
        self.admin.execute("""UPDATE ai_law.memberships
          SET status='revoked',revoked_at=now() WHERE membership_id=%s""",(M_UA,))
        self.assertEqual(get_response()[0],404)
        self.assertEqual(len(calls),3)


if __name__=="__main__":
    unittest.main()
