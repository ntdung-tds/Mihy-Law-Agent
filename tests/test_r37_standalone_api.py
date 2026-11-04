"""R37 guardrails for a NONPRODUCTION standalone HTTP fixture application.

These unit tests do not replace real two-instance Docker/PG16 HTTP tests.
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

from r0_core.run_read_wsgi import GetRunWSGI
from r0_core.standalone_fixture_api import create_fixture_app
from tools.r37_fixture_crypto import initialize, mint

ROOT = Path(__file__).resolve().parents[1]


class R37FixtureRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        jwk = jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key(), as_dict=True)
        jwk.update(kid="r37-test-key", use="sig", alg="RS256")
        cls.jwk = jwk
        cls.valid = {
            "AI_LAW_NONPROD_R37": "isolated-fixture-only",
            "AI_LAW_READER_DSN": "postgresql://test-user:synthetic@localhost/synthetic",
            "AI_LAW_TEST_ISSUER": "https://idp.example.invalid",
            "AI_LAW_TEST_AUDIENCE": "ai-law-api",
            "AI_LAW_TEST_JWKS_B64": base64.b64encode(
                json.dumps({"keys": [jwk]}).encode(),
            ).decode(),
        }

    def test_requires_explicit_nonproduction_mode(self):
        with patch.dict(os.environ, {**self.valid, "AI_LAW_NONPROD_R37": "production"}):
            with self.assertRaises(RuntimeError):
                create_fixture_app()
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError):
                create_fixture_app()

    def test_valid_fixture_app_has_one_existing_srs_route(self):
        with patch.dict(os.environ, self.valid):
            app = create_fixture_app()
        self.assertIsInstance(app, GetRunWSGI)
        self.assertTrue(callable(app.load_run_for_scope))
        self.assertEqual(app.expected_audience, "ai-law-api")
        self.assertEqual(app.expected_issuer, "https://idp.example.invalid")

    def test_no_private_key_in_api_jwks(self):
        bad = dict(self.jwk, d="fake-private-d")
        payload = base64.b64encode(json.dumps({"keys": [bad]}).encode()).decode()
        with patch.dict(os.environ, {**self.valid, "AI_LAW_TEST_JWKS_B64": payload}):
            with self.assertRaises(RuntimeError):
                create_fixture_app()

    def test_invalid_config_fails_shut_before_database(self):
        with patch.dict(os.environ, {**self.valid, "AI_LAW_TEST_JWKS_B64": ""}):
            with self.assertRaises(RuntimeError):
                create_fixture_app()
        with patch.dict(os.environ, {**self.valid,
                                     "AI_LAW_TEST_ISSUER": "http://untrusted.invalid"}):
            with self.assertRaises(ValueError):
                create_fixture_app()

    def test_generated_fixture_keeps_private_key_off_installation_env(self):
        with TemporaryDirectory() as tmp:
            directory = Path(tmp)
            initialize(directory)
            env = (directory / "installation.env").read_text()
            self.assertIn("AI_LAW_APP_DB_PASSWORD=", env)
            self.assertIn("AI_LAW_DB_PASSWORD=", env)
            self.assertIn("AI_LAW_TEST_JWKS_B64=", env)
            self.assertNotIn("PRIVATE", env)
            self.assertNotIn("BEGIN", env)
            self.assertTrue((directory / "private.pem").exists())
            # Signature creation is real cryptography, never a fixed token.
            self.assertIsNone(mint(directory, "fixture-sub", "fixture-session"))

    def test_compose_is_only_internal_and_schema_is_not_canonical(self):
        compose = (ROOT / "deployment/standalone/compose.api-test.yaml").read_text()
        reader = (ROOT / "db/standalone/0003_r37_reader.sh").read_text()
        fixture_schema = (ROOT / "db/standalone/0002_r37_nonprod_http_fixtures.sql").read_text()
        self.assertNotIn("ports:", compose)
        self.assertIn("AI_LAW_NONPROD_R37: isolated-fixture-only", compose)
        self.assertIn("NO", reader)  # NOSUPERUSER/NOBYPASSRLS
        self.assertIn("GRANT SELECT ON ALL TABLES", reader)
        self.assertNotIn("GRANT INSERT", reader)
        self.assertNotIn("GRANT UPDATE", reader)
        self.assertIn("FORCE ROW LEVEL SECURITY", fixture_schema)
        self.assertIn("SELECT 1 FROM ai_law.matters", fixture_schema)


if __name__ == "__main__":
    unittest.main()
