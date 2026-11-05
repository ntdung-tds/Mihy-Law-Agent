"""R65 local-only QA operator preflight security tests (synthetic secret strings).
No external traffic or real private R40 bundle in CI.
"""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
FILE = ROOT / "deployment/cloudflare/tools/r65_live_role_e2e.py"
spec = importlib.util.spec_from_file_location("r65_live_role_e2e", FILE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class OperatorPreflightTests(unittest.TestCase):
    def setUp(self):
        self.inv = json.loads(module.INVENTORY.read_text(encoding="utf8"))
        self.bundle = {"schema_version": 1, "accounts": {
            a["id"]: {
                "email": a["email"],
                "password": "private_synthetic_test_only_" + a["id"] * 2,
            } for a in self.inv["accounts"]
        }}

    def write_bundle(self, folder, mode=0o600):
        path = Path(folder) / "private.json"
        path.write_text(json.dumps(self.bundle), encoding="utf8")
        os.chmod(path, mode)
        return path

    def test_complete_bundle_preflight_without_browser_or_live_api(self):
        with tempfile.TemporaryDirectory() as temp:
            path = self.write_bundle(temp)
            actors, credentials = module.read_private_bundle(str(path))
            self.assertEqual(set(module.EXPECTED), {
                a for a in module.EXPECTED if a in actors and a in credentials
            })
            self.assertEqual(module.run([
                "--qa-only", "--preflight", "--bundle", str(path)]), 0)

    def test_requires_private_permissions_and_rejects_symlink(self):
        with tempfile.TemporaryDirectory() as temp:
            path = self.write_bundle(temp, 0o644)
            with self.assertRaises(module.QAGateError):
                module.read_private_bundle(str(path))
            os.chmod(path, 0o600)
            link = Path(temp) / "link.json"
            link.symlink_to(path)
            with self.assertRaises(module.QAGateError):
                module.read_private_bundle(str(link))
            inside_repo_link = Path(temp) / "public_repo"
            inside_repo_link.symlink_to(module.ROOT, target_is_directory=True)
            with self.assertRaises(module.QAGateError) as error:
                module.read_private_bundle(str(inside_repo_link / "tests/acceptance/R40_STANDALONE_QA_INVENTORY.json"))
            self.assertEqual(str(error.exception), "PRIVATE_PATH_REQUIRED")

    def test_rejects_partial_and_wrong_identity_without_disclosing_secret(self):
        with tempfile.TemporaryDirectory() as temp:
            path = self.write_bundle(temp)
            del self.bundle["accounts"]["QA-02"]
            path.write_text(json.dumps(self.bundle), encoding="utf8")
            with self.assertRaises(module.QAGateError) as a:
                module.read_private_bundle(str(path))
            self.assertNotIn("private_synthetic_test_only", str(a.exception))
            self.bundle["accounts"]["QA-02"] = {
                "email": "wrong@ai-law.invalid", "password": "private_synthetic_test_only_QA02"
            }
            path.write_text(json.dumps(self.bundle), encoding="utf8")
            with self.assertRaises(module.QAGateError) as b:
                module.read_private_bundle(str(path))
            self.assertEqual(str(b.exception), "ACTOR_BINDING_MISMATCH")

    def test_requires_explicit_qa_acknowledgement(self):
        with tempfile.TemporaryDirectory() as temp:
            path = self.write_bundle(temp)
            with self.assertRaises(module.QAGateError) as e:
                module.run(["--preflight", "--bundle", str(path)])
            self.assertEqual(str(e.exception), "QA_ONLY_ACK_REQUIRED")

    def test_real_credentials_cannot_run_inside_ci(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temp:
            path = self.write_bundle(temp)
            with patch.dict(os.environ, {"CI": "true"}):
                with self.assertRaises(module.QAGateError) as error:
                    module.run(["--qa-only", "--bundle", str(path)])
                self.assertEqual(str(error.exception), "LIVE_QA_ROLE_TEST_FORBIDDEN_IN_CI")
                self.assertEqual(module.run([
                    "--qa-only", "--preflight", "--bundle", str(path)]), 0)

    def test_revoked_membership_path_is_an_explicit_live_assertion(self):
        src = FILE.read_text(encoding="utf8")
        self.assertIn('actor_id == "QA-06"', src)
        self.assertIn('"REVOKED_MEMBERSHIP_ALLOWED"', src)
        self.assertIn('"REVOKED_SWITCH_ROTATED_SID"', src)

    def test_live_target_is_fixed_and_secret_source_is_not_repo(self):
        self.assertEqual(module.QA_URL,
                         "https://ai-law-web-qa.iaict-platform.workers.dev")
        self.assertTrue(module.ROOT in module.INVENTORY.parents)
        src = FILE.read_text(encoding="utf8")
        self.assertIn("R65 authorised QA-only live role/browser checks", src)
        self.assertNotIn("https://ai-law-web.iaict-platform.workers.dev", src)
        self.assertIn("get_sid(context) == old_sid", src)


if __name__ == "__main__":
    unittest.main()
