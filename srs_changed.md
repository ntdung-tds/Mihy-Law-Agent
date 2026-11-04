# AI Law — SRS change log (proposal only; not the approved baseline)

## SC-001 — 2026-11-04 — Owner clarification on delivery modes

- **Owner decision:** AI Law must be built for **both** IAICT-hosted shared SaaS **and** standalone/dedicated customer installation (e.g. isolated instance, private cloud or on-premises). Dedicated deployment is not to be postponed or omitted.
- **Stable product:** one source code base, versioned schema/migrations, identical legal AI functions, authorization/data-protection semantics, and versioned test suite. Different environment/operations configuration, **not** two product branches.
- **Current implementation:** No actual dedicated install has passed deployment/E2E tests; do not mark ready.
- **SRS impact:** Check whether SRS v1.1.15 deployment/nonfunctional requirements already express both targets. If they do, clarify delivery acceptance only; if not, propose a narrowly scoped addition covering dedicated package/install/upgrade/rollback and per-mode E2E. No changes to use cases, role registry, D01 approval or existing SRS baseline are authorized automatically.
- **Synchronization:** Pending Owner decision when final SRS consolidation is requested; do not edit the private SRS baseline in this repository.
- **Code/test references:** `deployment/modes.json`, `deployment/README.md`, `tests/test_dual_delivery_contract.py`.

## SC-002 — 2026-11-04 — Owner confirms standalone-first rollout and IAICT as ordinary organization

- **Priority:** Finish deployable, real functional dedicated AI Law first; IAICT-hosted shared SaaS is deferred until afterward but not removed from long-term target. Do not require SaaS test completion before standalone-specific acceptance.
- **IAICT test context:** In standalone, IAICT is an ordinary customer organization / tenant, not a mandatory cross-installation root operator or centralized IAM owner. The system operator for each standalone installation is separately designated; no implicit file/case rights.
- **One core:** Same SRS business functions, identity authorization boundaries, schema migration logic and upgrade path regardless of later SaaS offering. No baseline edits automatically.
- **Actual scope started:** `deployment/standalone/compose.yaml` and CI smoke implement disposable isolated PostgreSQL16 infrastructure only, not a full standalone application or user login. No real client data or production.
- **Approval:** Owner decision recorded as DEC-016; further SRS language alignment awaits Owner consolidation.
