"""R0 FR12-01 / TC12A: synthetic tenant-context isolation tests.

This is a pure application-core test. It does NOT exercise real sign-in,
database RLS or a deployed API.
"""
import unittest

from r0_core.tenant_context import (
    AuthenticatedPrincipal,
    Membership,
    TenantContextDenied,
    TenantView,
    select_tenant,
)

USER = "11111111-1111-4111-8111-111111111111"
OTHER_USER = "22222222-2222-4222-8222-222222222222"
TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


def membership(tenant, *, user=USER, status="active", version=1,
               roles=("lawyer",), registry="roles-v1",
               tenant_type="organization"):
    return Membership(
        tenant_id=tenant, user_id=user, status=status,
        authz_version=version, roles=roles,
        role_registry_version=registry, tenant_type=tenant_type
    )


class TenantContextTests(unittest.TestCase):
    def setUp(self):
        self.principal = AuthenticatedPrincipal(user_id=USER, status="active")
        self.memberships = {
            (USER, TENANT_A): membership(TENANT_A, tenant_type="personal"),
            (USER, TENANT_B): membership(TENANT_B, version=2),
        }

    def lookup(self, user_id, tenant_id):
        return self.memberships.get((user_id, tenant_id))

    def select(self, tenant_id, current=None, principal=None):
        return select_tenant(
            principal=self.principal if principal is None else principal,
            current=current,
            target_tenant_id=tenant_id,
            membership_lookup=self.lookup,
        )

    def test_initial_entry_uses_authoritative_active_membership(self):
        view = self.select(TENANT_A)
        self.assertEqual(view.user_id, USER)
        self.assertEqual(view.tenant_id, TENANT_A)
        self.assertEqual(view.tenant_type, "personal")
        self.assertEqual(view.authz_version, 1)
        self.assertEqual(view.selected_document_ids, ())
        self.assertEqual(view.chat_turns, ())

    def test_switch_clears_all_previous_tenant_workspace_context(self):
        a = TenantView(
            user_id=USER, tenant_id=TENANT_A, tenant_type="personal",
            authz_version=1,
            selected_matter_id="A-matter",
            selected_document_ids=("A-doc",),
            chat_turns=("A-confidential-conversation",),
            search_query="A-secret-search",
            suggested_document_ids=("A-suggestion",),
            result_ids=("A-result",),
        )
        b = self.select(TENANT_B, current=a)
        self.assertEqual((b.tenant_id, b.tenant_type, b.authz_version),
                         (TENANT_B, "organization", 2))
        self.assertIsNone(b.selected_matter_id)
        self.assertEqual(b.selected_document_ids, ())
        self.assertEqual(b.chat_turns, ())
        self.assertEqual(b.search_query, "")
        self.assertEqual(b.suggested_document_ids, ())
        self.assertEqual(b.result_ids, ())
        self.assertEqual(a.selected_document_ids, ("A-doc",))

    def test_same_tenant_and_authz_version_keeps_view(self):
        a = TenantView(
            user_id=USER, tenant_id=TENANT_A, tenant_type="personal",
            authz_version=1, search_query="tenant A search"
        )
        self.assertIs(self.select(TENANT_A, current=a), a)

    def test_authz_version_change_invalidates_even_same_tenant(self):
        a = TenantView(
            user_id=USER, tenant_id=TENANT_A, tenant_type="personal",
            authz_version=1, selected_document_ids=("A-doc",)
        )
        self.memberships[(USER, TENANT_A)] = membership(
            TENANT_A, version=3, tenant_type="personal"
        )
        refreshed = self.select(TENANT_A, current=a)
        self.assertEqual(refreshed.authz_version, 3)
        self.assertEqual(refreshed.selected_document_ids, ())

    def test_unrelated_tenant_does_not_gain_access(self):
        self.memberships.pop((USER, TENANT_B))
        with self.assertRaises(TenantContextDenied):
            self.select(TENANT_B)

    def test_suspended_or_revoked_membership_denied(self):
        for status in ("suspended", "revoked"):
            with self.subTest(status=status):
                self.memberships[(USER, TENANT_B)] = membership(
                    TENANT_B, status=status
                )
                with self.assertRaises(TenantContextDenied):
                    self.select(TENANT_B)

    def test_suspended_or_disabled_principal_denied(self):
        for status in ("suspended", "disabled"):
            with self.subTest(status=status):
                with self.assertRaises(TenantContextDenied):
                    self.select(
                        TENANT_A,
                        principal=AuthenticatedPrincipal(user_id=USER, status=status)
                    )

    def test_current_view_other_user_rejected(self):
        forged = TenantView(
            user_id=OTHER_USER, tenant_id=TENANT_A,
            tenant_type="personal", authz_version=1
        )
        with self.assertRaises(TenantContextDenied):
            self.select(TENANT_B, current=forged)

    def test_repository_membership_mismatched_user_denied(self):
        self.memberships[(USER, TENANT_B)] = membership(
            TENANT_B, user=OTHER_USER
        )
        with self.assertRaises(TenantContextDenied):
            self.select(TENANT_B)

    def test_missing_role_registry_or_zero_authz_version_denied(self):
        for role, registry, version in (
            ((), "roles-v1", 1),
            (("lawyer",), "", 1),
            (("lawyer",), "roles-v1", 0),
        ):
            with self.subTest(roles=role, registry=registry, version=version):
                self.memberships[(USER, TENANT_B)] = membership(
                    TENANT_B, roles=role, registry=registry, version=version
                )
                with self.assertRaises(TenantContextDenied):
                    self.select(TENANT_B)

    def test_invalid_requested_tenant_id_denied(self):
        for value in ("", "not-a-uuid", TENANT_A + "x"):
            with self.subTest(value=value):
                with self.assertRaises(TenantContextDenied):
                    self.select(value)


    def test_revoked_membership_denies_reusing_same_tenant_context(self):
        old = self.select(TENANT_A)
        self.memberships[(USER, TENANT_A)] = membership(
            TENANT_A, tenant_type="personal", status="revoked", version=2
        )
        with self.assertRaises(TenantContextDenied):
            self.select(TENANT_A, current=old)

    def test_membership_lookup_outage_fails_closed(self):
        def unavailable(_user_id, _tenant_id):
            raise RuntimeError("transient database outage")
        with self.assertRaises(TenantContextDenied) as caught:
            select_tenant(
                principal=self.principal,
                current=None,
                target_tenant_id=TENANT_A,
                membership_lookup=unavailable,
            )
        self.assertNotIn("database", str(caught.exception).lower())

    def test_membership_lookup_wrong_tenant_or_invalid_type_denied(self):
        self.memberships[(USER, TENANT_B)] = membership(TENANT_A)
        with self.assertRaises(TenantContextDenied):
            self.select(TENANT_B)
        self.memberships[(USER, TENANT_B)] = membership(
            TENANT_B, tenant_type="unknown"
        )
        with self.assertRaises(TenantContextDenied):
            self.select(TENANT_B)



if __name__ == "__main__":
    unittest.main()
