# R31 — Standalone synthetic customer demonstration

**Independent of the approved R25 UI preview.** Isolated nonproduction readback verified at https://ai-law-r31-demo.iaict-platform.workers.dev/ on 2026-11-04. Chromium loaded five roles and two initial synthetic document cards at 320px; full persona-click/revocation/modal E2E and desktop viewport validation remain NOT_RUN/partial. Contains only HTML, CSS, JavaScript and local demo JSON. No login, cookies, account registration, external AI API, file upload, persistence or real customer data.

Run locally from repository root:

    python -m http.server 8767 --directory web/r0-demo

The five scenario buttons exercise synthetic personas: one user in two tenants; an organization lawyer with explicit MatterACL, a tenant admin without automatic case read and an outsider without membership. Selecting a scenario resets search/previous document options. "Thử xem hồ sơ tenant khác" and "Thu hồi quyền" are clearly labeled UI simulations; the fixture JSON is public and is **not a security boundary**. Real PostgreSQL RLS assertion coverage lives in CI, not in this page.

Tests require:
- A byte-equivalent JSON fixture in demo/customers.json and web/r0-demo/customers.json.
- Node JavaScript syntax check and Python fixture/static checks.
- Real browser checks at 320px, 390px and 1280px before a nonproduction demo is considered accepted.

No R0 legal AI functions are operational in this showcase. Preserve private SRS v1.1.15, R20 snapshot and R25 preview and do not deploy this to production. See release/README.md for productization prerequisites.
