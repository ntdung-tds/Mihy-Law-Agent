-- R65 read-only QA D1 account/session integrity census.
-- Existing isolated Cloudflare QA D1 only. Do NOT run against production.
-- Aggregates only; never export individual subjects, emails, SIDs or hashes.
SELECT status, COUNT(*) AS n FROM qa_principals GROUP BY status;
SELECT status, COUNT(*) AS n FROM qa_memberships GROUP BY status;
SELECT status, COUNT(*) AS n FROM qa_login_verifiers GROUP BY status;
SELECT COUNT(*) AS current_sessions FROM qa_sessions
 WHERE revoked_at IS NULL AND expires_at > unixepoch();
SELECT COUNT(*) AS active_sessions_without_eligible_identity
 FROM qa_sessions s
 LEFT JOIN qa_principals p
   ON p.installation_id=s.installation_id AND p.user_id=s.user_id AND p.status='active'
 LEFT JOIN qa_memberships m
   ON m.installation_id=s.installation_id AND m.user_id=s.user_id
  AND m.tenant_id=s.tenant_id AND m.status='active'
 LEFT JOIN qa_login_verifiers v
   ON v.installation_id=s.installation_id AND v.user_id=s.user_id
  AND v.subject=s.subject AND v.status='active'
 WHERE s.revoked_at IS NULL AND s.expires_at > unixepoch()
   AND (p.user_id IS NULL OR m.user_id IS NULL OR v.user_id IS NULL);
SELECT COUNT(*) AS orphan_memberships
 FROM qa_memberships m
 LEFT JOIN qa_principals p
   ON p.installation_id=m.installation_id AND p.user_id=m.user_id
 LEFT JOIN qa_tenants t
   ON t.installation_id=m.installation_id AND t.tenant_id=m.tenant_id
 WHERE p.user_id IS NULL OR t.tenant_id IS NULL;
SELECT COUNT(*) AS matter_catalog_rows FROM qa_matter_catalog;
