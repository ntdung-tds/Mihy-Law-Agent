"""R0 tenant-context selection core (FR12-01 / TC12A).

Pure server-side application logic, not an authentication provider, an API, a
database/RLS layer, or a document permission evaluator. The caller MUST supply
a principal verified by its authentication middleware and a membership lookup
backed by trusted server-owned data; never build either from untrusted client
request fields. This code intentionally has no network, storage or global state.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable
from uuid import UUID


class TenantContextDenied(PermissionError):
    """Generic denial; do not reveal whether another tenant exists."""


@dataclass(frozen=True, slots=True)
class AuthenticatedPrincipal:
    """Identity and status supplied by trusted authentication middleware."""

    user_id: str
    status: str


@dataclass(frozen=True, slots=True)
class Membership:
    """A trusted membership lookup result, NOT a client-submitted assertion."""

    tenant_id: str
    user_id: str
    status: str
    authz_version: int
    roles: tuple[str, ...]
    role_registry_version: str
    tenant_type: str


@dataclass(frozen=True, slots=True)
class TenantView:
    """Server-selected context; all workspace fields are tenant-scoped."""

    user_id: str
    tenant_id: str
    tenant_type: str
    authz_version: int
    selected_matter_id: str | None = None
    selected_document_ids: tuple[str, ...] = ()
    chat_turns: tuple[str, ...] = ()
    search_query: str = ""
    suggested_document_ids: tuple[str, ...] = ()
    result_ids: tuple[str, ...] = ()


MembershipLookup = Callable[[str, str], Membership | None]


def _canonical_uuid(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise TenantContextDenied("Tenant context not authorized")
    try:
        return str(UUID(value))
    except (ValueError, AttributeError, TypeError) as exc:
        raise TenantContextDenied("Tenant context not authorized") from exc


def select_tenant(
    *,
    principal: AuthenticatedPrincipal,
    current: TenantView | None,
    target_tenant_id: str,
    membership_lookup: MembershipLookup,
) -> TenantView:
    """Choose an authorized tenant and invalidate prior tenant workspace state.

    A context is retained only for the same principal, tenant, tenant type and
    authorization version. On a switch or version change all tenant-specific
    selections, conversations, search and result references become empty.

    This is only one in-memory application-core control. Every API, job, query,
    storage access and download must independently enforce current membership
    and document/Matter ACL. Revocation must bump authz_version at the database
    transaction boundary; this function alone does not implement revocation.
    """
    denial = "Tenant context not authorized"
    if not isinstance(principal, AuthenticatedPrincipal) or principal.status != "active":
        raise TenantContextDenied(denial)

    user_id = _canonical_uuid(principal.user_id)
    tenant_id = _canonical_uuid(target_tenant_id)

    if current is not None:
        if not isinstance(current, TenantView) or _canonical_uuid(current.user_id) != user_id:
            raise TenantContextDenied(denial)

    # Membership is read for every selection, including same-tenant requests,
    # rather than using any prior client/session claim as authorization.
    try:
        member = membership_lookup(user_id, tenant_id)
    except Exception as exc:
        raise TenantContextDenied(denial) from exc

    if not isinstance(member, Membership):
        raise TenantContextDenied(denial)
    if (_canonical_uuid(member.user_id) != user_id or
            _canonical_uuid(member.tenant_id) != tenant_id or
            member.status != "active"):
        raise TenantContextDenied(denial)
    if (type(member.authz_version) is not int or member.authz_version < 1 or
            member.tenant_type not in ("personal", "organization") or
            not isinstance(member.role_registry_version, str) or
            not member.role_registry_version.strip() or
            not isinstance(member.roles, tuple) or not member.roles or
            any(not isinstance(r, str) or not r.strip() for r in member.roles)):
        raise TenantContextDenied(denial)

    if (current is not None and current.tenant_id == tenant_id and
            current.tenant_type == member.tenant_type and
            current.authz_version == member.authz_version):
        return current

    return TenantView(
        user_id=user_id,
        tenant_id=tenant_id,
        tenant_type=member.tenant_type,
        authz_version=member.authz_version,
    )
