"""R31 synthetic demo customers and fail-closed product-readiness contracts.

No real identities, passwords, files, or AI. PostgreSQL tests run only
against disposable CI postgres with AI_LAW_TEST_PG_DSN; never against production.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from uuid import UUID

from demo.seed_demo import load_fixture, seed_demo_records, require_disposable_demo_dsn
from tools.check_product_readiness import evaluate_readiness

try:
    import psycopg
except ImportError:
    psycopg = None

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "demo" / "customers.json"
SITE = ROOT / "web" / "r0-demo"
READINESS = ROOT / "release" / "product_readiness.json"
DSN = os.environ.get("AI_LAW_TEST_PG_DSN")
RUNTIME_ROLE = "ai_law_r31_demo_app"
RUNTIME_PASSWORD = "synthetic-ci-only-r31"


class DemoFixtureContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = load_fixture(FIXTURE)

    def test_entire_fixture_is_synthetic_and_has_no_passwords(self):
        data = self.fixture
        self.assertIs(data["synthetic_only"], True)
        self.assertEqual(data["schema_version"], 1)
        text = json.dumps(data, ensure_ascii=False).lower()
        for prohibited in ("password", "api_key", "@gmail", "phone_number", "thân chủ thật"):
            self.assertNotIn(prohibited, text)
        self.assertEqual(len(data["tenants"]), 2)
        self.assertEqual(len(data["users"]), 4)
        self.assertEqual(len(data["scenarios"]), 5)

    def test_all_ids_are_synthetic_unique_and_tenants_determined(self):
        data = self.fixture
        for key in ("tenants", "users", "memberships", "matters"):
            vals = [item["id"] for item in data[key]]
            self.assertEqual(len(vals), len(set(vals)))
            for val in vals:
                self.assertEqual(str(UUID(val)), val)
        tenant_ids = {t["id"] for t in data["tenants"]}
        user_ids = {u["id"] for u in data["users"]}
        for m in data["memberships"]:
            self.assertIn(m["tenant_id"], tenant_ids)
            self.assertIn(m["user_id"], user_ids)
            self.assertIn(m["role"], ("lawyer", "tenant_admin"))
        self.assertEqual({t["type"] for t in data["tenants"]},
                         {"personal", "organization"})

    def test_two_tenant_contexts_one_principal_and_admin_denial(self):
        scenarios = {s["key"]: s for s in self.fixture["scenarios"]}
        self.assertEqual(scenarios["personal"]["user_id"], scenarios["organization"]["user_id"])
        self.assertNotEqual(scenarios["personal"]["tenant_id"], scenarios["organization"]["tenant_id"])
        self.assertEqual(scenarios["org_admin"]["expected_doc_ids"], [])
        self.assertEqual(scenarios["outsider"]["expected_doc_ids"], [])
        self.assertEqual(len(scenarios["org_lawyer"]["expected_doc_ids"]), 2)

    def test_expected_documents_never_cross_tenants(self):
        documents = {d["id"]: d for d in self.fixture["documents"]}
        for scenario in self.fixture["scenarios"]:
            for doc_id in scenario["expected_doc_ids"]:
                self.assertIn(doc_id, documents)
                self.assertEqual(documents[doc_id]["tenant_id"], scenario["tenant_id"])
        own = next(s for s in self.fixture["scenarios"] if s["key"] == "personal")
        org = next(s for s in self.fixture["scenarios"] if s["key"] == "organization")
        self.assertTrue(set(own["expected_doc_ids"]).isdisjoint(org["expected_doc_ids"]))

    def test_static_web_uses_exact_server_fixture_copy(self):
        browser_fixture = json.loads((SITE / "customers.json").read_text(encoding="utf-8"))
        self.assertEqual(browser_fixture, self.fixture)

    def test_demo_web_is_explicit_simulation_not_fake_auth(self):
        html = (SITE / "index.html").read_text(encoding="utf-8")
        js = (SITE / "app.js").read_text(encoding="utf-8")
        css = (SITE / "styles.css").read_text(encoding="utf-8")
        for phrase in ("DỮ LIỆU GIẢ LẬP", "Không phải đăng nhập thật", "Chưa kết nối AI"):
            self.assertIn(phrase, html + js)
        for unsafe in ("localStorage", "sessionStorage", "eval(", "innerHTML", "document.cookie"):
            self.assertNotIn(unsafe, js)
        for label in ("Chọn khách hàng demo", "Hồ sơ được xem", "Kiểm thử quyền"):
            self.assertIn(label, html)
        self.assertIn("@media (max-width: 700px)", css)
        self.assertIn("prefers-reduced-motion", css)
        self.assertIn("aria-live=\"polite\"", html)

    def test_direct_seed_api_rejects_non_disposable_connection(self):
        class NonDisposableConnection:
            class info:
                dbname = "real_legal_cases"
                host = "db.production.example"
                user = "postgres"
            def transaction(self):
                raise AssertionError("Must deny before opening transaction")
        with self.assertRaises(ValueError):
            seed_demo_records(NonDisposableConnection(), self.fixture)

    def test_destructive_seed_guard_rejects_non_disposable_dsn(self):
        for val in (
            "postgresql://user:pass@db.production:5432/ai_law",
            "postgresql://postgres:pass@127.0.0.1:5432/legal_cases",
            "postgresql://postgres:pass@127.0.0.1:5432/postgres",
            "postgresql://postgres:pass@10.0.0.1:5432/ai_law_r30_synthetic",
        ):
            with self.subTest(val=val):
                with self.assertRaises(ValueError):
                    require_disposable_demo_dsn(val)
        require_disposable_demo_dsn(
            "postgresql://postgres:synthetic-ci-only@127.0.0.1:5432/ai_law_r30_synthetic"
        )


class ProductReadinessContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(READINESS.read_text(encoding="utf-8"))

    def test_real_product_gate_remains_closed(self):
        result = evaluate_readiness(self.data)
        self.assertFalse(result["product_ready"])
        self.assertGreaterEqual(len(result["blockers"]), 6)
        self.assertEqual(self.data["baseline"], "SRS v1.1.15")
        self.assertEqual(self.data["release_target"], "R0")
        self.assertEqual(self.data["production_deployment"], "NOT_AUTHORIZED")
        self.assertEqual(self.data["owner_final_acceptance"], "PENDING")

    def test_missing_evidence_cannot_force_open_all_gates(self):
        cloned = json.loads(json.dumps(self.data))
        for gate in cloned["gates"]:
            gate["status"] = "PASS"
            gate["evidence"] = []
        self.assertFalse(evaluate_readiness(cloned)["product_ready"])

    def test_demo_scope_is_not_same_as_product_ready(self):
        result = evaluate_readiness(self.data)
        self.assertIsInstance(result["demo_ready"], bool)
        self.assertFalse(result["product_ready"])
        self.assertFalse(self.data["live_customer_accounts_created"])
        self.assertTrue(self.data["synthetic_demo_customers_created"])

    def test_cannot_erase_required_gates_to_claim_product_ready(self):
        forged = json.loads(json.dumps(self.data))
        forged["demo_gates"] = [{"id":"DEMO_FIXTURE", "status":"PASS", "evidence":["fake"]}]
        forged["gates"] = [{"id":"D01_APPROVAL", "status":"PASS", "evidence":["fake"]}]
        forged["production_deployment"] = "AUTHORIZED"
        forged["owner_final_acceptance"] = "APPROVED"
        forged["live_customer_accounts_created"] = True
        self.assertFalse(evaluate_readiness(forged)["product_ready"])

    def test_readiness_cli_fail_closed_exit_code(self):
        proc = subprocess.run(
            [sys.executable, "-m", "tools.check_product_readiness", str(READINESS), "--json"],
            cwd=ROOT, capture_output=True, text=True, timeout=8,
        )
        self.assertEqual(proc.returncode, 3)
        output = json.loads(proc.stdout)
        self.assertFalse(output["product_ready"])
        self.assertNotIn("production ready", proc.stderr.lower())


@unittest.skipUnless(DSN and psycopg, "Runs on disposable PostgreSQL 16 CI service only")
class DemoPostgresIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        require_disposable_demo_dsn(DSN)
        cls.admin = psycopg.connect(DSN, autocommit=True)
        cls.admin.execute("DROP SCHEMA IF EXISTS ai_law CASCADE")
        sql = (ROOT / "db" / "migrations" / "0001_r0_iam_rls.sql").read_text(encoding="utf-8")
        cls.admin.execute(sql)
        cls.admin.execute(f"""
           DO $do$ BEGIN
             IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='{RUNTIME_ROLE}') THEN
               CREATE ROLE {RUNTIME_ROLE} LOGIN PASSWORD '{RUNTIME_PASSWORD}'
               NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
             END IF;
           END $do$;
        """)
        cls.admin.execute(f"GRANT USAGE ON SCHEMA ai_law TO {RUNTIME_ROLE}")
        cls.admin.execute(f"GRANT SELECT ON ALL TABLES IN SCHEMA ai_law TO {RUNTIME_ROLE}")

    @classmethod
    def tearDownClass(cls):
        cls.admin.close()

    def setUp(self):
        self.admin.execute("""
          TRUNCATE ai_law.membership_roles,ai_law.matter_group_members,
                   ai_law.matter_user_acl,ai_law.matter_group_acl,
                   ai_law.matter_groups,ai_law.matters,ai_law.memberships,
                   ai_law.role_catalog,ai_law.principals,ai_law.tenants,
                   ai_law.iam_audit CASCADE
        """)
        self.fixture = load_fixture(FIXTURE)
        seed_demo_records(self.admin, self.fixture)

    def scoped(self, user_id, tenant_id):
        from r0_core.postgres_scope import ScopedPostgresFactory, VerifiedDatabaseScope
        def open_connection():
            return psycopg.connect(
                DSN, user=RUNTIME_ROLE, password=RUNTIME_PASSWORD,
                options="-c search_path=ai_law,pg_catalog",
            )
        return ScopedPostgresFactory(
            open_connection, VerifiedDatabaseScope(user_id, tenant_id)
        )

    def test_seeded_personal_and_org_memberships_are_isolated(self):
        from r0_core.membership_repository import PostgresMembershipRepository
        users = {u["key"]: u["id"] for u in self.fixture["users"]}
        tenant = {t["key"]: t["id"] for t in self.fixture["tenants"]}
        user = users["lawyer_a"]
        for key in ("personal", "organization"):
            scope = self.scoped(user, tenant[key])
            repo = PostgresMembershipRepository(scope, "1.1.15")
            self.assertIsNotNone(repo(user, tenant[key]))
            with scope() as conn:
                rows = conn.execute("SELECT tenant_id FROM memberships").fetchall()
                self.assertEqual({str(r[0]) for r in rows}, {tenant[key]})
        outsider = users["outsider"]
        self.assertIsNone(PostgresMembershipRepository(
            self.scoped(outsider, tenant["organization"]), "1.1.15"
        )(outsider, tenant["organization"]))

    def test_admin_is_not_implicitly_allowed_to_read_case(self):
        from r0_core.postgres_acl import PostgresMatterRead
        users = {u["key"]: u["id"] for u in self.fixture["users"]}
        tenants = {t["key"]: t["id"] for t in self.fixture["tenants"]}
        matters = {m["key"]: m["id"] for m in self.fixture["matters"]}
        org = tenants["organization"]
        admin = users["org_admin"]
        lawyer = users["org_lawyer"]
        reader_admin = PostgresMatterRead(self.scoped(admin, org))
        reader_lawyer = PostgresMatterRead(self.scoped(lawyer, org))
        self.assertFalse(reader_admin(org, admin, matters["organization"]))
        self.assertTrue(reader_lawyer(org, lawyer, matters["organization"]))

    def test_switching_same_principal_does_not_show_foreign_matter(self):
        from r0_core.postgres_acl import PostgresMatterRead
        users = {u["key"]: u["id"] for u in self.fixture["users"]}
        tenants = {t["key"]: t["id"] for t in self.fixture["tenants"]}
        matters = {m["key"]: m["id"] for m in self.fixture["matters"]}
        u = users["lawyer_a"]
        personal = tenants["personal"]
        org = tenants["organization"]
        self.assertTrue(PostgresMatterRead(self.scoped(u,personal))(personal,u,matters["personal"]))
        self.assertFalse(PostgresMatterRead(self.scoped(u,org))(org,u,matters["personal"]))
        self.assertTrue(PostgresMatterRead(self.scoped(u,org))(org,u,matters["organization"]))

    def test_revocation_cuts_demo_access(self):
        from r0_core.membership_repository import PostgresMembershipRepository
        users = {u["key"]:u["id"] for u in self.fixture["users"]}
        tenant = {t["key"]:t["id"] for t in self.fixture["tenants"]}
        u = users["lawyer_a"]
        t = tenant["organization"]
        repo = PostgresMembershipRepository(self.scoped(u,t), "1.1.15")
        self.assertIsNotNone(repo(u,t))
        self.admin.execute("""
           UPDATE ai_law.memberships
           SET status='revoked',revoked_at=now()
           WHERE tenant_id=%s AND user_id=%s
        """, (t,u))
        self.assertIsNone(repo(u,t))


if __name__ == "__main__":
    unittest.main()
