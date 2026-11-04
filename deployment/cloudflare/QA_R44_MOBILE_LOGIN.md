# AI Law R44 — Cloudflare Free Mobile QA login

**Scope accepted by Owner:** Stop after a user can open the live Cloudflare
mobile UI, authenticate with an owner-only synthetic QA credential, see the
post-login dashboard, reload, and sign out. This is NOT the release of the
full legal AI workflows or Google Drive OAuth. Standalone-first DEC-017;
IAICT ordinary customer; SaaS deferred, SRS v1.1.15 unchanged.

## Owner acceptance update — 2026-11-04

- **PASS_OWNER_REPORTED_SIGNIN:** The Owner confirmed in the project conversation that the live AI Law QA mobile sign-in succeeded on a physical phone. This is an Owner statement, not an independently captured Playwright run using the private password.
- **OWNER_CHECK_PENDING:** The Owner did not separately attest reload/session persistence or logout on that device. CI/unit tests for those controls are separate; do not convert them to physical-device PASS.
- **LIMITS:** QA-only; no full SRS IAM, Google Drive OAuth/file uploads, actual legal AI workflows, or production authorization. No private credentials or client data in this document.
- The earlier "NOT_RUN positive Owner login" section below was the **pre-acceptance snapshot** and is superseded only for the successful sign-in claim.

## Live QA entry point

https://ai-law-standalone-cf-qa.iaict-platform.workers.dev/

- Test email: `qa04.lawyer@ai-law.invalid`
- The **R44 Cloudflare-specific random QA password** is saved in
  Owner-only/private Google Drive, in the same restricted QA credentials
  folder. **Do not copy password, salt, hash or private file/Drive URL into
  public GitHub, CI, screenshots or customer documentation.**
- R40 Docker QA passwords and the R41 independent host configuration
  are unchanged. The R44 account reuses QA-04's synthetic identity and
  ordinary IAICT customer membership but uses a **separate** password hash
  because R41's Argon2id login implementation cannot run as-is on the
  free Worker runtime. Only the QA login is available, no actual legal
  case documents are present.
- A logged-in dashboard intentionally shows legal function tiles as
  **Chưa kết nối**. These are not active legal workflow features.

## Implemented now

- Server-side WebCrypto PBKDF2-SHA256 verifier (100,000 iterations; per-account
  random salt) stored in an isolated QA D1 table; the plaintext password
  is not stored in D1, Cloudflare Worker source or GitHub.
- Login POST requires same-origin HTTPS Origin, JSON, a bounded payload,
  and a per-IP HMAC-pseudonymized D1 rate limiter. The rate pepper is
  stored as a Cloudflare Worker secret, not a public variable.
- An active QA principal and an active tenant membership are required to
  mint a random UUID session. The server stores session state in D1 and
  issues an HTTP-only, Secure, SameSite=Strict, 30-minute cookie.
- The dashboard fetches `GET /api/qa/session` after load/reload; the D1
  query rejects disabled principals, revoked memberships, disabled login
  accounts, missing and expired/revoked sessions. It never trusts tenant
  headers from the client.
- `POST /api/qa/logout` requires same-origin request, revokes the
  stored D1 session, clears the cookie and returns to login.
- Responsive flat/block layout tested at 320, 390, 430 and 1440 px with
  real Chromium on actual deployed Cloudflare HTTPS endpoint. CSP restricts
  JS/CSS/connect to same-origin; form and password fields use mobile
  autocomplete, proper labels and legible 16px input text.
- Existing R43 `/v1/runs` and `/v1/files` still require valid
  RS256 Bearer+MatterACL; R44 cookie does NOT bypass that boundary.

## Verification level

- **PASS:** R44 Node tests for successful password verification and
  session creation (synthetic D1 stub), disabled/missing/revoked accounts,
  logout, expiry, strict Origin and rate limiting.
- **PASS:** GitHub Actions live Playwright Chromium over the real QA
  workers.dev URL: responsive rendering, login page, no horizontal
  overflow, anonymous view denied, unknown synthetic email returns actual
  HTTP 401 (verifies denial path on live Worker; PBKDF2 real signature/password logic covered by Node tests),
  refresh still not authenticated.
- **PASS:** Actual Cloudflare D1 has R44 migration tables, QA-04 synthetic
  account verifier, active principal and organization membership.
- **NOT_RUN:** Positive **real production-edge QA password login**
  with the Owner's private R44 password, post-login cookie and reload
  on a physical phone. This **requires Owner interactive acceptance**;
  no private password is submitted to GitHub Actions.
- **NOT_IMPLEMENTED:** Real IdP/MFA, user management/password reset,
  full IAM/RLS SRS parity, Google Drive OAuth or file upload,
  actual legal AI functions/TC12 and production release.

**Regression fixed:** repeated public CI wrong-password submissions to QA-04 reached D1 lockout. Live browser CI now uses a nonexistent email to avoid locking the Owner's login. Unlock QA-04 after final CI and keep lockout policy active.\n\n## Owner phone acceptance

1. Open the exact QA URL above on your Android/iOS browser.
2. Sign in with the R44 synthetic email and the separate private R44
   password saved in your restricted Google Drive folder.
3. Confirm the screen switches to **Không gian làm việc**, shows the
   exact account email, role **Luật sư**, workspace **Tổ chức**.
4. Reload the page and confirm the session persists until logout/
   expiration; tap **Đăng xuất** and confirm the login form reappears.
5. Report any visible error/blank page to the project thread for an
   immediate bounded repair/test loop; the Owner remains final acceptor.

**Do not use this R44 QA password on a real customer or production
environment.** Cloudflare Free/D1 limits and API throttling still apply.
