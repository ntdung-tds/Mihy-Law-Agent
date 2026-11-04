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
        self.assertEqual(m["platform_operator"], "IAICT")
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
        self.assertEqual(dedicated[0]["owner_acceptance"], "PENDING_REAL_E2E")
        self.assertEqual(dedicated[0]["tests"]["actual_dedicated_install"], "NOT_RUN")


if __name__ == "__main__":
    unittest.main()
