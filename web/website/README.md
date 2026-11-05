# Mihy Law AI Agent Web — public website + private R0 workspace

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

`node tools/build_cf_site.mjs /tmp/ai-law-web-build`: generates 13 ESM modules from canonical source (no duplicated content). Cloudflare upload metadata: `main_module:"site_worker.mjs"`, `compatibility_date:"2026-11-04"`, `bindings:[{type:"service",name:"QA_AUTH",service:"ai-law-standalone-cf-qa"}]`. Upload all generated modules. DO NOT upload any actual QA password, secrets or real legal files. Dedicated test: `node --test deployment/cloudflare/tests/site_worker.test.mjs`, then Cloudflare HTTPS Chromium job `cloudflare-site-live` covering 320/390/430/1440px on staging and main Worker. Legacy redirects tested separately.

## Security/product gate

All customer legal content, file upload/download, Google Drive OAuth, legal AI UC, approved production IdP/MFA and final TC12/security evidence are **not implemented or not approved**. Existing R46 QA matter metadata can be used only with synthetic labels. Product SRS v1.1.15 remains private and unchanged. R41 standalone server kit retained. Owner decides final acceptance; current site is QA not public production legal processing.

## R48 — customer-value copy and mobile visual remediation

The public homepage at `ai-law-web` now introduces expected lawyer benefits instead of QA milestones or login mechanics. It specifically speaks to reducing repetitive work, making dossiers easier to navigate, preparing documents more systematically, researching related legal sources and protecting time for professional judgment. These are **product goals**; the footer states this trial must not receive real client records, while `/login` still shows the QA gate. No unsupported conversion/savings statistics or claims that legal AI UCs are fully active. Layout corrects the old `min-width:390px` for a 320px viewport and constrains the mobile CTA/headline and illustrative cards. Run `node --test deployment/cloudflare/tests/site_benefits.test.mjs` and real HTTPS Chromium `python deployment/cloudflare/tests/live_ai_law_mobile_benefits.py` for staging and primary host. The test checks actual glyph/element boxes, not just scrollbars, at 11 viewport widths from 320 to 1440px. Owner visual sign-off remains pending. Changes must remain in public HTML/CSS; protected workspace, API, R44 login and SRS unchanged.

## R49 — two Mihy Agent delivery options on public homepage

The homepage now prominently introduces **two distinct ways to obtain AI Law** directly after the hero and before the feature groups:

1. **Mihy Agent private/customer-managed deployment.** Mihy Agent provides and helps implement the solution on an agreed environment. Customers manage their users, infrastructure and data, choose AI and storage providers as appropriate, and pay AI usage fees to those providers according to their terms. Consulting/implementation/support fees are scoped separately; no fixed package prices or unverified production guarantees.
2. **AI Law as a Mihy Agent-operated subscription service (future).** The proposed service would provide customer accounts and clearly defined subscription tiers/usage limits without customers deploying the system themselves. This is explicitly **under development, not available to purchase, with no published prices, quotas or launch dates**. The previous Owner decision to prioritize standalone/on-premise delivery and defer hosted SaaS implementation remains unchanged.

Main public anchors: `#solutions`, `#faq-deployment`, `#faq-saas`; header/mobile navigation and footer point to the new section. Customer-specific `/login`, protected `/app`, Worker API, Cloudflare `QA_AUTH` service binding, D1 metadata and SRS v1.1.15 are untouched. Product and legal-data release gates remain unchanged.

Run public contract checks: `node --test deployment/cloudflare/tests/site_benefits.test.mjs`. Real Cloudflare Chromium regression: `python deployment/cloudflare/tests/live_ai_law_mobile_benefits.py` on staging and `AI_LAW_WEBSITE_URL=https://ai-law-web.iaict-platform.workers.dev python deployment/cloudflare/tests/live_ai_law_mobile_benefits.py` on primary. Each tests 11 viewport widths, copy, two cards, direct anchor navigation, and text/element bounds. No real customer data or screenshots in GitHub. Owner final design acceptance remains required before calling it final.

## R50 — Official corrected branding and two immersive, equally prominent landing pages

**Owner name correction:** provider/brand is **Mihy Agent** (never “MihiAgent”); public product name is **Mihy Law AI Agent** (previously “AI Law”). Do not rename technical Cloudflare Workers/URLs, GitHub repository, storage IDs, auth cookies, IAM contracts, APIs or historical SRS references as part of this marketing/visible brand update. Baseline SRS v1.1.15 remains unchanged.

**Public landing pages:**

- `/` — renamed Mihy Law AI Agent main website, with two equally emphasized visual cards and real clickable paths to the long-form offerings.
- `/trien-khai-rieng` — Mihy Agent customer-managed/private deployment, 9 sections (hero, four benefits, delivery philosophy, deployment/storage/AI architecture choices, legal use cases, four implementation steps, buyer-fit comparison, in-depth FAQ, CTA). Customer chooses providers and pays AI consumption per provider; Mihy Agent's consultancy/implementation/support fees are separately scoped. This does not imply automatic source-code ownership or every provider integration is ready.
- `/dich-vu-theo-goi` — Mihy Agent-operated future Mihy Law AI Agent service, 9 sections (hero, four benefits, service philosophy, **illustrative** individual/team/organization tier ideas, legal use cases, four user journey steps, buyer-fit comparison, in-depth FAQ, CTA). Explicit `ĐANG PHÁT TRIỂN` / `chưa mở bán`: no published prices, quotas, signup, payments or launch date. This is a marketing roadmap, **not permission to implement shared SaaS now**.
- `/login`, `/app` — product name updated visibly in public login and protected workspace; same existing real QA authentication, access controls and R46 synthetic matter registry. No new customer access.

**Build:** `node tools/build_cf_site.mjs /tmp/mihy-law-web-build` now packages 13 modules, including `landing_private_html.mjs` and `landing_subscription_html.mjs`. Both public pages use the existing CSP, CSS, JS, response headers and Worker; no independent origin. Preserve service binding `QA_AUTH -> ai-law-standalone-cf-qa`.

**Validation:** `node --test deployment/cloudflare/tests/site_worker.test.mjs deployment/cloudflare/tests/site_benefits.test.mjs deployment/cloudflare/tests/site_landing_pages.test.mjs`. Real Chromium staging/primary home: `deployment/cloudflare/tests/live_ai_law_mobile_benefits.py`; full dual page: `deployment/cloudflare/tests/live_mihy_brand_landings.py`. Both scan 11 widths (320–1440), actual glyph/element clipping and mobile navigation. Production/customer data/IdP/MFA/AI legal workflows remain separately blocked; Owner final visual acceptance is required.
