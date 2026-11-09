"""R127: unreachable live QA must not be counted as a successful security gate."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

PATH = Path(__file__).resolve().parents[1] / "deployment/cloudflare/tests/r123_live_auth_denials_gpt.py"
spec = importlib.util.spec_from_file_location("r123_live_gate", PATH)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

class LiveQaFailClosedTests(unittest.TestCase):
    def test_all_network_failures_exit_nonzero(self):
        with patch.object(gate, "probe", return_value=(None, "", "")):
            self.assertNotEqual(gate.main(), 0)

    def test_all_429_rate_limits_exit_nonzero(self):
        with patch.object(gate, "probe", return_value=(429, "", "")):
            self.assertNotEqual(gate.main(), 0)

    def test_expected_denial_is_success(self):
        with patch.object(gate, "probe", return_value=(401, "", "")):
            result = gate.case("denied", "/api/qa/matters", 401)
            self.assertEqual(result["result"], "PASS")

if __name__ == "__main__":
    unittest.main()
