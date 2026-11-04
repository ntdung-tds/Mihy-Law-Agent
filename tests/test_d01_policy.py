"""D01 policy governance safety rails: no claim of signed legal or real-data approval."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "pcs" / "decisions" / "D01_POLICY_R29.json"
STATE = ROOT / "pcs" / "STATE.json"


class D01PolicyApprovalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(POLICY.read_text(encoding="utf-8"))

    def test_policy_only_approved_not_signed(self):
        self.assertEqual(self.data["id"], "D01")
        self.assertEqual(self.data["baseline"], "SRS v1.1.15")
        self.assertEqual(self.data["policy_approval"], "OWNER_APPROVED_IN_CHAT")
        self.assertEqual(self.data["signed_record_status"], "PENDING_SIGNED_EVIDENCE")
        self.assertIsNone(self.data["signed_evidence_uri"])

    def test_two_independent_release_gates_remain_blocked(self):
        self.assertEqual(self.data["gates"]["GATE-D01-R0"], "PENDING_EVIDENCE")
        self.assertEqual(self.data["gates"]["GATE-LEGAL-DATA"], "PENDING_APPROVAL")
        self.assertFalse(self.data["allowed"]["real_client_data"])
        self.assertFalse(self.data["allowed"]["live_identity_tenant_activation"])
        self.assertFalse(self.data["allowed"]["production"])
        self.assertTrue(self.data["allowed"]["synthetic_fixtures"])

    def test_multitenant_customer_model_and_no_automatic_transfer(self):
        self.assertEqual(self.data["tenant_types"], ["personal", "organization"])
        self.assertTrue(self.data["one_identity_multiple_memberships"])
        self.assertEqual(self.data["default_cross_tenant_data_transfer"], "DENY")
        self.assertEqual(self.data["default_external_provider_data_access"], "DENY")

    def test_admin_and_platform_operator_have_no_implicit_case_read(self):
        self.assertEqual(self.data["default_tenant_admin_matter_read"], "DENY")
        self.assertEqual(self.data["default_platform_operator_matter_read"], "DENY")
        self.assertTrue(self.data["matter_acl_required"])
        self.assertTrue(self.data["access_rechecked_on_use"])

    def test_no_training_from_customer_files_by_default(self):
        self.assertEqual(self.data["default_customer_data_ai_training"], "DENY")
        self.assertEqual(self.data["legal_role_assignment"], "PER_PROCESSING_ACTIVITY_REVIEW_REQUIRED")
        self.assertEqual(self.data["legal_entity"], "NOT_IDENTIFIED")

    def test_service_certificate_opinion_unresolved(self):
        self.assertEqual(
            self.data["legal_review"]["decree_356_2025_articles_21_25"],
            "PENDING_WRITTEN_OPINION",
        )
        self.assertEqual(self.data["legal_review"]["customer_dpa"], "NOT_SIGNED")
        self.assertEqual(self.data["legal_review"]["external_provider"], "NOT_APPROVED")

    def test_other_decision_gates_preserved_as_conditional(self):
        gates = self.data["other_decisions"]
        self.assertEqual([gates[k] for k in ("D03", "D05", "D07")], ["PENDING"] * 3)
        self.assertEqual([gates[k] for k in ("D02", "D04")], ["CONDITIONAL"] * 2)
        self.assertEqual(gates["D06"], "SEPARATE_BUDGET_DECISION")
        self.assertEqual(gates["D08"], "ONLY_IF_EXTERNAL_DMS_ENABLED")

    def test_no_false_qa_pass_or_private_srs_publication(self):
        self.assertEqual(self.data["real_postgres_rls_test"], "NOT_RUN")
        self.assertEqual(self.data["real_identity_session_e2e"], "NOT_RUN")
        self.assertEqual(self.data["full_tc12_ab"], "NOT_RUN")
        self.assertFalse(self.data["srs_modified"])
        self.assertNotIn("private_srs_text", self.data)
        self.assertEqual(self.data["privacy_classification"], "PUBLIC_SAFE_DECISION_METADATA")

    def test_pcs_register_approved_policy_not_product_acceptance(self):
        state = json.loads(STATE.read_text(encoding="utf-8"))
        decisions = [d for d in state["state"]["decisions"] if d["id"] == "DEC-011"]
        self.assertEqual(len(decisions), 1)
        self.assertIn("D01", decisions[0]["topic"])
        self.assertEqual(state["state"]["current"]["active_task"], "AL-D01-GOV-001")
        task = next(t for t in state["state"]["tasks"] if t["id"] == "AL-D01-GOV-001")
        self.assertEqual(task["status"], "POLICY_RECORDED")
        self.assertEqual(task["owner_acceptance"], "APPROVED_POLICY_ONLY")


if __name__ == "__main__":
    unittest.main()
