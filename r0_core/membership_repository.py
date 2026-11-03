"""Read-only, server-side membership source for R0 tenant selection.

Derived from the **specification-only** IAM relational contract in SRS v1.1.15.
This adapter does NOT authenticate sessions, create an HTTP endpoint, deploy the
IAM schema, establish PostgreSQL RLS or authorize content/matter access.

Caller requirements:
- Authentication middleware must verify the session and produce the principal.
- open_connection creates a *new* connection with least-privilege read-only
  credentials and no bypass-RLS capability. No client-controlled SQL/credentials.
- approved_registry_version is deployed server configuration, not user input.
- Every content operation must check membership, RLS and matter/document ACL at
  point of use; this one read is not a general authorization grant.
"""
from __future__ import annotations

from contextlib import closing
from dataclasses import dataclass
from typing import Any, Callable

from .tenant_context import (
    AuthenticatedPrincipal, Membership, TenantContextDenied,
    TenantMembershipUnavailable, TenantView, _canonical_uuid, select_tenant,
)

_DENIAL = "Tenant context not authorized"

# One statement yields a consistent snapshot of principal, membership, tenant
# type, and version-scoped *approved registry* roles. PostgreSQL DB-API/psycopg
# bind variables, never string interpolation. No cross-tenant list endpoint.
_ACTIVE_MEMBERSHIP_SQL = """
SELECT
    m.user_id, m.tenant_id, m.status, m.authz_version,
    m.role_registry_version, t.tenant_type, mr.role_key
FROM memberships AS m
JOIN principals AS p ON p.user_id = m.user_id
JOIN tenants AS t ON t.tenant_id = m.tenant_id
JOIN membership_roles AS mr
  ON mr.tenant_id = m.tenant_id
 AND mr.membership_id = m.membership_id
 AND mr.registry_version = m.role_registry_version
JOIN role_catalog AS rc
  ON rc.role_key = mr.role_key
 AND rc.registry_version = mr.registry_version
WHERE m.user_id = CAST(%s AS UUID)
  AND m.tenant_id = CAST(%s AS UUID)
  AND m.role_registry_version = %s
  AND m.status = 'active'
  AND m.revoked_at IS NULL
  AND m.joined_at <= CURRENT_TIMESTAMP
  AND p.status = 'active'
ORDER BY mr.role_key
"""


@dataclass(frozen=True, slots=True)
class PostgresMembershipRepository:
    """Adapter for the proposed PostgreSQL schema; no real DB bundled.

    The test suite exercises the relational SELECT using synthetic SQLite
    tables with a narrow PostgreSQL-placeholder translator. Only an actual
    PostgreSQL/RLS test can qualify this for runtime use.
    """

    open_connection: Callable[[], Any]
    approved_registry_version: str

    def __post_init__(self) -> None:
        if not callable(self.open_connection):
            raise ValueError("A trusted connection factory is required")
        if (not isinstance(self.approved_registry_version, str) or
                not self.approved_registry_version.strip()):
            raise ValueError("An approved server-side role registry version is required")

    def __call__(self, user_id: str, tenant_id: str) -> Membership | None:
        """Read current authorization data for one user+tenant; fail closed."""
        uid = _canonical_uuid(user_id)
        tid = _canonical_uuid(tenant_id)
        try:
            with closing(self.open_connection()) as conn:
                with closing(conn.cursor()) as cur:
                    cur.execute(
                        _ACTIVE_MEMBERSHIP_SQL,
                        (uid, tid, self.approved_registry_version),
                    )
                    rows = tuple(cur.fetchall())
        except Exception:
            # Keep the public message generic, but differentiate an internal
            # dependency outage from an absent/revoked membership.
            raise TenantMembershipUnavailable(_DENIAL) from None

        if not rows:
            return None
        # Single membership is a DB invariant; deny unexpected inconsistencies
        # rather than merging roles from distinct rows/versions.
        first = rows[0]
        if not isinstance(first, (tuple, list)) or len(first) != 7:
            raise TenantContextDenied(_DENIAL)
        expected = tuple(first[:6])
        roles = []
        for row in rows:
            if not isinstance(row, (tuple, list)) or len(row) != 7 or tuple(row[:6]) != expected:
                raise TenantContextDenied(_DENIAL)
            role = row[6]
            if not isinstance(role, str) or not role.strip() or role in roles:
                raise TenantContextDenied(_DENIAL)
            roles.append(role)

        db_user, db_tenant, status, authz_version, registry, tenant_type = expected
        if (str(db_user) != uid or str(db_tenant) != tid or
                status != "active" or registry != self.approved_registry_version or
                type(authz_version) is not int or authz_version < 1 or
                tenant_type not in ("personal", "organization")):
            raise TenantContextDenied(_DENIAL)

        return Membership(
            user_id=uid, tenant_id=tid, status="active",
            authz_version=authz_version, roles=tuple(roles),
            role_registry_version=registry, tenant_type=tenant_type,
        )


def select_tenant_from_store(
    *,
    principal: AuthenticatedPrincipal,
    current: TenantView | None,
    target_tenant_id: str,
    repository: PostgresMembershipRepository,
) -> TenantView:
    """Wire trusted auth middleware identity to current server-side membership.

    This is an application-core seam, NOT an HTTP route or auth-middleware
    implementation. Client tenant_id is only a requested context.
    """
    if not isinstance(repository, PostgresMembershipRepository):
        raise TenantContextDenied(_DENIAL)
    return select_tenant(
        principal=principal,
        current=current,
        target_tenant_id=target_tenant_id,
        membership_lookup=repository,
    )
