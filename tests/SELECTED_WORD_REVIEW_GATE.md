# POC1 – offline mixed Word Accept/Reject result gate

Related SRS v1.1.15: FR02-04, FR07-04; technical preparation for TC02C (five proposed, selected changes, accept two/reject one). This is **not** full TC02C, TC07C, TCE2E-02 application acceptance.

Generate tracked DOCX with `poc_docx.batch_changes` from selected whole-run replacements. Independently save actual review results in Microsoft Word Desktop, with a private screenshot/reviewer/version/test_run_id record. To inspect the reviewed result file, run:

```bash
python -m tools.verify_selected_review tracked.docx WORD_REVIEWED.docx selected_edits.json decisions.json
```

Here, `selected_edits.json` contains exactly `{"edits":[...]}` and decisions JSON exactly `{"accepted_indices":[0,1]}`, where edit index 0 and 1 are accepted, and other selected edits are rejected. The gate checks that every source revision pair matches a selected proposal, that the reviewed DOCX has no pending revisions, and that the outcome matches the mixed decisions while preserving all unrelated paragraphs, formatting, tables, headers/footers and ZIP parts. Results include hashes and explicitly say `microsoft_word_ui=NOT_VERIFIED_BY_THIS_TOOL`.

Offline synthetic examples must be named `SIMULATED` and **never** described as Word UI tests. Genuine Word may rewrite metadata, triggering a strict integrity error; escalate with original outputs and evidence for review, never silently exclude changed metadata. No legal/customer data should be committed to this Public repo. No SRS baseline changes.

## R13 bounded reproduce → fix → regression loop

Three review cycles found and fixed **six regression scenarios** in the synthetic mixed-review gate: mismatched tracked insertion/deletion run formatting; a hidden extra tab in a tracked revision; an unresolved tracked revision in a Word header; changed nonvolatile paragraph identity attributes; lost `xml:space="preserve"` (which can change rendered leading/trailing whitespace); and a missing required DOCX ZIP relationship/settings part in both source and output. The final clean loop checked the controlled R12 synthetic kit and full suite after fixes.

The gate now validates the exact whole-run shape of every source insertion/deletion pair, checks all Word XML parts for pending revisions, validates both DOCX packages against the existing POC1 package contract, and compares paragraph identities and whitespace semantics. A legitimate Word Desktop resave can still change metadata, paragraph IDs or OOXML serialization. Such output requires **manual adjudication** and retained UI evidence; do not auto-mark the Word UI as PASS.

Stop after a bounded clean review, not after assuming the whole system is defect-free. Application TC02C/TC07C/TCE2E-02 and actual Word Desktop testing remain NOT_RUN; Owner alone provides final acceptance.
