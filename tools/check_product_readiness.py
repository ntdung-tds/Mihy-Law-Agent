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
    if not isinstance(demo, list) or not isinstance(hard, list):
        raise ValueError("Invalid gate collection")

    demo_ready = _complete(demo)
    blockers = [g.get("id", "UNKNOWN") for g in hard
                if g.get("status") != "PASS" or not g.get("evidence")]
    owner_accepted = data.get("owner_final_acceptance") == "APPROVED"
    production_permitted = data.get("production_deployment") == "AUTHORIZED"
    if not owner_accepted:
        blockers.append("OWNER_FINAL_ACCEPTANCE")
    if not production_permitted:
        blockers.append("PRODUCTION_AUTHORIZATION")

    product_ready = (demo_ready and _complete(hard) and
                     owner_accepted and production_permitted and
                     data.get("live_customer_accounts_created") is True and
                     data.get("srs_changed") is False)
    if not demo_ready:
        blockers.extend(g.get("id", "DEMO_UNKNOWN") for g in demo
                        if g.get("status") != "PASS" or not g.get("evidence"))
    if data.get("live_customer_accounts_created") is not True:
        blockers.append("REAL_CUSTOMER_IDENTITY_INTEGRATION")

    return {
        "demo_ready": bool(demo_ready),
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
        print("DEMO_READY" if result["demo_ready"] else "DEMO_NOT_READY")
        for missing in result["blockers"]:
            print("BLOCKED:", missing)
    return 0 if result["product_ready"] else 3


if __name__ == "__main__":
    raise SystemExit(main())
