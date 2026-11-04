"""R41 browser E2E for the local-only reusable QA staging kit.

Credentials are read only from the operator's chmod0600 file supplied as
argv. Playwright never records screenshots, traces, videos or private tokens.
Browser is Chromium at desktop/mobile viewport sizes, not a physical phone.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

from playwright.sync_api import expect, sync_playwright
from test_r39_browser_e2e import ready, test_case

A = "http://127.0.0.1:18080"
B = "http://127.0.0.1:18081"
ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
PERSONAL_QA02 = "f2222222-2222-4222-8222-222222222222"
ORG_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"


def negative_case(browser, origin, account, tenant, *, width, label):
    ctx = browser.new_context(
        viewport={"width":width,"height":840},
        is_mobile=width<=390,has_touch=width<=390,
    )
    try:
        page = ctx.new_page()
        page.goto(origin,wait_until="domcontentloaded")
        expect(page.locator("#login-workspace option")).to_have_count(
            7 if origin==A else 2, timeout=12000,
        )
        page.locator("#login-email").fill(account["email"])
        page.locator("#login-password").fill(account["password"])
        page.locator("#login-workspace").select_option(tenant)
        page.locator("#login-submit").click()
        expect(page.locator("#login-error")).to_be_visible(timeout=12000)
        expect(page.locator("#dashboard")).to_be_hidden()
        assert page.evaluate("() => localStorage.length") == 0
        print(f"PASS R41 browser denied {label} width={width}")
    finally:
        ctx.close()


def main():
    from tools.r40_qa_provision import (
        _read_manifest, _validated_bundle,
    )
    creds,_ = _validated_bundle(Path(sys.argv[1]), _read_manifest())
    ready(A)
    ready(B)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            # Same issued private credential file for both installations.
            test_case(
                browser,A,creds["QA-04"],ORG_A,width=1440,
                permitted=True,expected_workspaces=6,label="R41-qa04-lawyer",
            )
            test_case(
                browser,A,creds["QA-02"],PERSONAL_QA02,width=390,
                permitted=True,expected_workspaces=6,label="R41-qa02-personal",
            )
            test_case(
                browser,A,creds["QA-03"],ORG_A,width=320,
                permitted=False,expected_workspaces=6,label="R41-qa03-admin-no-acl",
            )
            test_case(
                browser,A,creds["QA-08"],ORG_A,width=390,
                permitted=True,expected_workspaces=6,label="R41-qa08-limited",
            )
            test_case(
                browser,B,creds["QA-10"],ORG_B,width=390,
                permitted=True,expected_workspaces=1,label="R41-qa10-other-install",
            )
            negative_case(
                browser,A,creds["QA-07"],ORG_A,width=320,
                label="R41-qa07-disabled",
            )
            negative_case(
                browser,A,creds["QA-05"],ORG_A,width=390,
                label="R41-qa05-nonmember",
            )
        finally:
            browser.close()
    print("PASS R41: Chromium 1440/390/320 using reusable QA credentials"
          " against local-only auth/API/PostgreSQL16")


if __name__=="__main__":
    main()
