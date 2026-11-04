"""Synthetic-only WSGI integration of SRS v1.1.15 GET /v1/runs/{id}.

WARNING: This is a narrow HTTP integration seam, not a deployed API/server.
The trusted injected callbacks MUST eventually be backed by real JWT signature
verification, server-owned session/active-tenant data, PostgreSQL RLS, run ACL
and an approved run store. Mock callbacks used in tests are not production
authorization. No other API routes or tenant-switch endpoints are implemented.
"""
from __future__ import annotations

from dataclasses import dataclass
from json import dumps
import re
from typing import Any, Callable, Mapping
from uuid import uuid4

from .membership_repository import PostgresMembershipRepository, select_tenant_from_store
from .session_boundary import (
    IdentityLookup, SessionIsActive, SessionRejected,
    SessionDependencyUnavailable, TokenVerifier,
    authenticate_bearer_session,
)
from .tenant_context import TenantContextDenied, TenantMembershipUnavailable, _canonical_uuid

_ROUTE = re.compile(r"^/v1/runs/([^/]+)$")
_RUN_STATES = frozenset({
    "created", "queued", "running", "waiting_input", "partial",
    "succeeded", "failed", "cancel_requested", "cancelled",
})
_ALLOWED_FIELDS = frozenset({
    "run_id", "status", "input_snapshot_id", "policy_version",
    "progress", "result_version_id", "warnings", "manifest_id",
    "attempt_id", "coverage", "usage",
})
_COVERAGE_FIELDS = frozenset({
    "status", "manifest_id", "note", "processed_items", "total_items"
})
_USAGE_FIELDS = frozenset({
    "reconciliation_status", "budget_units_consumed",
    "input_tokens", "output_tokens", "notes",
})
_STATUS_TEXT = {200: "OK", 400: "Bad Request", 401: "Unauthorized",
                404: "Not Found", 503: "Service Unavailable"}


@dataclass(frozen=True, slots=True)
class RunSnapshot:
    """Trusted run-store result; includes a tenant boundary outside TaskRun."""
    tenant_id: str
    run_id: str
    data: Mapping[str, Any]


