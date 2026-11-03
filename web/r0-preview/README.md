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