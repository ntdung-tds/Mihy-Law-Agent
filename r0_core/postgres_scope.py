"""Trusted, transaction-local PostgreSQL RLS scope for R30.

NOT an authentication implementation. Middleware must verify the principal and
active session, choose the authorized tenant and then build VerifiedDatabaseScope.
Custom PostgreSQL app.* settings are forgeable by a privileged SQL caller;
connection and query capabilities MUST NOT be directly exposed to users.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .tenant_context import _canonical_uuid


@dataclass(frozen=True, slots=True)
class VerifiedDatabaseScope:
    user_id: str
    tenant_id: str

    def __post_init__(self):
        # UUID shape check only. The constructor does NOT verify JWT or rights.
        object.__setattr__(self, "user_id", _canonical_uuid(self.user_id))
        object.__setattr__(self, "tenant_id", _canonical_uuid(self.tenant_id))


@dataclass(frozen=True, slots=True)
class ScopedPostgresFactory:
    """Per-request scoped connection; never a shared pooled session variable."""

    open_connection: Callable[[], Any]
    scope: VerifiedDatabaseScope

    def __post_init__(self):
        if not callable(self.open_connection) or not isinstance(self.scope, VerifiedDatabaseScope):
            raise TypeError("Trusted PostgreSQL connection factory and scope required")

    def __call__(self) -> Any:
        conn = self.open_connection()
        try:
            # Values remain local to this transaction and are cleared on
            # COMMIT/ROLLBACK. No interpolation of UUIDs into SQL.
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT set_config('app.verified_user_id',%s,true), "
                    "set_config('app.verified_tenant_id',%s,true)",
                    (self.scope.user_id, self.scope.tenant_id),
                )
            return conn
        except Exception:
            conn.close()
            raise
