"""Read-only, evidence-based R0 release readiness. Fail closed by design.

A synthetic demo and PASS unit tests never imply real product readiness.
Use: python -m tools.check_product_readiness release/product_readiness.json --json
Exit code 3 = NOT_READY; 0 = READY only with all gates+owner evidence.
Does not deploy or change state. Owner retains final release decision.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


REQUIRED_DEMO_GATES = frozenset({
    "DEMO_FIXTURE", "DEMO_POSTGRES", "DEMO_BROWSER", "DEMO_NONPROD"
})
REQUIRED_PRODUCT_GATES = frozenset({
    "D01_APPROVAL", "LEGAL_DATA", "REAL_IDP_JWT_MFA",
    "REAL_TENANT_RLS_SECURITY", "REAL_CASE_DOC_STORAGE",
    "UC03_TRANSLATE", "UC04_SUMMARIZE", "UC07_GRAMMAR",
    "RUNS_JOBS_AUDIT", "APPLICATION_E2E", "OPERATIONS_RELEASE",
})
REQUIRED_DELIVERY_MODES = frozenset({"saas", "dedicated"})


def _has_required_gates(items: list, required: frozenset[str]) -> bool:
    if not isinstance(items, list):
        return False
    ids = [g.get("id") for g in items if isinstance(g, dict)]
    return len(ids) == len(required) and len(set(ids)) == len(ids) and set(ids) == required


def _complete(items: list) -> bool:
    return bool(items) and all(
        isinstance(g, dict) and
        g.get("status") == "PASS" and
        isinstance(g.get("evidence"), list) and
        bool(g["evidence"]) and
        all(isinstance(e, str) and e.strip() for e in g["evidence"])
        for g in items
    )


def evaluate_readiness(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("A JSON release-readiness object is required")
    demo = data.get("demo_gates", [])
    hard = data.get("gates", [])
    delivery = data.get("delivery_modes", {})
    if not isinstance(demo, list) or not isinstance(hard, list):
        raise ValueError("Invalid gate collection")

    demo_ready = _has_required_gates(demo, REQUIRED_DEMO_GATES) and _complete(demo)
    # Owner DEC-015: a complete SaaS deployment alone cannot satisfy the AI Law
    # product target while dedicated installation is unimplemented.
    delivery_ready = (
        isinstance(delivery, dict) and
        set(delivery) == REQUIRED_DELIVERY_MODES and
        all(
            isinstance(delivery[mode], dict) and
            delivery[mode].get("required") is True and
            delivery[mode].get("status") == "PASS" and
            delivery[mode].get("deployment_e2e") == "PASS" and
            isinstance(delivery[mode].get("evidence"), list) and
            bool(delivery[mode]["evidence"])
            for mode in REQUIRED_DELIVERY_MODES
        )
    )
    blockers = [g.get("id", "UNKNOWN") for g in hard
                if g.get("status") != "PASS" or not g.get("evidence")]
    owner_accepted = data.get("owner_final_acceptance") == "APPROVED"
    production_permitted = data.get("production_deployment") == "AUTHORIZED"
    if not owner_accepted:
        blockers.append("OWNER_FINAL_ACCEPTANCE")
    if not production_permitted:
        blockers.append("PRODUCTION_AUTHORIZATION")

    # Dedicated-first rollout (Owner DEC-016): standalone may be independently
    # accepted when ALL core security/legal/functionality gates and its own
    # installation test, user/owner acceptance, and separate production
    # authorization are complete. Future SaaS is NOT a prerequisite here.
    standalone = delivery.get("dedicated") if isinstance(delivery, dict) else None
    standalone_ready = (
        isinstance(standalone, dict) and standalone.get("required") is True and
        standalone.get("status") == "PASS" and
        standalone.get("deployment_e2e") == "PASS" and
        isinstance(standalone.get("evidence"), list) and
        bool(standalone["evidence"]) and
        _has_required_gates(hard, REQUIRED_PRODUCT_GATES) and _complete(hard) and
        data.get("live_customer_accounts_created") is True and
        data.get("dedicated_owner_final_acceptance") == "APPROVED" and
        data.get("dedicated_production_deployment") == "AUTHORIZED" and
        data.get("srs_changed") is False
    )
    product_ready = (demo_ready and delivery_ready and
                     _has_required_gates(hard, REQUIRED_PRODUCT_GATES) and _complete(hard) and
                     owner_accepted and production_permitted and
                     data.get("live_customer_accounts_created") is True and
                     data.get("srs_changed") is False)
    if not _has_required_gates(hard, REQUIRED_PRODUCT_GATES):
        blockers.append("REQUIRED_PRODUCT_GATES_MISSING_OR_DUPLICATED")
    if not _has_required_gates(demo, REQUIRED_DEMO_GATES):
        blockers.append("REQUIRED_DEMO_GATES_MISSING_OR_DUPLICATED")
    if not demo_ready:
        blockers.extend(g.get("id", "DEMO_UNKNOWN") for g in demo
                        if g.get("status") != "PASS" or not g.get("evidence"))
    if not delivery_ready:
        if not isinstance(delivery, dict) or set(delivery) != REQUIRED_DELIVERY_MODES:
            blockers.append("REQUIRED_DELIVERY_MODES_MISSING_OR_DUPLICATED")
        for mode in REQUIRED_DELIVERY_MODES:
            v = delivery.get(mode) if isinstance(delivery, dict) else None
            if (not isinstance(v, dict) or v.get("required") is not True or
                    v.get("status") != "PASS" or v.get("deployment_e2e") != "PASS" or
                    not isinstance(v.get("evidence"), list) or not v.get("evidence")):
                blockers.append("DELIVERY_MODE_" + mode.upper() + "_NOT_VERIFIED")
    if data.get("live_customer_accounts_created") is not True:
        blockers.append("REAL_CUSTOMER_IDENTITY_INTEGRATION")

    return {
        "demo_ready": bool(demo_ready),
        "standalone_release_ready": bool(standalone_ready),
        "delivery_modes_ready": bool(delivery_ready),
        "product_ready": bool(product_ready),
        "blockers": sorted(set(blockers)),
        "baseline": data.get("baseline"),
        "release_target": data.get("release_target"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Fail-closed R0 release checklist")
    parser.add_argument("path", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = evaluate_readiness(json.loads(args.path.read_text(encoding="utf-8")))
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print("PRODUCT_READY" if result["product_ready"] else "PRODUCT_NOT_READY")
        print("STANDALONE_RELEASE_READY" if result["standalone_release_ready"]
              else "STANDALONE_RELEASE_NOT_READY")
        print("DEMO_READY" if result["demo_ready"] else "DEMO_NOT_READY")
        for missing in result["blockers"]:
            print("BLOCKED:", missing)
    return 0 if result["product_ready"] else 3


if __name__ == "__main__":
    raise SystemExit(main())
