"""Pure approval invalidation decision for a controlled SRS FR14-03 POC.

A server-produced approved record binds a specific immutable output version to its
SHA-256, source snapshot and approval policy. If any binding becomes stale, emit
an ApprovalInvalidation-shaped event; NEVER update the approval record in place.

The caller must supply *authoritative server-side* current version/snapshot/policy
values. This pure helper does not authorize reviewers, persist events or implement
TC14B/TCE2E-02 application E2E. Byte-for-byte hashing is intentional for the
controlled POC, not a promise of canonicalized Word document content hashing.
"""
from __future__ import annotations

from datetime import datetime
from hashlib import sha256
import re
from typing import Any, Mapping


class ApprovalGateError(ValueError):
    """Invalid provenance or unsupported version transition; fail closed."""


_REQUIRED = frozenset({
    "approval_id", "product_version_id", "product_hash", "source_snapshot_id",
    "policy_version", "reviewer_user_id", "decision", "recorded_at",
})
_DECISIONS = frozenset({"approved", "rejected", "changes_requested"})
_HASH = re.compile(r"[0-9a-f]{64}\Z", re.ASCII)


def _nonblank(name: str, value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ApprovalGateError(f"{name} must be a nonblank string")
    return value


def _timestamp(name: str, value: Any) -> str:
    stamp = _nonblank(name, value)
    try:
        parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ApprovalGateError(f"{name} must be ISO 8601 with a timezone") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ApprovalGateError(f"{name} must be ISO 8601 with a timezone")
    return stamp


def _validate_approval(record: Mapping[str, Any]) -> None:
    if not isinstance(record, Mapping) or set(record) != _REQUIRED:
        raise ApprovalGateError("ApprovalRecord has missing or unsupported fields")
    for name in _REQUIRED - {"decision", "recorded_at", "product_hash"}:
        _nonblank(name, record[name])
    if not isinstance(record["decision"], str) or record["decision"] not in _DECISIONS:
        raise ApprovalGateError("Unknown approval decision")
    if not isinstance(record["product_hash"], str) or not _HASH.fullmatch(record["product_hash"]):
        raise ApprovalGateError("product_hash must be a lowercase SHA-256 digest")
    _timestamp("recorded_at", record["recorded_at"])


def invalidate_if_stale(
    approval: Mapping[str, Any],
    *,
    product_bytes: bytes,
    product_version_id: str,
    source_snapshot_id: str,
    policy_version: str,
    event_id: str,
    invalidated_at: str,
) -> dict[str, str] | None:
    """Return a new immutable-record invalidation event, or None if not stale.

    Deterministic priority when multiple inputs differ: product, source, policy.
    The original approved version must NEVER be edited in place: if bytes differ
    with the same product_version_id, fail closed rather than fabricating a valid
    successor. In a real application the caller must atomically append this event
    with the new product version and re-check permissions/version under a DB lock.
    """
    _validate_approval(approval)
    if not isinstance(product_bytes, bytes):
        raise ApprovalGateError("product_bytes must be immutable bytes")
    current_version = _nonblank("product_version_id", product_version_id)
    current_snapshot = _nonblank("source_snapshot_id", source_snapshot_id)
    current_policy = _nonblank("policy_version", policy_version)
    current_hash = sha256(product_bytes).hexdigest()

    # A nonapproved decision does not represent a currently active approval.
    if approval["decision"] != "approved":
        return None

    product_changed = (approval["product_hash"] != current_hash or
                       approval["product_version_id"] != current_version)
    source_changed = approval["source_snapshot_id"] != current_snapshot
    policy_changed = approval["policy_version"] != current_policy
    if not any((product_changed, source_changed, policy_changed)):
        return None

    if approval["product_hash"] != current_hash and approval["product_version_id"] == current_version:
        raise ApprovalGateError("Approved product version was mutated in place; a new version is required")

    recorded = datetime.fromisoformat(approval["recorded_at"].replace("Z", "+00:00"))
    invalidated_stamp = _timestamp("invalidated_at", invalidated_at)
    invalidated = datetime.fromisoformat(invalidated_stamp.replace("Z", "+00:00"))
    if invalidated < recorded:
        raise ApprovalGateError("invalidated_at is earlier than approval recorded_at")

    new_event = {
        "event_id": _nonblank("event_id", event_id),
        "approval_id": approval["approval_id"],
        "product_version_id": approval["product_version_id"],
        "reason": ("product_changed" if product_changed else
                   "source_changed" if source_changed else "policy_changed"),
        "invalidated_at": invalidated_stamp,
    }
    if current_version != approval["product_version_id"]:
        new_event["successor_product_version_id"] = current_version
    return new_event
