# AI Law R0 — responsive UI preview (single front-end slice)

A **presentation-only, interactive** mobile-first static UI for the R0 app shell, built without new runtime dependencies. It is intentionally separate from the paused POC1 Python runtime. It is **not** an authenticated application or a legal-advice, AI or DOCX processing service.

## Run locally

```bash
python -m http.server 8765 --directory web/r0-preview
# Open http://127.0.0.1:8765/
```

## Current scope

- Responsive layout: desktop navigation, phone bottom navigation, safe-area, four views (overview, documents, AI assistant, legal research).
- Purely synthetic document metadata and user interactions: navigation, filters, search, document-detail modal, sample prompts, and file-selection notice (filename only).
- **Eleven-workflow discovery catalog (R24):** The Overview presents all 11 legal work items grouped as A (document drafting/review/translation/grammar), B (summaries/analysis/multiple-file dossiers), and C (legal Q&A/judgments/rules/statutory comparison). Only UC03 translation, UC04 summary, and UC07 grammar correction are labeled **R0 · Đang triển khai**; the other eight are **R1 · Sắp triển khai**. These are **status/info-only tiles**, not callable legal services: clicking one explains that the operation is unavailable. No client data is processed.

- **Flat block refinement (R25):** The same 11 entries remain in A/B/C groups, now with distinct flat section surfaces, clear borders, restrained colors, stable hover/focus states and an R0 left-edge accent. All 11 information-only tiles now bind the existing availability modal correctly; this fixes a single-element event-registration regression. No legal task executes and no new route/backend/API was introduced.
- Honest empty/placeholder states: no simulated legal answer, fabricated citations or backend success.
- No content/credentials/real customer data. No persistence, API, file upload or external model invocation. Font stylesheet may be fetched from Google Fonts; system-font fallback is built in.
- Keyboard shortcuts: Ctrl/⌘+K for document search, Esc to close dialogs.
- Accessibility: semantic controls, labeled inputs, responsive/reduced-motion styles, dialog focus handling.

## Next stage (not yet included)

- Authorization and tenant boundary, protected document storage, actual APIs, document processing, AI and verified citations are outside this visual shell task and require separate SRS-mapped implementation and security tests.
- Before actual end-user use, complete the missing authentic Word Desktop and authenticated application gates as required. No automatic POC1 acceptance or production release.

## Test approach

- `node --check web/r0-preview/app.js` for syntax.
- `python -m unittest tests.test_r0_preview -v` for static contract checks.
- Actual browser UX checks on narrow mobile and desktop viewports, interactions, console and layout overflow. They are only visual-shell E2E, not SRS workflow E2E.
## R45 — QA login on the original R0 preview URL

At Cloudflare the R0 preview uses `deployment/cloudflare/src/r0_preview_worker.mjs`. Its internal `QA_AUTH` Service Binding points at the existing R44 `ai-law-standalone-cf-qa` Worker. The preview has no passwords, OAuth credentials, D1 bindings or customer files. Its authenticated R0 shell remains synthetic (11 UCs are status-only). `/api/qa/login`, `/api/qa/session`, and `/api/qa/logout` are same-origin routes, forwarded only to the R44 QA backend. Anonymous `/#documents` requests show the login first. The original bottom mobile navigation is replaced by a right-side rail/drawer.

To assemble deployable JavaScript module parts from canonical UI files: `node tools/build_cf_r0_preview.mjs /tmp/ai-law-r0-preview-build`. Cloudflare multipart upload metadata: `main_module: "r0_preview_worker.mjs"`, `bindings: [{type:"service",name:"QA_AUTH",service:"ai-law-standalone-cf-qa"}]`. Upload all seven generated modules. Keep the Worker nonproduction. Avoid uploading or printing private credentials. Test: `node --test deployment/cloudflare/tests/preview_worker.test.mjs`. Full live phone positive login remains an Owner acceptance gate. Do not infer that the SRS legal features are connected.
