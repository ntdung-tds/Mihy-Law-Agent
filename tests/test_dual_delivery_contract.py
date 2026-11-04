"""Guard the Owner-approved dual-delivery project requirement.

Governance regression only: these checks MUST NOT be reported as successful
installation/E2E of either deployment mode.
"""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class DualDeliveryContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.modes = json.loads((ROOT / "deployment/modes.json").read_text())
        cls.release = json.loads((ROOT / "release/product_readiness.json").read_text())
        cls.state = json.loads((ROOT / "pcs/STATE.json").read_text())

    def test_both_modes_are_required_in_one_product(self):
        m = self.modes
        self.assertTrue(m["same_core_source"])
        self.assertEqual(m["saas_future_operator"], "IAICT")
        self.assertNotIn("platform_operator", m)
        self.assertEqual(m["standalone_operator"], "PER_INSTALLATION_CUSTOMER_OR_APPROVED_CONTRACTOR")
        self.assertEqual({d["id"] for d in m["delivery_modes"]}, {"saas", "dedicated"})
        self.assertTrue(all(d["required"] for d in m["delivery_modes"]))
        self.assertTrue(all(d["end_to_end"] == "NOT_RUN" for d in m["delivery_modes"]))
        self.assertEqual(m["real_dedicated_deployment"], "NOT_RUN")

    def test_same_release_security_and_tenant_boundaries(self):
        clauses = " ".join(self.modes["shared_invariants"]).lower()
        for marker in ("migrations", "matteracl", "membership",
                       "credentials", "production", "same"):
            self.assertIn(marker, clauses)

    def test_owner_decision_and_unmodified_srs_baseline(self):
        ids = {d["id"] for d in self.state["state"]["decisions"]}
        self.assertIn("DEC-015", ids)
        self.assertTrue((ROOT / "srs_changed.md").exists())
        self.assertEqual(self.modes["srs_baseline"],
                         "v1.1.15 unchanged pending recorded change review")
        self.assertFalse(self.release["srs_changed"])

    def test_not_claimed_deployed_or_product_ready(self):
        delivery = self.release["delivery_modes"]
        self.assertEqual(set(delivery), {"saas", "dedicated"})
        self.assertNotEqual(delivery["saas"]["status"], "PASS")
        self.assertNotEqual(delivery["dedicated"]["status"], "PASS")
        self.assertFalse(self.release["live_customer_accounts_created"])
        self.assertEqual(self.release["production_deployment"], "NOT_AUTHORIZED")
        self.assertEqual(self.release["owner_final_acceptance"], "PENDING")

    def test_dedicated_task_is_in_required_implementation_scope(self):
        tasks = self.state["state"]["tasks"]
        dedicated = [t for t in tasks if t["id"] == "AL-R0-DEPLOY-001"]
        self.assertEqual(len(dedicated), 1)
        self.assertTrue(dedicated[0]["required"])
        self.assertEqual(dedicated[0]["owner_acceptance"], "PENDING_REAL_STANDALONE_E2E")
        self.assertEqual(dedicated[0]["tests"]["actual_dedicated_install"], "NOT_RUN")

    def test_release_gate_cannot_pass_with_only_saas(self):
        from copy import deepcopy
        from tools.check_product_readiness import evaluate_readiness
        ready = deepcopy(self.release)
        for gate in ready["demo_gates"] + ready["gates"]:
            gate["status"] = "PASS"
            gate["evidence"] = ["test-run-pointer-only"]
        for mode in ready["delivery_modes"].values():
            mode["status"] = "PASS"
            mode["deployment_e2e"] = "PASS"
            mode["evidence"] = ["test-run-pointer-only"]
        ready["live_customer_accounts_created"] = True
        ready["production_deployment"] = "AUTHORIZED"
        ready["owner_final_acceptance"] = "APPROVED"
        self.assertTrue(evaluate_readiness(ready)["product_ready"])
        ready["delivery_modes"]["dedicated"]["status"] = "NOT_IMPLEMENTED"
        result = evaluate_readiness(ready)
        self.assertFalse(result["product_ready"])
        self.assertFalse(result["delivery_modes_ready"])
        self.assertIn("DELIVERY_MODE_DEDICATED_NOT_VERIFIED", result["blockers"])
        ready["delivery_modes"].pop("dedicated")
        result = evaluate_readiness(ready)
        self.assertFalse(result["product_ready"])
        self.assertIn("REQUIRED_DELIVERY_MODES_MISSING_OR_DUPLICATED", result["blockers"])

    def test_standalone_first_priority_and_iaict_plain_customer(self):
        self.assertEqual(self.modes["current_implementation_priority"], "standalone_first")
        self.assertEqual(self.modes["current_test_customer"],
                         "IAICT_as_ordinary_organization_in_standalone")
        self.assertEqual(self.modes["iaict_standalone_privileges"],
                         "NONE_BEYOND_EXPLICIT_TENANT_MEMBERSHIP_AND_MATTER_ACL")
        ordered = {m["id"]: m for m in self.modes["delivery_modes"]}
        self.assertEqual(ordered["saas"]["stage"], "DEFERRED_BY_OWNER_AFTER_STANDALONE")
        self.assertEqual(ordered["dedicated"]["current_priority"], "NOW")
        decisions = {x["id"] for x in self.state["state"]["decisions"]}
        self.assertIn("DEC-016", decisions)
        self.assertEqual(self.state["state"]["current"]["active_task"], "AL-R0-DEPLOY-001")
        self.assertEqual(self.release["delivery_focus"], "dedicated_standalone_first")

    def test_dedicated_can_be_accepted_separately_before_future_saas(self):
        from copy import deepcopy
        from tools.check_product_readiness import evaluate_readiness
        prospective = deepcopy(self.release)
        for gate in prospective["gates"]:
            gate["status"] = "PASS"
            gate["evidence"] = ["hypothetical-evidence-in-regression-only"]
        prospective["delivery_modes"]["dedicated"].update(
            status="PASS", deployment_e2e="PASS",
            evidence=["hypothetical-real-install-test-run-pointer"],
        )
        prospective["live_customer_accounts_created"] = True
        prospective["dedicated_owner_final_acceptance"] = "APPROVED"
        prospective["dedicated_production_deployment"] = "AUTHORIZED"
        result = evaluate_readiness(prospective)
        self.assertTrue(result["standalone_release_ready"])
        self.assertFalse(result["product_ready"])  # SaaS stays later
        prospective["dedicated_production_deployment"] = "NOT_AUTHORIZED"
        self.assertFalse(evaluate_readiness(prospective)["standalone_release_ready"])
        prospective["dedicated_production_deployment"] = "AUTHORIZED"
        prospective["delivery_modes"]["dedicated"]["evidence"] = []
        self.assertFalse(evaluate_readiness(prospective)["standalone_release_ready"])

    def test_standalone_compose_is_nonproduction_db_only_without_public_port(self):
        compose = (ROOT / "deployment" / "standalone" / "compose.yaml").read_text()
        smoke = (ROOT / "deployment" / "standalone" / "smoke_isolation.sh").read_text()
        self.assertIn("postgres:16", compose)
        self.assertIn("AI_LAW_DB_PASSWORD:?", compose)
        self.assertIn("0001_r0_iam_rls.sql", compose)
        self.assertNotIn("ports:", compose)
        self.assertIn("dc_a up -d --wait", smoke)
        self.assertIn("dc_b up -d --wait", smoke)
        self.assertIn("docker port", smoke)
        self.assertIn("down -v --remove-orphans", smoke)
        self.assertFalse(self.release["dedicated_owner_final_acceptance"]
                         == "APPROVED")
        self.assertEqual(self.release["dedicated_production_deployment"],
                         "NOT_AUTHORIZED")


if __name__ == "__main__":
    unittest.main()
