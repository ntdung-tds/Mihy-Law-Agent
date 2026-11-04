# AI Law — two required delivery modes (Owner decision, 2026-11-04)

**Decision:** build and test both (1) IAICT-hosted SaaS and (2) isolated dedicated customer deployment. Neither is optional or postponed to a hypothetical future product. This decision supersedes the earlier assistant's incorrect “dedicated deployment later/outside R0” assumption. The approved SRS v1.1.15 stays unchanged; any wording requiring formal synchronization is logged in `srs_changed.md` for Owner final decision.

## One application, two delivery configurations

| | IAICT shared SaaS | Dedicated customer environment |
| --- | --- | --- |
| Application code and R0 functionality | Same tagged source release | **Same tagged source release**; no feature fork |
| Hosting | IAICT-managed shared runtime | Isolated instance in customer's private cloud/on-premises or separately contracted infrastructure |
| User flow | Account granted by IAICT → sign in → choose permitted tenant → use | Account provisioned for customer's deployment → sign in → choose permitted workspace (if any) → use |
| IAM | Real approved identity, session revocation, registered roles/memberships, MatterACL | **Same authorization semantics**, IdP/server secrets configured for that environment |
| Data | Tenant separation enforced by PostgreSQL RLS and MatterACL | Dedicated data, file storage and keys for that environment; MatterACL remains effective |
| Operations | IAICT operations | Customer or IAICT under explicit operating agreement; no hidden cross-installation access |

**Simple user experience in both:** login → select authorized workspace if necessary → use AI Law. Subscription/payment self-service is separate from identity and may be implemented later, without making either deployment path optional.

## Bounded implementation work and acceptance

1. Keep configuration/deployment settings independent of app logic. Same database schema, migrations, APIs and legal workflows in both modes. Do not hard-code a Cloudflare or IAICT Portal login requirement for customer-hosted AI Law.
2. Build a reproducible dedicated nonproduction installation package for the actual selected runtime. Use isolated service/database/storage/keys; verify that destroying one installation does not affect another.
3. Deploy the **same release commit** to both disposable/nonproduction profiles, run actual authenticated role/member/tenant tests (RA-01..RA-09 as applicable) and all R0 acceptance tests, including relevant negative permissions and revocation cases.
4. Verify private-environment secrets isolation, installation, upgrade, backup/restore and rollback using actual operations, not just mock unit tests. Record test-run evidence.
5. Final Owner acceptance of **both** deployment modes is required for the dual-delivery product target. Do not deploy production or use customer legal documents unless the independent gates pass.

## Current verified status

- Shared SaaS: R0 backend and JWT signature verification **partially implemented**, no live role-authenticated customer E2E.
- Dedicated: **Owner-approved REQUIRED implementation**, but no dedicated runtime/package/installation/real E2E has been produced or tested yet. Do not call this production-ready.
- GitHub Actions currently validates Python source and disposable PostgreSQL 16 RLS, **not** a complete deployment for either mode.
- Product decisions: `pcs/STATE.json` DEC-015; mode registry `deployment/modes.json`; tracked SRS proposal `srs_changed.md`.
- No new public endpoint, no credentials and no client data in this document.

The exact hosting package and identity configuration must match the selected tech stack and private SRS. Do not invent a supported platform or claim installation success without operational evidence.
