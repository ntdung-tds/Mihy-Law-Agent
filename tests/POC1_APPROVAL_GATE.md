# POC1 — FR14-03 approval version binding (isolated domain slice)

**Contract baseline:** Owner-provided AI Law SRS v1.1.15 (private, unchanged); `FR14-03`, `TC14B`, and `TCE2E-02`. This is a controlled **domain unit POC**, not a functioning approval service, reviewer authorization or E2E validation.

## Design of this narrow slice

An existing **server-produced** `ApprovalRecord` binds `product_version_id`, SHA-256 `product_hash`, `source_snapshot_id`, `policy_version`, `reviewer_user_id` and decision. The POC receives that record and authoritative current product bytes, version ID, source snapshot and policy; it **never mutates** the approval record. For a stale *approved* record it creates a new `ApprovalInvalidation`-shaped event containing old approval/version references, event ID, reason, invalidation timestamp and an optional successor version. For unchanged inputs it produces no invalidation event. Rejected and changes-requested decisions are not active approvals.

Current mismatch priority is deterministic: **product/version > source snapshot > policy**. A changed hash with the *same product_version_id* is refused as an in-place mutation of an approved immutable version, rather than silently reusing the approval. Chronologically impossible invalidation timestamps are rejected. The hash is computed over exact input bytes; this is a POC byte hash, not an OOXML semantic canonicalization promise.

## Reproduce

```bash
python -m unittest discover -s tests -v
```

The tests include a **real synthetic DOCX byte flow** from `poc_docx.batch_changes.apply_batch`: change `15` to `16` in one paragraph (one character), compute the new file hash, and assert a `product_changed` invalidation event referencing the successor version while the prior approval remains untouched. Additional negative cases cover malformed provenance/hash/decision, in-place mutation without a new version, invalid event timestamp and invalid field types. Events were locally checked against the private v1.1.15 `ApprovalInvalidation` JSON schema; no original SRS contracts are committed here.

## Remaining gates / release boundaries

This module **does not** authenticate reviewers, authorize roles (`TC14B`), read the authoritative product/version from a database, persist events, enforce transaction concurrency or run an application approval-invalidating workflow (`TCE2E-02`). Those requirements remain **NOT_RUN**. Microsoft Word Desktop Accept/Reject (`TC02C`, `TC07C`) also remains **NOT_RUN**. Production use is prohibited without a separate authorized implementation and full integration test evidence. Owner retains final acceptance.

## R15 review results

The reviewed POC applies the immutable product-version hash check for all audit decisions, including rejected and changes_requested. Only an approved active record can emit an invalidation event.

Both ApprovalRecord.recorded_at and ApprovalInvalidation.invalidated_at are checked against RFC3339-shaped date-time strings, not every input accepted by datetime.fromisoformat. Week dates, space separators and second-resolution timezone offsets are rejected. Supported numeric timezone offsets, lowercase t/z and fractional seconds are covered by synthetic tests.

This is a bounded pure-domain review. It does not exercise Word Desktop, reviewer authorization, database transactions, event persistence or the application TCE2E-02 test.
