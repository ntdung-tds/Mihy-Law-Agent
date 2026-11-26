# R289 — Function inventory / PCS reconciliation (2026-11-26)

Public-safe technical inventory only. Baseline inspected: `b3bcbdcb7edb8382c0d172f478cb541fd1ab290b`, branch `gpt/r288-platform-worker-session`, PR #330. Main was `7bddde32e684621b801cc1b3c1f0cdc9752c2cad` and does not contain the later PR stack. Do not restart implementation from main or auto-merge the stack.

Scope: existing `pcs/mihy_scope_gpt_v1.json` (36 target IDs, 18 P0 / 16 P1 / 2 P2); retain 11 UC and separate platform administration already directed in R216. F31 excludes signing only. SRS v1.1.15 unchanged; exact FR/TC trace blocked by inaccessible private SRS. This is not a new SRS or an approval.

PARTIAL = source fragment or QA capability observed; NOT_FOUND = dedicated implementation not identified in bounded source/tree review (not proof of absence); BLOCKED = explicit existing implementation blocker. All 36 remain product E2E NOT_RUN / OWNER_PENDING at this inventory level; historical component test results are preserved separately. No inferred PASS.

| ID | Function | Priority | Inventory | Observed source/evidence | Remaining work / verification |
|---|---|---|---|---|---|
| F01 | Hỏi đáp pháp luật có dẫn nguồn | P0 | PARTIAL | UC09 source-only; no verified public legal corpus | Official source retrieval, exact article/effective-date grounding, refusal and QA. |
| F02 | Nghiên cứu pháp lý chuyên sâu | P1 | PARTIAL | UC05 source-only analysis | Multi-source research, legal memo, verified law and review. |
| F03 | Kiểm tra hiệu lực theo thời điểm | P0 | NOT_FOUND | UC06 explicitly does not determine legal effect | Effective-date and amendment graph with historical snapshots. |
| F04 | Tra cứu án lệ và bản án | P1 | PARTIAL | UC10 searches only user-provided sample text | Official judgment/case-law retrieval, filters and provenance. |
| F05 | Kiểm chứng trích dẫn pháp lý | P0 | PARTIAL | qa_legal_evidence_gpt.mjs literal input references | Verify actual official law citations, version and applicability. |
| F06 | Dự thảo ý kiến tư vấn | P0 | PARTIAL | UC01/UC05/UC09 bounded drafts | Advice workflow with alternatives, risks, missing facts and review. |
| F07 | Đọc PDF, DOCX, ảnh scan | P0 | PARTIAL | documentExtractApi; poc_docx; R154 multi-file memory intake | OCR, durable authorized files, coverage and actual browser E2E. |
| F08 | Trích xuất dữ liệu pháp lý | P0 | PARTIAL | F08 legal workflow and qa_f08_extraction_gpt.mjs | Full real document extraction, provenance and reviewer E2E. |
| F09 | Tóm tắt và hỏi đáp theo hồ sơ | P0 | PARTIAL | UC04/UC09; qa_f09_answer_gpt.mjs | Persisted Matter-linked source context and end-to-end review. |
| F10 | Soạn thảo theo biểu mẫu | P0 | PARTIAL | UC01 draft + qa_uc01_draft_gpt.mjs | Template library, editing, versions, output export and review. |
| F11 | Rà soát và so sánh hợp đồng | P1 | PARTIAL | UC02 + UC06 text QA | Contract-specific compare, DOCX revisions, actual reviewer workflow. |
| F12 | Thẩm định nhiều tài liệu | P2 | PARTIAL | UC08 two text sources; bounded 1–3 input files | Batch due diligence, findings table, document-level provenance. |
| F13 | Phân tích tình tiết và vấn đề | P1 | PARTIAL | UC05/UC08 source analysis | Structured fact/issues, evidence links, arguments and review. |
| F14 | Quản lý và đánh giá chứng cứ | P1 | NOT_FOUND | No dedicated evidence registry verified in tree | Evidence identity, source history, permissions, proof issues. |
| F15 | Lập dòng thời gian vụ việc | P1 | NOT_FOUND | No dedicated timeline implementation verified | Matter event dates, source links, conflicts and ordering. |
| F16 | Kịch bản và chiến lược xử lý | P1 | PARTIAL | UC05/UC08 prompts for risks/questions | Scenario alternatives, constraints, evidence, human decision. |
| F17 | Hỗ trợ hồ sơ tranh tụng | P1 | PARTIAL | UC01 generic source draft | Litigation-specific templates, evidence links and review. |
| F18 | Tiếp nhận khách hàng/CRM | P0 | NOT_FOUND | No dedicated CRM module verified | Client registry, contact history and Matter link under tenant ACL. |
| F19 | Kiểm tra xung đột lợi ích | P0 | NOT_FOUND | No dedicated conflicts registry verified | Party matching, protected results, resolution and audit. |
| F20 | Quản lý hồ sơ vụ việc | P0 | PARTIAL | matter_workspace.mjs; matters.js; receipt filename search R155 | Verify latest CRUD/hide/audit and link evidence, AI, tasks, schedule, fees. |
| F21 | Giao việc và phê duyệt | P0 | PARTIAL | f21_approval_* and review-state code/schema; transition helper not wired | Authorized routes, assignment, review UI, atomic state/audit and E2E. |
| F22 | Lịch, hạn và cảnh báo | P0 | NOT_FOUND | No dedicated calendar/deadline service verified | Matter calendar, due dates, reminders and overdue workflow. |
| F23 | Nhân sự và phân bổ nguồn lực | P1 | PARTIAL | Membership/account foundation | Team assignment, capacity and staffing UI for organizations. |
| F24 | Cổng thông tin khách hàng | P1 | NOT_FOUND | No dedicated client portal verified | Explicit scoped share/upload and revocation; no tenant crossover. |
| F25 | Thời gian và thù lao | P1 | NOT_FOUND | No dedicated timesheet/fee module verified | Time records, fee basis, approval and totals. |
| F26 | Hợp đồng dịch vụ và tài chính | P1 | NOT_FOUND | No dedicated service finance module verified | Quotes, costs, advances, receivables and payment records. |
| F27 | Dashboard và báo cáo | P1 | PARTIAL | web/r0-preview overview and Matter counts | Real scoped reporting, workload, deadlines and finances. |
| F28 | AI Agent đa bước có kiểm soát | P2 | NOT_FOUND | No persisted multistep Agent orchestrator verified | Plan, bounded jobs, approvals, cancellation and trace. |
| F29 | Kho tri thức pháp lý riêng | P1 | NOT_FOUND | No dedicated tenant knowledge retrieval verified | Permissioned private corpus, source/version lifecycle. |
| F30 | Theo dõi thay đổi pháp luật | P1 | NOT_FOUND | No dedicated legal change monitor verified | Official changes, effective dates, impact and alerts. |
| F31 | Tích hợp hệ sinh thái | P1 | PARTIAL | DOCX POC, Google Drive QA adapter; signing excluded | Email/calendar/Word/storage/external API under authorization; no signing. |
| F32 | Không gian tổ chức và tài khoản | P0 | PARTIAL | mobile_auth, account_profile, membership/session and workspace code | Full member administration, external collaborators and role lifecycle. |
| F33 | Phân quyền chi tiết | P0 | PARTIAL | MatterACL, PG RLS, QA D1, approval guards | Complete permission matrix, legal walls, deny/search/export/AI E2E. |
| F34 | An toàn thông tin và kiểm toán | P0 | PARTIAL | Session/ACL and audit-related schemas/guards | End-to-end audit, encryption, retention, export and incident tests. |
| F35 | Lưu trữ, sao lưu và khôi phục | P0 | BLOCKED | Existing Drive QA work paused; no verified restore | Preserve existing pause, specify safe storage/restore; no blind OAuth retry. |
| F36 | Đăng nhập và triển khai | P0 | PARTIAL | Standalone QA auth/kit; R288 platform session and protected UI | Actual platform login/issuer, provisioning/recovery, install/upgrade, real QA. |

