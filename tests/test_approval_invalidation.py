"""POC1 FR14-03 version-binding tests, NOT TC14B or TCE2E-02 app E2E."""
from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
from io import BytesIO
import unittest

from docx import Document

from poc_approval.invalidation import ApprovalGateError, invalidate_if_stale
from poc_docx.batch_changes import apply_batch

STAMP = "2026-11-03T10:00:00Z"
SOURCE = b"Synthetic approved output; pay amount 1,500,000 VND."


def approval(product=SOURCE, **overrides):
    record = {
        "approval_id": "apr-synthetic-1", "product_version_id": "v1",
        "product_hash": sha256(product).hexdigest(),
        "source_snapshot_id": "source-snapshot-1", "policy_version": "policy-1",
        "reviewer_user_id": "authorized-reviewer-fixture", "decision": "approved",
        "recorded_at": STAMP,
    }
    record.update(overrides)
    return record


def evaluate(record=None, **changes):
    params = dict(
        product_bytes=SOURCE,
        product_version_id="v1", source_snapshot_id="source-snapshot-1",
        policy_version="policy-1", event_id="evt-synthetic-1", invalidated_at=STAMP,
    )
    params.update(changes)
    return invalidate_if_stale(approval() if record is None else record, **params)


class ApprovalVersionBindingTests(unittest.TestCase):
    def test_unchanged_version_source_and_policy_remains_approved(self):
        a = approval()
        before = deepcopy(a)
        self.assertIsNone(evaluate(a))
        self.assertEqual(a, before)

    def test_one_character_edit_with_new_version_yields_event_without_mutating_record(self):
        a = approval()
        one_character_edit = SOURCE.replace(b"VND", b"VNE")
        before = deepcopy(a)
        event = evaluate(a, product_bytes=one_character_edit, product_version_id="v2")
        self.assertEqual(event, {
            "event_id": "evt-synthetic-1",
            "approval_id": "apr-synthetic-1",
            "product_version_id": "v1",
            "reason": "product_changed",
            "invalidated_at": STAMP,
            "successor_product_version_id": "v2",
        })
        self.assertEqual(a, before)

    def test_new_version_even_same_bytes_invalidates_old_approval(self):
        event = evaluate(product_version_id="v2")
        self.assertEqual(event["reason"], "product_changed")
        self.assertEqual(event["successor_product_version_id"], "v2")

    def test_source_snapshot_change_invalidates_without_mutating_approval(self):
        a = approval()
        event = evaluate(a, source_snapshot_id="source-snapshot-2")
        self.assertEqual(event["reason"], "source_changed")
        self.assertNotIn("successor_product_version_id", event)
        self.assertEqual(a["source_snapshot_id"], "source-snapshot-1")

    def test_policy_version_change_invalidates(self):
        event = evaluate(policy_version="policy-2")
        self.assertEqual(event["reason"], "policy_changed")

    def test_multi_dimension_change_uses_deterministic_product_priority(self):
        event = evaluate(product_version_id="v2", source_snapshot_id="ss2", policy_version="p2")
        self.assertEqual(event["reason"], "product_changed")

    def test_rejected_and_changes_requested_are_not_active_approvals(self):
        for decision in ("rejected", "changes_requested"):
            with self.subTest(decision=decision):
                self.assertIsNone(evaluate(approval(decision=decision), product_version_id="v2"))

    def test_mutating_bytes_in_place_is_rejected_not_approved(self):
        with self.assertRaisesRegex(ApprovalGateError, "mutated in place"):
            evaluate(product_bytes=SOURCE + b"!")

    def test_missing_provenance_and_extra_fields_rejected(self):
        a = approval()
        del a["source_snapshot_id"]
        with self.assertRaisesRegex(ApprovalGateError, "missing or unsupported fields"):
            evaluate(a)
        a = approval()
        a["client_is_reviewer"] = True
        with self.assertRaisesRegex(ApprovalGateError, "missing or unsupported fields"):
            evaluate(a)

    def test_invalid_hash_and_decision_rejected(self):
        with self.assertRaisesRegex(ApprovalGateError, "product_hash"):
            evaluate(approval(product_hash="NOT-SHA-256"))
        with self.assertRaisesRegex(ApprovalGateError, "decision"):
            evaluate(approval(decision="self-approved"))

    def test_timezone_and_event_fields_validated(self):
        with self.assertRaisesRegex(ApprovalGateError, "timezone"):
            evaluate(approval(recorded_at="2026-11-03T10:00:00"))
        with self.assertRaisesRegex(ApprovalGateError, "timezone"):
            evaluate(product_version_id="v2", invalidated_at="2026-11-03T10:00:00")
        with self.assertRaisesRegex(ApprovalGateError, "event_id"):
            evaluate(product_version_id="v2", event_id="  ")

    def test_source_is_immutable_bytes(self):
        with self.assertRaisesRegex(ApprovalGateError, "immutable bytes"):
            evaluate(product_bytes=bytearray(SOURCE))

    def test_invalidation_time_must_follow_approval_time(self):
        with self.assertRaisesRegex(ApprovalGateError, "earlier than approval"):
            evaluate(product_version_id="v2", invalidated_at="2026-11-03T09:59:59Z")

    def test_malformed_decision_fails_closed_with_domain_error(self):
        with self.assertRaisesRegex(ApprovalGateError, "decision"):
            evaluate(approval(decision=["approved"]))

    def test_schema_date_time_rejects_week_dates_spaces_and_offset_seconds(self):
        for invalid in (
            "2026-W45-2T10:00:00Z",
            "2026-11-03 10:00:00Z",
            "2026-11-03T10:00:00+07:00:30",
        ):
            with self.subTest(stamp=invalid), self.assertRaisesRegex(ApprovalGateError, "RFC 3339"):
                evaluate(approval(recorded_at=invalid), product_version_id="v2")

    def test_invalidation_event_date_time_rejects_non_rfc3339(self):
        for invalid in (
            "2026-W45-2T10:00:00Z",
            "2026-11-03 10:00:00Z",
            "2026-11-03T10:00:00+07:00:30",
        ):
            with self.subTest(stamp=invalid), self.assertRaisesRegex(ApprovalGateError, "RFC 3339"):
                evaluate(product_version_id="v2", invalidated_at=invalid)

    def test_immutable_product_version_guard_applies_to_every_decision(self):
        for decision in ("rejected", "changes_requested"):
            with self.subTest(decision=decision), self.assertRaisesRegex(ApprovalGateError, "mutated in place"):
                evaluate(approval(decision=decision), product_bytes=SOURCE + b"!", product_version_id="v1")
            with self.subTest(decision=decision, new_version=True):
                self.assertIsNone(evaluate(approval(decision=decision), product_version_id="v2"))

    def test_valid_rfc3339_offsets_and_original_record_remain_stable(self):
        a = approval(recorded_at="2026-11-03T10:00:00+07:00")
        before = deepcopy(a)
        event = evaluate(a, product_version_id="v2", invalidated_at="2026-11-03T03:00:01Z")
        self.assertEqual(event["reason"], "product_changed")
        self.assertEqual(a, before)
        with self.assertRaisesRegex(ApprovalGateError, "earlier than approval"):
            evaluate(a, product_version_id="v2", invalidated_at="2026-11-03T02:59:59Z")
        lowercase = evaluate(a, product_version_id="v2", invalidated_at="2026-11-03t11:00:00z")
        self.assertEqual(lowercase["invalidated_at"], "2026-11-03t11:00:00z")

    def test_real_synthetic_docx_batch_edit_changes_sha_and_invalidates_approval(self):
        source_doc = Document()
        source_doc.add_paragraph("Payable in 15 days.")
        stream = BytesIO()
        source_doc.save(stream)
        original_docx = stream.getvalue()
        a = approval(product=original_docx)
        edit = {"operation": "replace", "paragraph_index": 0,
                "old_text": "Payable in 15 days.", "new_text": "Payable in 16 days.",
                "author": "Synthetic QA", "changed_at": STAMP}
        changed_docx = apply_batch(original_docx, [edit])
        self.assertNotEqual(sha256(original_docx).hexdigest(), sha256(changed_docx).hexdigest())
        event = evaluate(a, product_bytes=changed_docx, product_version_id="v2")
        self.assertEqual(event["reason"], "product_changed")
        self.assertEqual(event["successor_product_version_id"], "v2")
        self.assertEqual(a["product_hash"], sha256(original_docx).hexdigest())


if __name__ == "__main__":
    unittest.main()
