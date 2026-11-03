# POC1 selected Track Changes — narrow batch fixture

**Scope:** supporting technical slice for SRS v1.1.15 `TC02C` (five proposed edits; select a subset; accept two and reject one). This code **does not** implement selection UI, legal review approval, Microsoft Word UI, `TC07C` export workflow, or `TCE2E-02` application E2E.

## Invoke

```bash
python -m poc_docx.batch_changes original.docx selected.json tracked.docx
python -m unittest discover -s tests -v
```

`selected.json` is a JSON object with exactly one `edits` array, containing **1 to 5** selected whole-run replacements:

```json
{
  "edits": [
    {"operation":"replace","paragraph_index":0,"old_text":"15 ngày","new_text":"30 ngày","author":"Synthetic QA","changed_at":"2026-11-03T05:20:00Z"},
    {"operation":"replace","paragraph_index":1,"old_text":"A","new_text":"B","author":"Synthetic QA","changed_at":"2026-11-03T05:20:00Z"},
    {"operation":"replace","paragraph_index":2,"old_text":"C","new_text":"D","author":"Synthetic QA","changed_at":"2026-11-03T05:20:00Z"}
  ]
}
```

Indices refer to paragraphs in `word/document.xml` order (including tables), starting at zero. Each selected target must be the **only** direct, whole-run exact text match in the indexed paragraph. Cross-run ranges, partial replacements, field-context edits and protected files are rejected. Distinct selected edits may target distinct runs of the same paragraph; the same run cannot be selected twice. All edits resolve against the **original** DOCX before any mutation; one failing edit rejects the whole batch.

The technical sample can create three real `w:del` + `w:ins` pairs with unique IDs. Tests simulate mixed Accept/Reject on XML to check expected content. **These simulations do not prove Microsoft Word behavior**. Actual POC1 PASS still requires Word Desktop review, screenshots, reviewer, test run, saved/reopened outputs, and SRS test cases with Owner acceptance. No real legal/customer documents should be used without permission; the repository is Public.

## Two-round R9 hardening (synthetic POC)

A batch must reject an incomplete DOCX package, including missing \`[Content_Types].xml\` or \`_rels/.rels\`, malformed package roots and a missing Word document content-type declaration. The single-edit entrypoint applies the same package checks.

These are negative-path controls, not a declaration of complete ECMA-376 conformance. Offline mixed Accept/Reject testing remains simulation only.

## R11: bounded review loop for OOXML relationship integrity

Review sequence for this technical POC: **reproduce with a failing negative test → correct only the failing contract → rerun all tests → independently probe adjacent malformed cases**. The R11 test run used three fix cycles (54/54, 56/56, 58/58) followed by one clean bounded cross-check (58/58).

Both single and 1–5 selected batch edits now fail closed if the DOCX main officeDocument relationship is missing, incorrect or external; if the settings relationship is missing/misdirected; or if the main/settings `[Content_Types].xml` overrides are missing, duplicated or have wrong types. These checks are intentionally restricted to the touched DOCX parts and are **not a general-purpose Office package validator**.

Stopping a clean review loop does **not** prove all remaining defects have been found. Actual Word Desktop Accept/Reject, application TC02C/TC07C/TCE2E-02, and final Owner acceptance are still separate NOT_RUN/BLOCKED gates. Original SRS stays unchanged and outside Public GitHub.
