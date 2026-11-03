# POC1 / AL-POC1-002 — Microsoft Word acceptance gate

**Scope:** One synthetic DOCX tracked replacement only. This is a QA procedure, not evidence that a real Word UI test has been run. SRS: `v1.1.15`, `POC/POC_PROTOCOL.md`; application test IDs `TC02C`, `TC07C`, `TCE2E-02` are **separate** and remain NOT_RUN until an application flow exists.

1. In **Microsoft Word desktop**, open the synthetic `tracked.docx` (never a client/legal document). Use **Review → All Markup** and inspect the deletion and insertion. Capture a screenshot with reviewer name, Word version/build, date and `test_run_id` recorded outside the public repository.
2. **Save As** `accepted.docx` and `rejected.docx` as two independent copies of the tracked input. In `accepted.docx`, choose **Review → Accept → Accept All Changes**, save and reopen. In `rejected.docx`, choose **Review → Reject → Reject All Changes**, save and reopen. Do not perform both steps on the same copy. Capture screenshots of the text, header/footer, table and numbered list.
3. Run offline content checks (after installing `requirements-dev.txt`):

   ```bash
   python -m tools.verify_word_review tracked.docx accepted.docx rejected.docx edit.json --report word_review_static_report.json
   ```

4. The script checks source revisions, final content for both outcomes, unresolved revisions, non-target paragraph text, table cell skeleton, paragraph numbering/style, header/footer text and SHA-256. A result of `STATIC_PASS` is **not** a Microsoft Word UI pass. Save screenshots and human approval in the authorized Drive test-run folder (not Public GitHub). Record `WORD_UI_PASS` only after independent inspection.
5. Keep POC1 status **BLOCKED / not Owner accepted** until a real Word UI test satisfies the POC protocol, and separate `TC02C`, `TC07C`, `TCE2E-02` application flows are tested. Do not claim the offline simulated Accept/Reject unit tests prove Word behavior.

If Word silently alters formatting, numbering or fields, mark `FAIL` and preserve the original inputs and evidence; do not override the validator result. Never publish actual legal/customer documents or screenshots to the public repository.

## Two-round QA hardening (2026-11-03)

The offline verifier now **fails closed** for unexpected paragraph/run formatting, non-text markers (tabs, breaks, drawings, bookmarks, hyperlinks), style/numbering/font/theme definitions, relationships, media and known story text. XML indentation-only reserialization is ignored; splitting adjacent runs with unchanged formatting does not change the semantic signature.

Strict validation may flag benign Word reserialization for manual review. This is never proof that Microsoft Word UI was used: retain original Word-saved files, screenshots, reviewer, Word version, and `test_run_id`. **STATIC_PASS is not POC1 acceptance.**

## Two-round R9 review gate hardening

The offline checker compares related story OOXML (headers, footers, footnotes, endnotes and comments), not just their visible text. It also checks table layout/style properties (table, row and cell) as well as table topology. A change to header boldness or a table width must be reported as \`STATIC_FAIL\`, even if visible text and row counts are unchanged.

This is intentionally strict: a legitimate Word resave may trigger manual inspection if XML semantics differ. A static PASS never proves actual Word desktop review, and the three SRS application cases remain NOT_RUN.

## R10: section and package integrity review

The offline gate now compares document-level page/section configuration and **every non-document ZIP part** (package membership, XML semantics or binary bytes), including `word/settings.xml` and `docProps/`. These checks reject unintended changes that otherwise appeared as `STATIC_PASS`. Formatting-only XML reindentation is treated as equivalent.

**Strict-save caveat:** Microsoft Word may legitimately update metadata or settings while saving. If that happens, the gate reports a static difference requiring **manual investigation**, not automatic success; original files and tester evidence must be retained. Do not bypass this protection by deleting metadata from files. Even `STATIC_PASS` does **not** establish that Word Desktop UI was used. `TC02C`, `TC07C`, `TCE2E-02` and Owner acceptance remain separate gates.