## Platform administration (additional scope, R216)
R288 Worker/API/site mount, platform session schema, protected responsive page and synthetic SQLite integration exist. Exact head CI workflow results: [session](https://github.com/ntdung-tds/Mihy-Law-Agent/actions/runs/45798433006), [mobile view](https://github.com/ntdung-tds/Mihy-Law-Agent/actions/runs/45798432993), [DOCX POC](https://github.com/ntdung-tds/Mihy-Law-Agent/actions/runs/45798432916), [DOCX POC](https://github.com/ntdung-tds/Mihy-Law-Agent/actions/runs/45798424454) all success. These are not deployed/authenticated real-device QA. Next implementation: dedicated platform session issuance/login, verified provisioning/revocation and recovery, then actual QA D1 migration and scoped mobile/desktop E2E. System Admin must never access tenant business data or impersonate users. No auto-grants.

## Execution sequence (technical coordination, not a scope change)
1. Preserve R288 code and test evidence; resume platform admin login/session issuer and authenticated QA integration first (latest active priority).
2. F32/F33/F36 identity, member management, permission isolation; F18/F19/F20/F21/F22 CRM, conflicts, matters, approval, deadlines.
3. F07/F08/F09/F10 document intake and R0 AI; F01/F03/F05/F06 grounded sources; remaining P1 then P2 as dependencies permit.
4. F34 security/audit across every slice; F35 explicitly blocked/paused until safe authorized storage work resumes. Integration and release gates remain separate.

Each work package: source review, implementation, positive/negative tests, CI exact head, up to five test/fix rounds (never invent completed rounds), QA deployment only within authorization, evidence and PCS checkpoint. No customer data, secrets, private SRS, signing, automatic stack merge or production deploy. No new application code or product test was performed by this documentation checkpoint. 
