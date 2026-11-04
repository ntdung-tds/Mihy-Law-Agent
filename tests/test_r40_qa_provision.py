"""R40 QA manifest/credential generation nonproduction regression.

Actual two-installation PostgreSQL16 provisioning, authenticated browser/API
and persistence across compose down/up are tested in standalone-qa CI job.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import stat
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from tools.r40_qa_provision import (
    _read_manifest, _private_file, _validated_bundle,
    build_sql, initialize_credentials, save_sql,
)


class R40QaProvisionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = _read_manifest()

    def test_all_nine_standalone_scenarios_and_cross_installation(self):
        accounts = self.manifest["accounts"]
        self.assertEqual(len(accounts), 10)
        ids = {a["id"] for a in accounts}
        self.assertEqual(ids, {f"QA-{i:02d}" for i in range(1, 11)})
        self.assertTrue(all(a["email"].endswith("@ai-law.invalid") for a in accounts))
        self.assertEqual(len({a["user_id"] for a in accounts}), 10)
        self.assertEqual(len([a for a in accounts
                              if a["installation"]=="primary"]), 9)
        self.assertEqual(len([a for a in accounts
                              if a["installation"]=="secondary"]), 1)
        self.assertEqual(self.manifest["saas_ra01"], "DEFERRED_BY_OWNER")
        cases = set().union(*(set(a["ra_cases"]) for a in accounts))
        self.assertTrue({f"RA-{i:02d}" for i in range(2, 10)} <= cases)
        by_id = {a["id"]: a for a in accounts}
        self.assertEqual(len(by_id["QA-02"]["memberships"]),2)
        self.assertEqual(len({m["tenant_id"] for m in by_id["QA-02"]["memberships"]}),2)
        self.assertEqual(by_id["QA-03"]["memberships"][0]["role_key"], "tenant_admin")
        self.assertEqual(by_id["QA-07"]["status"], "disabled")
        self.assertTrue(any(m["status"]=="revoked"
                            for m in by_id["QA-06"]["memberships"]))
        self.assertEqual(self.manifest["roles_approved_existing"],
                         ["lawyer", "tenant_admin"])
        cases_by_run={m["run_id"]:m for m in self.manifest["synthetic_matters"]
                      if m["tenant_id"] == "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}
        self.assertEqual(cases_by_run["fixture-run"]["grants"],
                         ["QA-04","QA-02","QA-08"])
        self.assertEqual(cases_by_run["qa-run-second"]["grants"],["QA-04"])

    def test_credentials_once_and_stable_idempotent_private_sql(self):
        with TemporaryDirectory() as path:
            home=Path(path)
            creds=home/"qa-credentials.json"
            self.assertEqual(initialize_credentials(creds),10)
            self.assertEqual(stat.S_IMODE(creds.stat().st_mode),0o600)
            with self.assertRaises(FileExistsError):
                initialize_credentials(creds)
            manifest=_read_manifest()
            accounts,sha = _validated_bundle(creds,manifest)
            self.assertEqual(len(accounts),10)
            self.assertEqual(len(sha),64)
            text_a=build_sql("primary",creds)
            text_b=build_sql("secondary",creds)
            self.assertEqual(text_a.count(
                "INSERT INTO ai_law_nonprod.password_accounts"),9)
            self.assertEqual(text_b.count(
                "INSERT INTO ai_law_nonprod.password_accounts"),1)
            for row in accounts.values():
                self.assertNotIn(row["password"],text_a)
                self.assertNotIn(row["password"],text_b)
            self.assertIn("BEGIN;",text_a)
            self.assertIn("COMMIT;",text_a)
            self.assertIn("ON CONFLICT DO NOTHING",text_a)
            self.assertIn("refusing implicit rotation",text_a)
            self.assertIn("'disabled'",text_a)
            self.assertIn("'revoked'",text_a)
            self.assertIn("'tenant_admin'",text_a)
            self.assertIn("qa-run-second",text_a)
            file=home/"qa-primary.sql"
            save_sql(file,text_a)
            save_sql(file,text_a)
            self.assertEqual(file.read_text(),text_a)
            self.assertEqual(stat.S_IMODE(file.stat().st_mode),0o600)
            with self.assertRaises(FileExistsError):
                save_sql(file,text_b)

    def test_corrupt_private_password_or_permissions_fail_closed(self):
        with TemporaryDirectory() as path:
            home=Path(path)
            secret=home/"private.json"
            initialize_credentials(secret)
            secret.chmod(0o644)
            with self.assertRaises(PermissionError):
                _private_file(secret)
            secret.chmod(0o600)
            data=json.loads(secret.read_text())
            data["accounts"]["QA-01"]["password"]="not-the-issued-password-r40"
            secret.write_text(json.dumps(data))
            with self.assertRaises(ValueError):
                build_sql("primary",secret)
            with self.assertRaises(ValueError):
                build_sql("unknown-installation",secret)

    def test_no_secrets_or_provisioning_in_git_manifest(self):
        data=self.manifest
        self.assertIn("credentials_policy",data)
        self.assertNotIn("password",data["accounts"][0])
        self.assertNotIn("password_hash",data["accounts"][0])
        self.assertFalse(any("production" == a["installation"]
                             for a in data["accounts"]))

    def test_source_directory_refuses_private_files(self):
        from tools.r40_qa_provision import ROOT
        with self.assertRaises(ValueError):
            initialize_credentials(ROOT/"qa-should-never-be-written.json")
        with self.assertRaises(ValueError):
            save_sql(ROOT/"qa-should-never-be-written.sql","BEGIN; COMMIT;")


if __name__ == "__main__":
    unittest.main()
