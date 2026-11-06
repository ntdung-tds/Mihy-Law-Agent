# R72 — QA-only document transfer gate (NOT UC03 acceptance)

R72 implements a bounded **synthetic-only** document upload/list/download path inside the
already-existing nonproduction Cloudflare QA login and MatterACL boundaries. It is
not an authorization to upload real client materials, release production, or
claim full legal-document ingestion.

## Technical contracts

- The browser sends a same-origin multipart POST to /api/qa/documents with
  \`matter_id\` (UUID) and \`file\`; up to 1.5 MB PDF or DOCX. A bounded stream
  reader caps the incoming multipart envelope. Extension/MIME and file signature
  must agree. **Signatures do not certify PDF visibility, OOXML semantics, macros,
  malware safety or text extraction.**
- Session must be active for the installation and selected tenant; an explicit
  current ACL \`write\` allow without matching deny is checked before and after
  the remote upload. A document read/list requires \`read\` with deny precedence.
  Tenant IDs in browser inputs do not control authorization.
- Google Drive OAuth access token and approved root folder must be configured
  independently for this **organization's** QA installation. No tokens are
  kept in the public repository or forwarded to the browser. The existing
  Google Drive Adapter verifies the exact root parent on every read; R72
  adds a private multipart upload and compensation delete for D1 failures.
- D1 \`qa_file_links\` and \`qa_document_receipts\` are inserted together;
  receipt stores synthetic filename, byte count, SHA-256, \`uploaded_by\`,
  creation time and \`verification_status='unverified'\`. Download recomputes
  SHA-256 and refuses mismatched sizes/hashes.
- Uploaded assets are **unverified and excluded from UC03/04/07**. A Working
  Python source parser cannot be invoked by the Cloudflare Worker; that bridge
  remains a separate prerequisite and must not be simulated.
- No Google Drive OAuth consent/renewal flow, antivirus engine, OCR, full DOCX/PDF
  rendered-equivalence proof, real translation provider, approved vocabulary,
  review cycle, exported DOCX, production IAM, payment, or real legal file handling.
  An upload screen is NOT product/legal-AI acceptance.

## Release gates (must all be verified before isolated QA deployment)

1. GitHub PR on final head: all required CI jobs SUCCESS. New
   \`r72_documents.test.mjs\` runs signed-off synthetic file/ACL/Drive tests.
2. Review and back up the *existing isolated AI Law QA D1*; apply
   \`migrations/r72_qa_document_receipts.sql\` only to that D1. Do not touch
   another installation/tenant.
3. Confirm the actual organization's Google OAuth consent, limited Drive scope,
   root folder permission, token storage/rotation and revocation policy.
   ChatGPT's connected Google Drive is not a Cloudflare Worker credential.
4. Deploy only QA backend Worker and QA website with exact GitHub source modules
   and preserved bindings; never overwrite a secret or primary site implicitly.
5. Real QA HTTPS test with authorized **synthetic** PDF/DOCX:
   positive login, create/select matter, upload, list, download byte-for-byte,
   wrong tenant, revoked session/ACL, CSRF, wrong root, token expiry, duplicate
   content, maximum size, orphan cleanup. Record results PASS/FAIL/BLOCKED.
6. Before enabling UC03: implement authorized content inspection from actual
   storage bytes, verify original-source mapping under R70, integrate a vetted AI
   provider and QA/review, then a proper DOCX exporter. Do not enable UC03 by
   changing the "unverified" field without source verification.

## Current release decision

**Do not deploy to QA unless steps 1–3 pass.** At branch creation, the active
Cloudflare QA Worker has DB, installation and session bindings but **no**
GOOGLE_DRIVE_ACCESS_TOKEN or GOOGLE_DRIVE_ROOT_ID. Runtime positive upload
and real Google Drive file read are therefore BLOCKED, not PASS.
Production remains untouched; Owner's final acceptance is required.
