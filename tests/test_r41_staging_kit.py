"""R41 private QA bootstrap safety regression (unit).

Docker/PostgreSQL16/Chromium integration lives in smoke_staging_kit.sh
and runs on a disposable CI host; a real permanent staging host is NOT
provisioned by merely passing these unit/integration tests.
"""
from __future__ import annotations

import os
from pathlib import Path
import stat
from tempfile import TemporaryDirectory
import unittest

from tools.r40_qa_provision import initialize_credentials, ROOT
from tools.r41_staging_config import initialize, preflight, _read_env


class QAStagingKitTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        os.chmod(self.base,0o700)
        self.bundle = self.base/"saved-private-qa.json"
        initialize_credentials(self.bundle)

    def test_primary_and_independent_secondary_secrets_persist(self):
        a=self.base/"primary"
        b=self.base/"secondary"
        one=initialize("primary",a,self.bundle)
        other=initialize("secondary",b,self.bundle)
        self.assertEqual(one["qa_accounts"],9)
        self.assertEqual(one["workspaces"],6)
        self.assertEqual(other["qa_accounts"],1)
        self.assertEqual(other["workspaces"],1)
        self.assertEqual(one["port"],18080)
        self.assertEqual(other["port"],18081)
        self.assertTrue(preflight("primary",a,self.bundle)["validated"])
        self.assertTrue(preflight("secondary",b,self.bundle)["validated"])
        ia=_read_env(a/"installation.env")
        ib=_read_env(b/"installation.env")
        self.assertNotEqual(ia["AI_LAW_TEST_JWKS_B64"],
                            ib["AI_LAW_TEST_JWKS_B64"])
        self.assertNotEqual(ia["AI_LAW_DB_PASSWORD"],
                            ib["AI_LAW_DB_PASSWORD"])
        self.assertEqual(stat.S_IMODE((a/"installation.env").stat().st_mode),0o600)
        self.assertEqual(stat.S_IMODE(a.stat().st_mode),0o700)
        original=(a/"installation.env").read_bytes()
        with self.assertRaises(FileExistsError):
            initialize("primary",a,self.bundle)
        self.assertEqual((a/"installation.env").read_bytes(),original)

    def test_wrong_profile_host_origin_or_auth_key_is_rejected(self):
        p=self.base/"primary"
        initialize("primary",p,self.bundle)
        env=p/"installation.env"
        raw=env.read_text()
        env.write_text(raw.replace("http://127.0.0.1:18080",
                                   "http://0.0.0.0:18080"))
        with self.assertRaises(ValueError):
            preflight("primary",p,self.bundle)
        env.write_text(raw.replace("AI_LAW_TEST_KEY_KID=r41-",
                                   "AI_LAW_TEST_KEY_KID=other-"))
        with self.assertRaises(ValueError):
            preflight("primary",p,self.bundle)
        env.write_text(raw)
        with self.assertRaises(ValueError):
            preflight("secondary",p,self.bundle)

    def test_private_file_permission_or_symlink_denied(self):
        p=self.base/"primary"
        initialize("primary",p,self.bundle)
        env=p/"installation.env"
        env.chmod(0o644)
        with self.assertRaises(PermissionError):
            preflight("primary",p,self.bundle)
        env.chmod(0o600)
        link=self.base/"qa-link.json"
        link.symlink_to(self.bundle)
        with self.assertRaises(ValueError):
            preflight("primary",p,link)

    def test_reject_secrets_under_git_checkout(self):
        with self.assertRaises(ValueError):
            initialize("primary",ROOT/"DO_NOT_CREATE_QA",self.bundle)

    def test_missing_bundle_does_not_create_installation(self):
        p=self.base/"primary"
        with self.assertRaises(FileNotFoundError):
            initialize("primary",p,self.base/"missing.json")
        self.assertFalse(p.exists())


if __name__=="__main__":
    unittest.main()
