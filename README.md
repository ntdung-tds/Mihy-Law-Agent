# AI Law — early POC workspace

This repository is the **Owner-selected public project repository**. Only non-sensitive project metadata and public-safe proof-of-concept code belong here. **Do not commit** original internal SRS files, client/legal case files, credentials, personal information, or real legal PDFs without explicit classification and authorization.

Current focus: **DOCX Track Changes POC (small initial technical slice)**. The supplied SRS `v1.1.15` (2026-11-03) package was privately inspected and its checksum lists independently verified on 2026-11-03. The package was **not published** to this public repository; the baseline remains subject to Owner approval. The code is experimental; it is **not** an accepted Word integration, a completed POC, or a production service.

## Single-run tracked replacement (POC)

Supported: a JSON `replace` operation targeting exactly one `w:t` text element in one direct paragraph run. It emits actual OOXML `w:del` and `w:ins` elements and enables revision tracking. It preserves other ZIP parts and untouched paragraphs/tables. A paragraph index is zero-based in WordprocessingML document order, including paragraphs inside tables. Unsupported cases **fail closed** rather than guessing. An enforced `w:documentProtection` now rejects edits; this is a guard for the POC negative-case test, not a complete Word permissions engine.

```bash
python -m pip install -r requirements-dev.txt
python -m poc_docx.track_changes input.docx edit.json output.docx
python -m unittest discover -s tests -v
```

Example `edit.json` (synthetic text only):

```json
{
  "operation": "replace",
  "paragraph_index": 0,
  "old_text": "Original",
  "new_text": "Updated",
  "author": "AI Law POC",
  "changed_at": "2026-11-03T01:40:00Z"
}
```

Local tests need `python-docx` to construct synthetic `.docx` fixtures. The runtime patcher requires `lxml` to preserve namespace declarations and compatibility prefixes. Checks that XML correctly represents insert/delete and that a synthetic accept/reject simulation produces expected text **do not** substitute for opening/accepting/rejecting the document in actual Microsoft Word. SRS test alignment: `TC02C`, `TC07C` and cross-UC `TCE2E-02` (not `TCE2E-01`). These are **NOT_RUN** as application/Word UI tests. The current implementation does not handle multi-run text, insert-only/delete-only operations, hyperlinks, headers/footers, nested revisions, or arbitrary change ranges; those remain outside this initial small task.

## Project continuity

Canonical state: [`pcs/STATE.json`](pcs/STATE.json). Quick handoff: [`pcs/MOMENT.md`](pcs/MOMENT.md). All changes follow PCS Chat Solo. `TECH_DONE` does **not** mean Owner acceptance; no production deployment has been performed.

## Field/revision safety (R3 bugfix)

The scoped patcher deliberately rejects edits to paragraphs containing Word Fields (complex or simple), and results within complex Fields that span paragraphs. Existing `w:ins` and `w:del` elements must carry unique, non-negative numeric `w:id` values. Other paragraphs without Field context remain editable. Unsupported field semantics are **not** silently rewritten. Test evidence metadata is recorded at `tests/evidence/AL-POC1-R3-2026-11-03.json`.

Unit/XML and LibreOffice rendering checks are **not** proof of actual Microsoft Word Accept/Reject behavior or application approval invalidation; the real Word UI and `TC02C`, `TC07C`, `TCE2E-02` remain NOT_RUN.
