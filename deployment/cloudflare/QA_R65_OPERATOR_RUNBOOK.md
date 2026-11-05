# R65 — Operator-safe, real QA role E2E gate

**Scope:** Existing isolated Cloudflare QA only, **not production**. R64 has deployed R62 backend and QA site; R63 mobile bottom navigation is Owner-accepted. SRS v1.1.15 unchanged.

## Verified starting state — 2026-11-06

- Connected Cloudflare D1 read-only census: **11 principals** (10 active, 1 disabled); **13 memberships** (12 active, 1 revoked); **2 active login verifiers** (R44 QA04 and a separately Owner-created personal QA account). Zero currently active sessions, zero orphan memberships, zero invalid active sessions, zero QA matter metadata.
- The Owner-private R40 bundle exists in private Google Drive; **its passwords have not been moved into GitHub, CI or Cloudflare tools**. Cloudflare has not activated the remaining R40 verifier entries.
- For the updated installation, after authorized activation of seven R40 active plus one disabled QA07 verifier, expected total is **10 verifiers (9 active, 1 disabled)**: 8 from R40, 1 existing R44 QA04, 1 Owner-created personal actor. This differs from the older R62 count of nine, which preceded the additional Owner account. QA10 belongs to a different installation.
- No authenticated multi-role real Chromium PASS is claimed until it runs with the approved private credential bundle; synthetic test success is not a substitute.

## One bundled private-operator run (not executable by public CI)

1. On an Owner-authorized private workstation, obtain the **R40 private JSON** by the Owner's existing private channel. Put it **outside the GitHub checkout**, with permissions 0600. Never paste credentials, cookies or salted hashes in chat, GitHub, public logs, test reports or browser console. Do not transfer private Drive credentials through one connector to another.
2. Confirm the destination is **only** the intended isolated QA D1. Run the existing idempotent renderer in deployment/cloudflare/tools/render_r62_qa_verifiers.py, according to QA_R62_PROVISION.md, with private local inputs. It **must not** replace QA04, the Owner's personal actor, or import QA10. If no authorized private operator channel exists, record **BLOCKED**.
3. Validate the D1 census without returning identities or secrets. Use deployment/cloudflare/tests/r65_qa_d1_readonly_audit.sql against this QA database. After successful authorized R40 activation expect 9 active + 1 disabled verifier, zero orphan membership and zero invalid active session.
4. Run the private-bundle preflight and **real browser** suite on the same trusted operator machine, with Playwright Chromium installed:

    python -m playwright install chromium
    python deployment/cloudflare/tools/r65_live_role_e2e.py --qa-only --preflight --bundle /private/qa_r40_bundle.json
    python deployment/cloudflare/tools/r65_live_role_e2e.py --qa-only --bundle /private/qa_r40_bundle.json

5. The suite uses **no mocked positive sessions**. It checks QA01, QA02, QA03, QA05, QA06, QA08 and QA09 sign-in, roles, membership isolation, session cookie, display at mobile/desktop sizes, QA02 dual-tenant switch and SID rotation/old-SID revocation, unauthorized organization switch denial and logout revocation. **QA07 disabled** must return HTTP401; HTTP429 is not a false PASS. It prints only QA actor IDs and PASS/FAIL codes, never credentials.
6. Continue other SRS acceptance conditions separately: QA04 existing R44 account via its private channel; disabled/revoked **after** session issuance; natural 30-minute expiry; and positive/negative **MatterACL** using approved synthetic matters (none currently seeded). No production, client matter or Google Drive OAuth activity is allowed.

## Truthful report and owner acceptance

- PASS: scenario actually ran and succeeded in its target environment.
- FAIL: scenario ran and assertion failed; correct code, rerun test.
- BLOCKED: safe credentials/operator channel or infrastructure unavailable.
- NOT_RUN: scenario was not executed; never label preflight or synthetic fixtures as live-user PASS.
- Archive run ID, logs without secrets, sanitized screenshots and statuses in the existing Owner-private AI Law Test Evidence Drive folder. Save a public-safe pointer in PCS. Owner performs final acceptance.

**No production release** or promotion of remaining R62 site modules to public-facing nonproduction Worker until role/tenant checks are PASS and Owner has accepted.
