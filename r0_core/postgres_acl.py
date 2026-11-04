"""R30 MatterACL read boundary using actual PostgreSQL FORCE RLS.

This checks a matter id, NOT a run id. A real run repository must provide a
verified tenant-scoped run->matter association. Do not infer one from URL fields.
No provider, persistent run store, audit/outbox or production access is here.
"""
from __future__ import annotations

from contextlib import closing
from dataclasses import dataclass
from typing import Any, Callable

from .tenant_context import TenantContextDenied, _canonical_uuid


@dataclass(frozen=True, slots=True)
class PostgresMatterRead:
    open_scoped_connection: Callable[[], Any]

    def __post_init__(self):
        if not callable(self.open_scoped_connection):
            raise TypeError("Trusted scoped connection factory required")

    def __call__(self, tenant_id: str, user_id: str, matter_id: str) -> bool:
        try:
            tid, uid, mid = (_canonical_uuid(tenant_id),
                             _canonical_uuid(user_id),
                             _canonical_uuid(matter_id))
            with closing(self.open_scoped_connection()) as conn:
                with closing(conn.cursor()) as cur:
                    cur.execute("""
                        SELECT 1 FROM ai_law.matters
                        WHERE tenant_id=CAST(%s AS uuid)
                          AND matter_id=CAST(%s AS uuid)
                          AND ai_law.actor_user()=CAST(%s AS uuid)
                        LIMIT 1
                    """, (tid, mid, uid))
                    return cur.fetchone() is not None
        except TenantContextDenied:
            return False
        # Database outages are deliberately not converted to False. R28 returns
        # generic 503, whereas missing/unauthorized cases return 404.
