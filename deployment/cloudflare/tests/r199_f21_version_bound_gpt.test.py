"""R199: F21 persisted version must be positive; synthetic source contract only."""
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "src" / "f21_approval_transition_gpt.mjs").read_text()
SCHEMA = (ROOT / "migrations" / "r187_f21_approval_gpt.sql").read_text()

class PersistedVersionContract(unittest.TestCase):
    def test_sqlite_schema_requires_positive_version(self):
        self.assertRegex(SCHEMA, r"version INTEGER NOT NULL DEFAULT 1 CHECK\(version>=1\)")

    def test_transition_rejects_zero_and_negative_version(self):
        self.assertRegex(SOURCE, r"Number\.isSafeInteger\(c\.outputVersion\)")
        self.assertRegex(SOURCE, r"c\.outputVersion\s*<\s*1\s*\|\|")
        self.assertNotRegex(SOURCE, r"c\.outputVersion\s*<\s*0\s*\|\|")

if __name__ == "__main__":
    unittest.main()
