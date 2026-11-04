# AI Law Web — public website + private R0 workspace (R47)

Primary Cloudflare Worker: `ai-law-web`; current **NONPRODUCTION QA** URL: https://ai-law-web.iaict-platform.workers.dev/

## Routes

- `/` public Vietnamese marketing homepage with header, visual product mockup, product introduction, three SRS feature groups, roadmap and accurate QA labels, workflow/security sections, FAQ and footer.
- `/login` public login page, submitting to the existing isolated R44 identity service via the same origin. No password is stored in the page or browser localStorage.
- `/app` authenticated R0 workspace preserved from `web/r0-preview/`; requires D1-backed session and membership validation via private `QA_AUTH` Worker Service Binding. Anonymous visits redirect to `/login`; workspace styles/scripts are private (401).
- `/api/qa/login|session|logout|matters` same-origin passthrough to `ai-law-standalone-cf-qa`, POST CSRF Origin checked; QA matter API performs real D1/MatterACL authorization independently.
- `/site.css`, `/site.js`, `/site-login.js`, `/favicon.svg` publicly accessible assets, no credentials.
- `/health` public QA health state; never claims legal AI production readiness.
- Legacy `ai-law-r0-preview` Worker is redirect-only, with no backend binding, no API forwarding.

## Build and test

`node tools/build_cf_site.mjs /tmp/ai-law-web-build`: generates 11 ESM modules from canonical source (no duplicated content). Cloudflare upload metadata: `main_module:"site_worker.mjs"`, `compatibility_date:"2026-11-04"`, `bindings:[{type:"service",name:"QA_AUTH",service:"ai-law-standalone-cf-qa"}]`. Upload all generated modules. DO NOT upload any actual QA password, secrets or real legal files. Dedicated test: `node --test deployment/cloudflare/tests/site_worker.test.mjs`, then Cloudflare HTTPS Chromium job `cloudflare-site-live` covering 320/390/430/1440px on staging and main Worker. Legacy redirects tested separately.

## Security/product gate

All customer legal content, file upload/download, Google Drive OAuth, legal AI UC, approved production IdP/MFA and final TC12/security evidence are **not implemented or not approved**. Existing R46 QA matter metadata can be used only with synthetic labels. Product SRS v1.1.15 remains private and unchanged. R41 standalone server kit retained. Owner decides final acceptance; current site is QA not public production legal processing.