def _present(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _nonnegative(value: Any) -> bool:
    return type(value) is int and value >= 0


def _safe_run_payload(snapshot: RunSnapshot, requested_id: str) -> dict[str, Any]:
    """Validate the selected response fields instead of serializing DB objects.

    Mirrors the relevant TaskRun structural invariants of the locked OpenAPI
    contract. The full reference contract suite remains authoritative.
    """
    payload = snapshot.data
    if not isinstance(payload, dict) or set(payload) - _ALLOWED_FIELDS:
        raise ValueError("Unapproved run response shape")
    required = ("run_id", "status", "input_snapshot_id", "policy_version")
    if any(not _present(payload.get(field)) for field in required):
        raise ValueError("Missing run response contract fields")
    if payload["run_id"] != requested_id or payload["status"] not in _RUN_STATES:
        raise ValueError("Unexpected run id or state")
    for field in ("result_version_id", "manifest_id", "attempt_id"):
        if field in payload and not _present(payload[field]):
            raise ValueError("Invalid optional identifier")
    if "progress" in payload and (
        type(payload["progress"]) not in (float, int) or
        not 0 <= payload["progress"] <= 1
    ):
        raise ValueError("Invalid progress")
    if "warnings" in payload and (
        not isinstance(payload["warnings"], list) or
        any(not isinstance(x, str) for x in payload["warnings"])
    ):
        raise ValueError("Invalid warnings")
    coverage = payload.get("coverage")
    if "coverage" in payload and coverage is None:
        raise ValueError("Coverage must be an object, not null")
    if coverage is not None:
        if (not isinstance(coverage, dict) or
                set(coverage) - _COVERAGE_FIELDS or
                coverage.get("status") not in
                ("complete", "partial", "unknown", "not_applicable")):
            raise ValueError("Invalid coverage")
        if "manifest_id" in coverage and not _present(coverage["manifest_id"]):
            raise ValueError("Invalid coverage manifest")
        if "note" in coverage and not isinstance(coverage["note"], str):
            raise ValueError("Invalid coverage note")
        for field in ("processed_items", "total_items"):
            if field in coverage and not _nonnegative(coverage[field]):
                raise ValueError("Invalid coverage counts")
        if ("processed_items" in coverage and "total_items" in coverage and
                coverage["processed_items"] > coverage["total_items"]):
            raise ValueError("Invalid coverage range")
        if (payload["status"] == "succeeded" and
                "processed_items" in coverage and "total_items" in coverage and
                coverage["processed_items"] != coverage["total_items"]):
            raise ValueError("Incomplete succeeded run")
        if ("manifest_id" in payload and "manifest_id" in coverage and
                payload["manifest_id"] != coverage["manifest_id"]):
            raise ValueError("Manifest references disagree")
    usage = payload.get("usage")
    if "usage" in payload and usage is None:
        raise ValueError("Usage must be an object, not null")
    if usage is not None:
        if (not isinstance(usage, dict) or
                set(usage) - _USAGE_FIELDS or
                usage.get("reconciliation_status") not in
                ("pending", "estimated", "reconciled", "unknown")):
            raise ValueError("Invalid usage")
        for field in ("input_tokens", "output_tokens"):
            if field in usage and not _nonnegative(usage[field]):
                raise ValueError("Invalid usage counters")
        if "notes" in usage and not isinstance(usage["notes"], str):
            raise ValueError("Invalid usage notes")
        if "budget_units_consumed" in usage:
            budget = usage["budget_units_consumed"]
            if budget is not None and (
                type(budget) not in (float, int) or budget < 0
            ):
                raise ValueError("Invalid usage budget")
    if payload["status"] == "succeeded" and (
        "result_version_id" not in payload or
        not isinstance(coverage, dict) or coverage.get("status") != "complete" or
        usage is None
    ):
        raise ValueError("Succeeded run lacks persisted results")
    if payload["status"] == "partial" and (
        not isinstance(coverage, dict) or coverage.get("status") != "partial" or
        usage is None
    ):
        raise ValueError("Partial run lacks disclosure")
    return dict(payload)


@dataclass(frozen=True, slots=True)
class GetRunWSGI:
    """One SRS-approved read-only route, with server-owned dependencies only."""

    token_verifier: TokenVerifier
    identity_lookup: IdentityLookup
    session_is_active: SessionIsActive
    active_tenant_for_session: Callable[[str, str], str | None]
    membership_repository: PostgresMembershipRepository
    authorize_run_read: Callable[[str, str, str], bool]
    load_run: Callable[[str, str], RunSnapshot | None]
    expected_issuer: str
    expected_audience: str
    now_epoch: Callable[[], int]
    membership_repository_for_scope: Callable[[str, str], PostgresMembershipRepository] | None = None
    load_run_for_scope: Callable[[str, str, str], RunSnapshot | None] | None = None

    def __call__(self, environ: Mapping[str, Any], start_response: Callable):
        correlation_id = str(uuid4())

        def send(status: int, payload: Mapping[str, Any]):
            body = dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            start_response(
                f"{status} {_STATUS_TEXT[status]}",
                [("Content-Type", "application/json; charset=utf-8"),
                 ("Content-Length", str(len(body))),
                 ("Cache-Control", "no-store"),
                 ("X-Correlation-ID", correlation_id)],
            )
            return [body]

        def error(status: int):
            codes = {400: "INVALID_REQUEST", 401: "UNAUTHENTICATED",
                     404: "NOT_FOUND", 503: "DEPENDENCY_UNAVAILABLE"}
            messages = {400: "Malformed request", 401: "Authentication required",
                        404: "Resource not found",
                        503: "Required service unavailable"}
            return send(status, {
                "code": codes[status], "message": messages[status],
                "correlation_id": correlation_id, "retryable": status == 503,
            })

        try:
            path = environ.get("PATH_INFO", "")
            method = environ.get("REQUEST_METHOD", "")
            match = _ROUTE.fullmatch(path) if isinstance(path, str) else None
            if method != "GET" or match is None:
                return error(404)
            run_id = match.group(1)
            if (not _present(run_id) or
                    environ.get("QUERY_STRING") or
                    environ.get("CONTENT_LENGTH") not in (None, "", "0")):
                return error(400)

            # Do not decode JWT locally. The caller injects a trusted signer/
            # verifier and the internal principal+session repository.
            session = authenticate_bearer_session(
                authorization_header=environ.get("HTTP_AUTHORIZATION"),
                token_verifier=self.token_verifier,
                identity_lookup=self.identity_lookup,
                session_is_active=self.session_is_active,
                expected_issuer=self.expected_issuer,
                expected_audience=self.expected_audience,
                now_epoch=self.now_epoch(),
            )

            # Tenant must come from verified, server-owned SESSION state,
            # never X-Tenant-ID, request JSON, URL, or token-selected client claim.
            active_tenant = self.active_tenant_for_session(
                session.principal.user_id, session.session_id
            )
            if not isinstance(active_tenant, str):
                return error(404)
            _canonical_uuid(active_tenant)
            # R30: each authenticated request may supply a fresh, transaction-
            # scoped PostgreSQL repository constructed by trusted server code.
            # The callback cannot be sourced from HTTP headers or token claims.
            repository = (
                self.membership_repository_for_scope(
                    session.principal.user_id, active_tenant
                ) if self.membership_repository_for_scope is not None
                else self.membership_repository
            )
            view = select_tenant_from_store(
                principal=session.principal, current=None,
                target_tenant_id=active_tenant,
                repository=repository,
            )
            if self.authorize_run_read(
                view.tenant_id, view.user_id, run_id
            ) is not True:
                return error(404)
            # A trust-configured PostgreSQL run reader may need the verified
            # principal to establish *another* fresh RLS transaction.
            # Never bind this identity from request headers or JWT subject.
            snapshot = (
                self.load_run_for_scope(view.tenant_id, view.user_id, run_id)
                if self.load_run_for_scope is not None
                else self.load_run(view.tenant_id, run_id)
            )
            if snapshot is None:
                return error(404)
            if (not isinstance(snapshot, RunSnapshot) or
                    _canonical_uuid(snapshot.tenant_id) != view.tenant_id or
                    snapshot.run_id != run_id):
                return error(404)
            return send(200, _safe_run_payload(snapshot, run_id))
        except SessionDependencyUnavailable:
            return error(503)
        except SessionRejected:
            return error(401)
        except TenantMembershipUnavailable:
            return error(503)
        except TenantContextDenied:
            # Uniform 404 prevents unauthorized/nonexistent run disclosure.
            return error(404)
        except Exception:
            # Avoid exposing database/IdP/ACL errors or raw run internals.
            return error(503)
