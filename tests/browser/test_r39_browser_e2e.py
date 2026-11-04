"""R39 real Chromium browser E2E against disposable dual Docker installations.

Only synthetic .invalid accounts from private temp CI files. No screenshots,
videos, tracing or credentials are uploaded to this PUBLIC GitHub repo.
This proves one existing SRS GET TaskRun fixture + authentication UI, not
complete legal AI workflows or accepted production/mobile-device behavior.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys
from urllib.error import URLError
from urllib.request import urlopen
import time

from playwright.sync_api import expect, sync_playwright

A = "http://127.0.0.1:18080"
B = "http://127.0.0.1:18081"
ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
PERSONAL = "ffffffff-ffff-4fff-8fff-ffffffffffff"


def ready(url):
    for _ in range(40):
        try:
            with urlopen(url, timeout=2) as res:
                if res.status == 200:
                    return
        except (URLError, OSError, TimeoutError):
            pass
        time.sleep(.4)
    raise AssertionError("R39 loopback gateway did not become reachable")


def viewport_safe(page, width):
    measured = page.evaluate("""() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        button: document.querySelector('#login-submit').getBoundingClientRect().height,
        font: parseFloat(getComputedStyle(document.querySelector('#login-email')).fontSize)
    })""")
    assert measured["scroll"] <= measured["client"] + 1, (width, measured)
    assert measured["button"] >= 44, (width, measured)
    assert measured["font"] >= 14, (width, measured)


def login(page, account, tenant):
    page.locator("#login-email").fill(account["email"])
    page.locator("#login-password").fill(account["password"])
    page.locator("#login-workspace").select_option(tenant)
    page.locator("#login-submit").click()
    expect(page.locator("#dashboard")).to_be_visible(timeout=12000)
    expect(page.locator("#account-name")).to_have_text(account["email"])
    expect(page.locator("#login-screen")).to_be_hidden()


def run_check(page, permitted):
    page.locator("#run-check").click()
    if permitted:
        expect(page.locator("#run-result")).to_contain_text(
            "Đã kết nối API", timeout=12000)
        expect(page.locator("#run-result")).to_contain_text("fixture-run")
    else:
        expect(page.locator("#run-result")).to_contain_text(
            "chưa được cấp quyền", timeout=12000)


def test_case(browser, origin, account, tenant, *,
              width, permitted, expected_workspaces, label):
    ctx = browser.new_context(viewport={"width":width,"height":860},
                              device_scale_factor=1,
                              has_touch=width<=390,
                              is_mobile=width<=390)
    page = ctx.new_page()
    exceptions = []
    page.on("pageerror", lambda e: exceptions.append(str(e)))
    try:
        page.goto(origin, wait_until="domcontentloaded", timeout=30000)
        expect(page.locator("#login-screen")).to_be_visible()
        expect(page.locator("#login-workspace option")).to_have_count(
            expected_workspaces+1, timeout=12000)
        viewport_safe(page,width)
        login(page, account, tenant)
        assert not exceptions, (label, exceptions)
        cookie_names = [c for c in ctx.cookies() if c["name"].startswith("al_r39_")]
        assert len(cookie_names) == 1, (label, cookie_names)
        assert cookie_names[0]["httpOnly"] and cookie_names[0]["sameSite"] == "Strict"
        assert len(cookie_names[0]["value"]) < 100  # Opaque, never signed JWT.
        assert page.evaluate("() => localStorage.length") == 0
        run_check(page,permitted)
        page.reload(wait_until="domcontentloaded")
        expect(page.locator("#dashboard")).to_be_visible(timeout=12000)
        run_check(page,permitted)
        # State-changing calls reject cross-origin browser requests.
        bad = ctx.request.post(origin+"/api/logout",
            data="{}", headers={"Content-Type":"application/json",
                                 "Origin":"http://malicious.example.invalid"})
        assert bad.status == 403, (label,"csrf",bad.status)
        # It must not sign out the legitimate session.
        run_check(page,permitted)
        page.locator("#logout").click()
        expect(page.locator("#login-screen")).to_be_visible(timeout=12000)
        after = ctx.request.get(origin+"/api/session")
        assert after.status == 401, (label,"logout",after.status)
        assert not exceptions, (label,exceptions)
        print(f"PASS R39 browser {label} width={width} actual login/reload/MatterACL/logout/CSRF")
    finally:
        ctx.close()


def main():
    accounts_a = json.loads(Path(sys.argv[1]).read_text())
    accounts_b = json.loads(Path(sys.argv[2]).read_text())
    ready(A); ready(B)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            # Desktop authorized organization lawyer can read SQL-backed run.
            test_case(browser,A,accounts_a["iaict-lawyer"],ORG_A,width=1440,
                      permitted=True,expected_workspaces=2,label="org-lawyer")
            # Same real identity chooses personal context; org run blocked.
            test_case(browser,A,accounts_a["iaict-lawyer"],PERSONAL,width=390,
                      permitted=False,expected_workspaces=2,label="personal-context")
            # Organization admin login works; reading legal matter denied.
            test_case(browser,A,accounts_a["iaict-admin"],ORG_A,width=320,
                      permitted=False,expected_workspaces=2,label="org-admin")
            # Second completely separate organization/server installation.
            test_case(browser,B,accounts_b["other-lawyer"],ORG_B,width=390,
                      permitted=True,expected_workspaces=1,label="other-install")
            # Wrong password shows generic UI error, never dashboard.
            ctx=browser.new_context(viewport={"width":390,"height":800})
            pg=ctx.new_page()
            try:
                pg.goto(A,wait_until="domcontentloaded")
                expect(pg.locator("#login-workspace option")).to_have_count(
                    3,timeout=12000)
                pg.locator("#login-email").fill(accounts_a["iaict-lawyer"]["email"])
                pg.locator("#login-password").fill("wrong-password-test-r39")
                pg.locator("#login-workspace").select_option(ORG_A)
                pg.locator("#login-submit").click()
                expect(pg.locator("#login-error")).to_be_visible(timeout=12000)
                expect(pg.locator("#dashboard")).to_be_hidden()
                assert pg.evaluate("() => localStorage.length") == 0
                print("PASS R39 browser wrong password/denied dashboard")
            finally:
                ctx.close()
        finally:
            browser.close()
    print("PASS R39: real Chromium 1440/390/320 browser login + signed PostgreSQL API authorization")


if __name__ == "__main__":
    main()
