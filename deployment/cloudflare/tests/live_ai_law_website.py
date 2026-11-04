"""R47 real HTTPS browser QA: public homepage, login, protected workspace, mobile layout.
Does not use user credentials or save screenshots to GitHub.
"""
from playwright.sync_api import sync_playwright
BASE="https://ai-law-web-qa.iaict-platform.workers.dev"
def run():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        for width in (320,390,430,1440):
            context=browser.new_context(viewport={"width":width,"height":850},device_scale_factor=1)
            page=context.new_page()
            errors=[]
            page.on("pageerror",lambda e:errors.append(str(e)))
            result=page.goto(BASE+"/",wait_until="domcontentloaded",timeout=30000)
            assert result.status==200,("home",width,result.status)
            page.locator("#hero-title").wait_for()
            assert page.locator(".site-header").is_visible()
            assert page.locator(".site-footer").count()==1
            assert page.locator(".feature-card").count()==3
            assert page.locator("a[href='/login']").count()>=2
            overflow=page.evaluate("document.documentElement.scrollWidth-innerWidth")
            assert overflow<=3,("home overflow",width,overflow)
            if width<=970:
                button=page.locator("#menu-toggle")
                assert button.is_visible()
                button.click()
                assert page.locator("#mobile-menu").is_visible()
                page.locator("#mobile-menu a[href='#features']").click()
                assert page.locator("#mobile-menu").is_hidden()
            else:
                assert page.locator(".desktop-nav").is_visible()
            page.goto(BASE+"/login",wait_until="domcontentloaded",timeout=30000)
            page.locator("#login-form").wait_for()
            assert page.locator("#email").is_visible()
            assert page.locator("#password").is_visible()
            overflow=page.evaluate("document.documentElement.scrollWidth-innerWidth")
            assert overflow<=3,("login overflow",width,overflow)
            page.goto(BASE+"/app",wait_until="domcontentloaded",timeout=30000)
            page.locator("#login-form").wait_for()
            assert "/login" in page.url,("workspace access bypass",width,page.url)
            assert not errors,("JS errors",width,errors)
            context.close()
            print("PASS public home + menu + login + private app",width,flush=True)
        browser.close()
if __name__=="__main__":run()
